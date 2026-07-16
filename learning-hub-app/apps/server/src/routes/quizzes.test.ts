import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { createSqliteConnection } from "../db/client.js";
import { quizAttempts, quizzes, reviewItems, topics } from "../db/schema.js";
import type { ChatProvider } from "../llm/types.js";

function testConfig() {
  return loadConfig({
    AWS_REGION: "us-east-2",
    LEARNING_HUB_DIR: "",
    AWS_PROFILE: "",
    DEFAULT_PROVIDER: undefined,
    CONVERSE_MODEL_ID: "",
    MANTLE_MODEL_ID: "",
    MANTLE_BASE_URL: "",
    TAVILY_API_KEY: "",
    PORT: ""
  });
}

describe("quiz routes", () => {
  it("persists attempts, grades MCQ locally, grades free text with provider, and updates review", async () => {
    const connection = createSqliteConnection();
    const provider: ChatProvider = {
      id: "bedrock-converse",
      async *streamChat() {
        await Promise.resolve();
        yield {
          type: "text_delta",
          text: JSON.stringify({
            score: 0.8,
            feedback: "Clear enough, add one concrete example."
          })
        };
        yield { type: "done" };
      }
    };
    const app = createApp(testConfig(), {
      chatProvider: provider,
      database: connection
    });

    try {
      const topic = connection.db
        .insert(topics)
        .values({
          slug: "typescript-basics",
          dirPath: "/tmp/typescript-basics",
          title: "TypeScript Basics"
        })
        .returning()
        .get();
      const quiz = connection.db
        .insert(quizzes)
        .values({
          topicId: topic.id,
          questionsJson: JSON.stringify([
            {
              id: "q1",
              type: "mcq",
              prompt: "Best recall move?",
              options: [
                { id: "read", label: "Read again" },
                { id: "explain", label: "Explain it back" }
              ],
              answer: "explain"
            },
            {
              id: "q2",
              type: "free_text",
              prompt: "Explain values.",
              rubric: "Mentions runtime behavior."
            }
          ])
        })
        .returning()
        .get();

      const response = await app.request(`/api/quizzes/${quiz.id}/attempts`, {
        method: "POST",
        body: JSON.stringify({
          answers: {
            q1: "explain",
            q2: "Values exist at runtime."
          }
        }),
        headers: {
          "content-type": "application/json"
        }
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        attempt: {
          quizId: quiz.id,
          score: 0.9,
          feedback: [
            {
              questionId: "q1",
              correct: true,
              score: 1
            },
            {
              questionId: "q2",
              correct: true,
              score: 0.8,
              feedback: "Clear enough, add one concrete example."
            }
          ]
        }
      });
      expect(
        connection.db.select().from(quizAttempts).where(eq(quizAttempts.quizId, quiz.id)).all()
      ).toHaveLength(1);
      expect(
        connection.db.select().from(reviewItems).where(eq(reviewItems.topicId, topic.id)).all()
      ).toHaveLength(2);
    } finally {
      connection.sqlite.close();
    }
  });
});
