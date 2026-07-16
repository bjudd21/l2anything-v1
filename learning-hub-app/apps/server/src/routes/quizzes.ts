import {
  quizAttemptRequestSchema,
  quizAttemptResponseSchema,
  quizQuestionSchema,
  type QuizQuestion
} from "@learning-hub/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { ServerConfig } from "../config.js";
import type { AppDatabase } from "../db/client.js";
import { quizAttempts, quizzes, reviewItems } from "../db/schema.js";
import type { ChatProvider } from "../llm/types.js";
import { nextReviewSchedule } from "../review/scheduler.js";
import { createConfiguredChatProvider } from "./settings.js";

export interface QuizRouteDependencies {
  chatProvider?: ChatProvider;
  config: ServerConfig;
  db: AppDatabase;
}

interface QuestionFeedback {
  correct: boolean;
  feedback: string;
  questionId: string;
  score: number;
}

function parsePositiveId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function createGradingProvider(dependencies: QuizRouteDependencies) {
  if (dependencies.chatProvider) {
    return dependencies.chatProvider;
  }

  return createConfiguredChatProvider({
    config: dependencies.config,
    db: dependencies.db
  });
}

function parseQuestions(questionsJson: string) {
  const parsed = JSON.parse(questionsJson) as unknown;
  return quizQuestionSchema.array().parse(parsed);
}

function cleanNotFound(message: string) {
  return {
    ok: false,
    error: "not_found",
    message
  };
}

function boundedScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

async function gradeWithProvider(
  provider: ChatProvider,
  question: Extract<QuizQuestion, { type: "free_text" | "explain_back" }>,
  answer: string
): Promise<QuestionFeedback> {
  let text = "";

  for await (const event of provider.streamChat({
    system:
      "Grade the learner answer against the rubric. Return compact JSON with score from 0 to 1 and feedback.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          prompt: question.prompt,
          rubric: question.rubric,
          answer
        })
      }
    ],
    tools: [],
    maxTokens: 500
  })) {
    if (event.type === "text_delta") {
      text += event.text;
    }
  }

  try {
    const parsed = JSON.parse(text) as { feedback?: unknown; score?: unknown };
    const score = boundedScore(parsed.score);
    return {
      questionId: question.id,
      score,
      correct: score >= 0.7,
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "Answer graded."
    };
  } catch {
    return {
      questionId: question.id,
      score: 0,
      correct: false,
      feedback: text.trim() || "Provider grading did not return feedback."
    };
  }
}

function gradeMcq(question: Extract<QuizQuestion, { type: "mcq" }>, answer: string) {
  const correct = answer === question.answer;

  return {
    questionId: question.id,
    score: correct ? 1 : 0,
    correct,
    feedback: correct ? "Correct." : "Review this concept and try again."
  };
}

function upsertReviewItem(
  db: AppDatabase,
  quiz: typeof quizzes.$inferSelect,
  question: QuizQuestion,
  correct: boolean
) {
  const existing = db
    .select()
    .from(reviewItems)
    .where(eq(reviewItems.topicId, quiz.topicId))
    .all()
    .find((item) => item.concept === question.prompt);
  const next = nextReviewSchedule({
    correct,
    ease: existing?.ease,
    intervalDays: existing?.intervalDays
  });

  if (existing) {
    db.update(reviewItems)
      .set({
        ...next,
        sourceQuizId: quiz.id
      })
      .where(eq(reviewItems.id, existing.id))
      .run();
    return;
  }

  db.insert(reviewItems)
    .values({
      topicId: quiz.topicId,
      concept: question.prompt,
      sourceQuizId: quiz.id,
      ease: next.ease,
      intervalDays: next.intervalDays,
      dueAt: next.dueAt
    })
    .run();
}

export function createQuizRoutes(dependencies: QuizRouteDependencies) {
  const routes = new Hono();

  routes.post("/:id/attempts", async (context) => {
    const quizId = parsePositiveId(context.req.param("id"));
    if (!quizId) {
      return context.json(cleanNotFound("Quiz id is invalid."), 404);
    }

    const quiz = dependencies.db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) {
      return context.json(cleanNotFound("Quiz is not available."), 404);
    }

    const parsed = quizAttemptRequestSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(
        {
          ok: false,
          error: "invalid_quiz_attempt",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        400
      );
    }

    const provider = createGradingProvider(dependencies);
    const questions = parseQuestions(quiz.questionsJson);
    const feedback: QuestionFeedback[] = [];

    for (const question of questions) {
      const answer = parsed.data.answers[question.id] ?? "";
      const result =
        question.type === "mcq"
          ? gradeMcq(question, answer)
          : await gradeWithProvider(provider, question, answer);

      feedback.push(result);
      upsertReviewItem(dependencies.db, quiz, question, result.correct);
    }

    const score = feedback.reduce((total, item) => total + item.score, 0) / feedback.length;
    const attempt = dependencies.db
      .insert(quizAttempts)
      .values({
        quizId,
        answersJson: JSON.stringify({
          answers: parsed.data.answers,
          feedback
        }),
        score
      })
      .returning()
      .get();

    return context.json(
      quizAttemptResponseSchema.parse({
        ok: true,
        attempt: {
          id: attempt.id,
          quizId,
          score,
          feedback,
          createdAt: attempt.createdAt
        }
      })
    );
  });

  return routes;
}
