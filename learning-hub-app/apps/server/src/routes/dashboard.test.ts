import { eq } from "drizzle-orm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { createSqliteConnection } from "../db/client.js";
import { reviewItems, topics } from "../db/schema.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "learning-hub-fixture"
);

function testConfig() {
  return loadConfig({
    AWS_REGION: "us-east-2",
    LEARNING_HUB_DIR: fixtureRoot,
    AWS_PROFILE: "",
    DEFAULT_PROVIDER: undefined,
    CONVERSE_MODEL_ID: "",
    MANTLE_MODEL_ID: "",
    MANTLE_BASE_URL: "",
    TAVILY_API_KEY: "",
    PORT: ""
  });
}

describe("dashboard routes", () => {
  it("summarizes topics, recent records, and due review next action", async () => {
    const connection = createSqliteConnection();
    const app = createApp(testConfig(), { database: connection });

    try {
      await app.request("/api/topics");
      const topic = connection.db
        .select()
        .from(topics)
        .where(eq(topics.slug, "typescript-basics"))
        .get();
      if (!topic) {
        throw new Error("Fixture topic was not indexed.");
      }

      connection.db
        .insert(reviewItems)
        .values({
          topicId: topic.id,
          concept: "Explain values",
          dueAt: "2026-01-01T00:00:00.000Z"
        })
        .run();

      const response = await app.request("/api/dashboard");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        dueReviewCount: 1,
        nextAction: {
          label: "Review due items",
          href: "/t/typescript-basics/review"
        },
        topics: [
          {
            slug: "half-scaffolded"
          },
          {
            slug: "typescript-basics",
            reviewItemCount: 1,
            dueReviewCount: 1
          }
        ]
      });
    } finally {
      connection.sqlite.close();
    }
  });

  it("points Up next at the first unfinished lesson when nothing is due", async () => {
    const connection = createSqliteConnection();
    const app = createApp(testConfig(), { database: connection });

    try {
      const response = await app.request("/api/dashboard");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        dueReviewCount: 0,
        nextAction: {
          label: "Open lesson 0001",
          href: "/t/typescript-basics/lessons/1"
        }
      });
    } finally {
      connection.sqlite.close();
    }
  });
});
