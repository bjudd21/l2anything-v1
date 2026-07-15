import type { ChatStreamEvent } from "@learning-hub/shared";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import type { ChatProvider, ChatProviderRequest } from "../llm/types.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "learning-hub-fixture"
);

function testConfig(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({
    AWS_REGION: "us-east-2",
    LEARNING_HUB_DIR: fixtureRoot,
    AWS_PROFILE: "",
    DEFAULT_PROVIDER: undefined,
    CONVERSE_MODEL_ID: "",
    MANTLE_MODEL_ID: "",
    MANTLE_BASE_URL: "",
    TAVILY_API_KEY: "",
    PORT: "",
    ...overrides
  });
}

async function indexedTopicId(app: ReturnType<typeof createApp>, slug = "typescript-basics") {
  const response = await app.request("/api/topics");
  const body = (await response.json()) as {
    topics: Array<{ id: number; slug: string }>;
  };
  const topic = body.topics.find((item) => item.slug === slug);

  if (!topic) {
    throw new Error(`Topic ${slug} was not indexed.`);
  }

  return topic.id;
}

function parseSse(text: string): ChatStreamEvent[] {
  return text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((packet) => {
      const dataLine = packet.split(/\n/).find((line) => line.startsWith("data: "));

      if (!dataLine) {
        throw new Error(`SSE packet did not include data: ${packet}`);
      }

      return JSON.parse(dataLine.slice("data: ".length)) as ChatStreamEvent;
    });
}

describe("topic chat routes", () => {
  it("streams normalized provider events and persists chat history", async () => {
    const capturedRequests: ChatProviderRequest[] = [];
    const provider: ChatProvider = {
      id: "bedrock-converse",
      async *streamChat(request) {
        await Promise.resolve();
        capturedRequests.push(request);

        if (capturedRequests.length === 1) {
          yield {
            type: "tool_call",
            id: "tool-1",
            name: "read_workspace_file",
            input: { path: "MISSION.md" },
            rawInput: '{"path":"MISSION.md"}'
          };
          yield { type: "done", stopReason: "tool_use" };
          return;
        }

        yield { type: "text_delta", text: "Values " };
        yield { type: "text_delta", text: "exist at runtime." };
        yield { type: "usage", inputTokens: 12, outputTokens: 6, totalTokens: 18 };
        yield { type: "done", stopReason: "end_turn" };
      }
    };
    const app = createApp(testConfig(), { chatProvider: provider });
    const topicId = await indexedTopicId(app);

    const response = await app.request(`/api/topics/${topicId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message: "What is a TypeScript value?" }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const events = parseSse(await response.text());
    expect(events.map((event) => event.type)).toEqual([
      "tool_started",
      "tool_finished",
      "text_delta",
      "text_delta",
      "done"
    ]);
    expect(events[0]).toMatchObject({
      name: "read_workspace_file",
      label: "Read Workspace File"
    });
    expect(events[4]).toMatchObject({
      usage: {
        inputTokens: 12,
        outputTokens: 6,
        totalTokens: 18
      }
    });
    expect(capturedRequests[0]?.messages).toEqual([
      {
        role: "user",
        content: "What is a TypeScript value?"
      }
    ]);
    expect(capturedRequests[0]?.tools.map((tool) => tool.name)).toContain("read_workspace_file");
    expect(capturedRequests[0]?.tools.map((tool) => tool.name)).not.toContain("web_search");
    expect(capturedRequests[0]?.system).toContain("MISSION.md");
    expect(capturedRequests[0]?.system).toContain("RESOURCES.md");
    expect(capturedRequests[0]?.system).toContain("Values are the runtime floor");
    const toolLoopMessages = capturedRequests[1]?.messages;
    expect(toolLoopMessages?.slice(0, 2)).toEqual([
      {
        role: "user",
        content: "What is a TypeScript value?"
      },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tool-1",
            name: "read_workspace_file",
            input: { path: "MISSION.md" },
            rawInput: '{"path":"MISSION.md"}'
          }
        ]
      }
    ]);
    expect(toolLoopMessages?.[2]).toMatchObject({
      role: "tool",
      toolCallId: "tool-1",
      isError: false
    });
    expect(toolLoopMessages?.[2]?.content).toContain("# Mission: TypeScript Basics");

    const sessionId = events[4]?.sessionId;
    expect(sessionId).toEqual(expect.any(Number));

    const history = await app.request(`/api/topics/${topicId}/chat/${sessionId}`);
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toMatchObject({
      ok: true,
      session: {
        id: sessionId,
        topicId
      },
      messages: [
        {
          role: "user",
          content: "What is a TypeScript value?"
        },
        {
          role: "assistant",
          content: "Values exist at runtime."
        }
      ]
    });
  });

  it("streams recoverable AWS auth errors without fabricating an assistant message", async () => {
    const provider: ChatProvider = {
      id: "bedrock-converse",
      async *streamChat() {
        await Promise.resolve();
        yield {
          type: "error",
          code: "aws_auth",
          message: "AWS SSO credentials expired. Run aws sso login for the configured profile.",
          recoverable: true,
          reason: "sso_expired"
        };
      }
    };
    const app = createApp(testConfig(), { chatProvider: provider });
    const topicId = await indexedTopicId(app);

    const response = await app.request(`/api/topics/${topicId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message: "Help me retry this." }),
      headers: {
        "content-type": "application/json"
      }
    });
    const events = parseSse(await response.text());

    expect(events).toEqual([
      expect.objectContaining({
        type: "error",
        code: "aws_auth",
        recoverable: true,
        reason: "sso_expired"
      })
    ]);

    const sessionId = events[0]?.sessionId;
    const history = await app.request(`/api/topics/${topicId}/chat/${sessionId}`);
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toMatchObject({
      messages: [
        {
          role: "user",
          content: "Help me retry this."
        }
      ]
    });
  });
  it("accepts a lesson id returned before the chat route re-indexes the workspace", async () => {
    const provider: ChatProvider = {
      id: "bedrock-converse",
      async *streamChat() {
        await Promise.resolve();
        yield { type: "text_delta", text: "Lesson scoped answer." };
        yield { type: "done", stopReason: "end_turn" };
      }
    };
    const app = createApp(testConfig(), { chatProvider: provider });
    const topicId = await indexedTopicId(app);
    const lessonsResponse = await app.request(`/api/topics/${topicId}/lessons`);
    const lessonsBody = (await lessonsResponse.json()) as {
      lessons: Array<{ id: number; number: number }>;
    };
    const lessonId = lessonsBody.lessons.find((lesson) => lesson.number === 1)?.id;

    expect(lessonId).toEqual(expect.any(Number));

    const response = await app.request(`/api/topics/${topicId}/chat`, {
      method: "POST",
      body: JSON.stringify({ lessonId, message: "Can you help with this lesson?" }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(response.status).toBe(200);

    const events = parseSse(await response.text());
    expect(events.map((event) => event.type)).toEqual(["text_delta", "done"]);

    const history = await app.request(`/api/topics/${topicId}/chat/${events[1]?.sessionId}`);
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toMatchObject({
      session: {
        lessonId
      },
      messages: [
        {
          role: "user",
          content: "Can you help with this lesson?"
        },
        {
          role: "assistant",
          content: "Lesson scoped answer."
        }
      ]
    });
  });
});
