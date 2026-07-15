import {
  chatHistoryResponseSchema,
  chatRequestSchema,
  chatStreamEventSchema,
  type ChatStreamEvent,
  type ChatUsage
} from "@learning-hub/shared";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { ServerConfig } from "../config.js";
import type { AppDatabase } from "../db/client.js";
import { chatMessages, chatSessions, lessonsIndex, topics } from "../db/schema.js";
import { runTutorAgent } from "../llm/agent.js";
import { buildTutorContext } from "../llm/context.js";
import type { AgentMessage, ChatProvider } from "../llm/types.js";
import { createTutorToolRegistry } from "../llm/tools/registry.js";
import { indexWorkspace } from "../workspace/indexer.js";
import { createConfiguredChatProvider } from "./settings.js";

export interface TopicChatRouteDependencies {
  chatProvider?: ChatProvider;
  config: ServerConfig;
  db: AppDatabase;
}

interface StoredChatContent {
  text: string;
}

function parsePositiveId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanNotFound(message: string) {
  return {
    ok: false,
    error: "not_found",
    message
  };
}

function syncWorkspace({ config, db }: TopicChatRouteDependencies) {
  if (!config.LEARNING_HUB_DIR) {
    return false;
  }

  indexWorkspace(db, config.LEARNING_HUB_DIR);
  return true;
}

function getTopic(dependencies: TopicChatRouteDependencies, id: number) {
  if (!syncWorkspace(dependencies)) {
    return null;
  }

  return dependencies.db.select().from(topics).where(eq(topics.id, id)).get() ?? null;
}

function getLesson(db: AppDatabase, topicId: number, lessonId: number | undefined) {
  if (!lessonId) {
    return undefined;
  }

  return (
    db
      .select()
      .from(lessonsIndex)
      .where(and(eq(lessonsIndex.topicId, topicId), eq(lessonsIndex.id, lessonId)))
      .get() ?? null
  );
}

function serializeContent(text: string) {
  return JSON.stringify({ text } satisfies StoredChatContent);
}

function deserializeContent(contentJson: string) {
  try {
    const parsed = JSON.parse(contentJson) as Partial<StoredChatContent>;
    return typeof parsed.text === "string" ? parsed.text : "";
  } catch {
    return "";
  }
}

function createChatProvider(dependencies: TopicChatRouteDependencies) {
  if (dependencies.chatProvider) {
    return dependencies.chatProvider;
  }

  return createConfiguredChatProvider({
    config: dependencies.config,
    db: dependencies.db
  });
}

function findOrCreateSession(
  db: AppDatabase,
  topicId: number,
  sessionId: number | undefined,
  lessonId: number | undefined
) {
  if (sessionId) {
    return (
      db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.topicId, topicId)))
        .get() ?? null
    );
  }

  return db
    .insert(chatSessions)
    .values({
      topicId,
      lessonId: lessonId ?? null
    })
    .returning()
    .get();
}

function insertMessage(
  db: AppDatabase,
  sessionId: number,
  role: "user" | "assistant",
  content: string
) {
  return db
    .insert(chatMessages)
    .values({
      sessionId,
      role,
      contentJson: serializeContent(content)
    })
    .returning()
    .get();
}

function listMessages(db: AppDatabase, sessionId: number) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.id))
    .all();
}

function toAgentMessages(db: AppDatabase, sessionId: number): AgentMessage[] {
  return listMessages(db, sessionId).map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: deserializeContent(message.contentJson)
  }));
}

function toHistoryMessages(db: AppDatabase, sessionId: number) {
  return listMessages(db, sessionId).map((message) => ({
    id: message.id,
    sessionId: message.sessionId,
    role: message.role === "assistant" ? "assistant" : "user",
    content: deserializeContent(message.contentJson),
    createdAt: message.createdAt
  }));
}

function encodeSse(event: ChatStreamEvent) {
  const parsed = chatStreamEventSchema.parse(event);
  return `event: ${parsed.type}\ndata: ${JSON.stringify(parsed)}\n\n`;
}

function usageFromEvent(
  usage: ChatUsage,
  event: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
) {
  return {
    ...usage,
    inputTokens: event.inputTokens ?? usage.inputTokens,
    outputTokens: event.outputTokens ?? usage.outputTokens,
    totalTokens: event.totalTokens ?? usage.totalTokens
  };
}

function streamChat(
  dependencies: TopicChatRouteDependencies,
  topic: typeof topics.$inferSelect,
  session: typeof chatSessions.$inferSelect,
  lessonId: number | undefined
) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(encodeSse({ ...event, sessionId: session.id })));
      };

      let assistantText = "";
      let usage: ChatUsage = {};
      let stopReason: string | undefined;
      let failed = false;

      try {
        const provider = createChatProvider(dependencies);
        const context = buildTutorContext({
          db: dependencies.db,
          lessonId,
          topic
        });
        const tools = createTutorToolRegistry({
          config: dependencies.config,
          db: dependencies.db,
          topic
        });

        for await (const event of runTutorAgent({
          provider,
          system: context.system,
          messages: toAgentMessages(dependencies.db, session.id),
          tools,
          maxTokens: 1600
        })) {
          if (event.type === "text_delta") {
            assistantText += event.text;
            emit({
              type: "text_delta",
              text: event.text
            });
            continue;
          }

          if (event.type === "tool_started") {
            emit({
              type: "tool_started",
              name: event.name,
              label: event.label
            });
            continue;
          }

          if (event.type === "tool_finished") {
            emit({
              type: "tool_finished",
              name: event.name,
              label: event.label
            });
            continue;
          }

          if (event.type === "tool_error") {
            continue;
          }

          if (event.type === "artifact_created") {
            emit(event);
            continue;
          }

          if (event.type === "usage") {
            usage = usageFromEvent(usage, event);
            continue;
          }

          if (event.type === "done") {
            stopReason = event.stopReason;
            continue;
          }

          if (event.type === "error") {
            failed = true;
            emit({
              type: "error",
              code: event.code,
              message: event.message,
              recoverable: event.recoverable,
              reason: event.reason
            });
            break;
          }
        }

        if (!failed) {
          const message = assistantText.trim()
            ? insertMessage(dependencies.db, session.id, "assistant", assistantText)
            : undefined;

          emit({
            type: "done",
            messageId: message?.id,
            stopReason,
            usage: Object.keys(usage).length ? usage : undefined
          });
        }
      } catch (error) {
        emit({
          type: "error",
          code: "provider_error",
          message: error instanceof Error ? error.message : "Chat stream failed.",
          recoverable: false
        });
      } finally {
        controller.close();
      }
    }
  });
}

export function createTopicChatRoutes(dependencies: TopicChatRouteDependencies) {
  const routes = new Hono();

  routes.post("/", async (context) => {
    const topicId = parsePositiveId(context.req.param("id"));
    if (!topicId) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, topicId);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const parsed = chatRequestSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(
        {
          ok: false,
          error: "invalid_chat_request",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        400
      );
    }

    const lesson = getLesson(dependencies.db, topic.id, parsed.data.lessonId);
    if (lesson === null) {
      return context.json(cleanNotFound("Lesson is not indexed for this topic."), 404);
    }

    const session = findOrCreateSession(
      dependencies.db,
      topic.id,
      parsed.data.sessionId,
      parsed.data.lessonId
    );
    if (!session) {
      return context.json(cleanNotFound("Chat session is not available for this topic."), 404);
    }

    insertMessage(dependencies.db, session.id, "user", parsed.data.message);

    return new Response(streamChat(dependencies, topic, session, lesson?.id), {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no"
      }
    });
  });

  routes.get("/:sessionId", (context) => {
    const topicId = parsePositiveId(context.req.param("id"));
    const sessionId = parsePositiveId(context.req.param("sessionId"));
    if (!topicId || !sessionId) {
      return context.json(cleanNotFound("Chat session is not available."), 404);
    }

    const topic = getTopic(dependencies, topicId);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const session = dependencies.db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.topicId, topic.id)))
      .get();
    if (!session) {
      return context.json(cleanNotFound("Chat session is not indexed for this topic."), 404);
    }

    return context.json(
      chatHistoryResponseSchema.parse({
        ok: true,
        session: {
          id: session.id,
          topicId: session.topicId,
          lessonId: session.lessonId,
          createdAt: session.createdAt
        },
        messages: toHistoryMessages(dependencies.db, session.id)
      })
    );
  });

  return routes;
}
