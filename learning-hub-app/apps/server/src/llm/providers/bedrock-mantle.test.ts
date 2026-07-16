import { describe, expect, it } from "vitest";
import {
  BedrockMantleProvider,
  MantleTokenCache,
  normalizeMantleResponseStream,
  type MantleResponsesClient
} from "./bedrock-mantle.js";
import type { AgentEvent, ChatProviderRequest } from "../types.js";

async function collect(stream: AsyncIterable<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

async function* streamFrom<T>(events: T[]) {
  await Promise.resolve();
  for (const event of events) {
    yield event;
  }
}

function testRequest(): ChatProviderRequest {
  return {
    system: "You are concise.",
    messages: [{ role: "user", content: "Teach values." }],
    tools: [
      {
        name: "read_workspace_file",
        description: "Read a file.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" }
          },
          required: ["path"]
        }
      }
    ],
    maxTokens: 256
  };
}

describe("Bedrock Mantle provider", () => {
  it("requests GPT-5.6 Sol with medium reasoning effort", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const client: MantleResponsesClient = {
      responses: {
        stream(body) {
          requestBody = body;
          return streamFrom([
            {
              type: "response.completed",
              response: {}
            }
          ]);
        }
      }
    };
    const provider = new BedrockMantleProvider({
      baseUrl: "https://bedrock-mantle.us-east-2.api.aws/openai/v1",
      client,
      modelId: "openai.gpt-5.6-sol",
      region: "us-east-2"
    });

    await collect(provider.streamChat(testRequest()));

    expect(requestBody).toMatchObject({
      model: "openai.gpt-5.6-sol",
      reasoning: { effort: "medium" }
    });
  });

  it("normalizes text, function calls, usage, and done events", async () => {
    const stream = streamFrom([
      {
        type: "response.output_text.delta",
        delta: "Values "
      },
      {
        type: "response.function_call_arguments.done",
        item_id: "call-1",
        name: "read_workspace_file",
        arguments: '{"path":"MISSION.md"}'
      },
      {
        type: "response.completed",
        response: {
          usage: {
            input_tokens: 11,
            output_tokens: 5,
            total_tokens: 16
          }
        }
      }
    ]);

    await expect(collect(normalizeMantleResponseStream(stream))).resolves.toEqual([
      { type: "text_delta", text: "Values " },
      {
        type: "tool_call",
        id: "call-1",
        name: "read_workspace_file",
        input: { path: "MISSION.md" },
        rawInput: '{"path":"MISSION.md"}'
      },
      {
        type: "usage",
        inputTokens: 11,
        outputTokens: 5,
        totalTokens: 16
      },
      { type: "done" }
    ]);
  });

  it("caches Mantle bearer tokens until expiry", async () => {
    let now = 1000;
    let calls = 0;
    const cache = new MantleTokenCache({
      now: () => now,
      ttlMs: 100,
      generator: () => {
        calls += 1;
        return Promise.resolve(`token-${calls}`);
      }
    });

    await expect(cache.getToken()).resolves.toBe("token-1");
    await expect(cache.getToken()).resolves.toBe("token-1");
    now = 1200;
    await expect(cache.getToken()).resolves.toBe("token-2");
    expect(calls).toBe(2);
  });

  it("invalidates the Mantle token cache and retries once on 401", async () => {
    let tokenCalls = 0;
    let streamCalls = 0;
    const tokenCache = new MantleTokenCache({
      generator: () => {
        tokenCalls += 1;
        return Promise.resolve(`token-${tokenCalls}`);
      }
    });
    const client: MantleResponsesClient = {
      responses: {
        stream() {
          streamCalls += 1;

          if (streamCalls === 1) {
            const error = new Error("401 unauthorized");
            Object.assign(error, { status: 401 });
            throw error;
          }

          return streamFrom([
            {
              type: "response.output_text.delta",
              delta: "Recovered"
            },
            {
              type: "response.completed",
              response: {}
            }
          ]);
        }
      }
    };
    const provider = new BedrockMantleProvider({
      baseUrl: "https://bedrock-mantle.us-east-2.api.aws/openai/v1",
      client,
      modelId: "openai.gpt-5.6-sol",
      region: "us-east-2",
      tokenCache
    });

    await expect(collect(provider.streamChat(testRequest()))).resolves.toEqual([
      { type: "text_delta", text: "Recovered" },
      { type: "done" }
    ]);
    expect(tokenCalls).toBe(2);
    expect(streamCalls).toBe(2);
  });

  it("returns recoverable auth errors when token generation fails", async () => {
    const tokenCache = new MantleTokenCache({
      generator: () => {
        const error = new Error("The SSO session associated with this profile has expired");
        error.name = "TokenRefreshRequired";
        return Promise.reject(error);
      }
    });
    const client: MantleResponsesClient = {
      responses: {
        stream() {
          return streamFrom([]);
        }
      }
    };
    const provider = new BedrockMantleProvider({
      baseUrl: "https://bedrock-mantle.us-east-2.api.aws/openai/v1",
      client,
      modelId: "openai.gpt-5.6-sol",
      region: "us-east-2",
      tokenCache
    });

    await expect(collect(provider.streamChat(testRequest()))).resolves.toEqual([
      {
        type: "error",
        code: "aws_auth",
        reason: "sso_expired",
        message: "AWS SSO credentials expired. Run aws sso login for the configured profile.",
        recoverable: true
      }
    ]);
  });
});
