import type {
  ConverseStreamCommandInput,
  ConverseStreamCommandOutput,
  ConverseStreamOutput
} from "@aws-sdk/client-bedrock-runtime";
import { describe, expect, it } from "vitest";
import {
  BedrockConverseProvider,
  normalizeConverseStream,
  type ConverseStreamClient
} from "./bedrock-converse.js";
import type { AgentEvent, ChatProviderRequest } from "../types.js";

async function collect(stream: AsyncIterable<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

async function* streamFrom(events: ConverseStreamOutput[]) {
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

describe("Bedrock Converse provider", () => {
  it("normalizes text, tool calls, usage, and done events", async () => {
    const stream: ConverseStreamOutput[] = [
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { text: "Values " }
        }
      },
      {
        contentBlockStart: {
          contentBlockIndex: 1,
          start: {
            toolUse: {
              toolUseId: "tool-1",
              name: "read_workspace_file"
            }
          }
        }
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 1,
          delta: { toolUse: { input: '{"path":' } }
        }
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 1,
          delta: { toolUse: { input: '"MISSION.md"}' } }
        }
      },
      {
        contentBlockStop: {
          contentBlockIndex: 1
        }
      },
      {
        metadata: {
          usage: {
            inputTokens: 12,
            outputTokens: 4,
            totalTokens: 16
          },
          metrics: {
            latencyMs: 30
          }
        }
      },
      {
        messageStop: {
          stopReason: "end_turn"
        }
      }
    ];

    await expect(collect(normalizeConverseStream(streamFrom(stream)))).resolves.toEqual([
      { type: "text_delta", text: "Values " },
      {
        type: "tool_call",
        id: "tool-1",
        name: "read_workspace_file",
        input: { path: "MISSION.md" },
        rawInput: '{"path":"MISSION.md"}'
      },
      {
        type: "usage",
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16
      },
      { type: "done", stopReason: "end_turn" }
    ]);
  });

  it("turns stream exceptions into normalized error events", async () => {
    const stream = [
      {
        modelStreamErrorException: {
          message: "stream failed"
        }
      } as unknown as ConverseStreamOutput
    ];

    await expect(collect(normalizeConverseStream(streamFrom(stream)))).resolves.toEqual([
      {
        type: "error",
        code: "provider_error",
        message: "stream failed",
        recoverable: true
      }
    ]);
  });

  it("groups all tool results for one assistant turn into a single user message", async () => {
    let captured: ConverseStreamCommandInput | undefined;
    const client: ConverseStreamClient = {
      send(command) {
        captured = command.input;
        return Promise.resolve({
          stream: streamFrom([{ messageStop: { stopReason: "end_turn" } }])
        } as unknown as Pick<ConverseStreamCommandOutput, "stream">);
      }
    };
    const provider = new BedrockConverseProvider({
      client,
      modelId: "anthropic.test",
      region: "us-east-2"
    });

    await collect(
      provider.streamChat({
        system: "You are concise.",
        messages: [
          { role: "user", content: "Generate the lesson." },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "tool-1", name: "fetch_url", input: { url: "https://a.example" }, rawInput: "{}" },
              { id: "tool-2", name: "fetch_url", input: { url: "https://b.example" }, rawInput: "{}" }
            ]
          },
          { role: "tool", content: "A", toolCallId: "tool-1" },
          { role: "tool", content: "B", toolCallId: "tool-2", isError: true }
        ],
        tools: []
      })
    );

    expect(captured?.messages).toHaveLength(3);
    expect(captured?.messages?.[2]).toEqual({
      role: "user",
      content: [
        { toolResult: { toolUseId: "tool-1", content: [{ text: "A" }], status: "success" } },
        { toolResult: { toolUseId: "tool-2", content: [{ text: "B" }], status: "error" } }
      ]
    });
  });

  it("returns recoverable auth errors when the AWS client rejects", async () => {
    const client: ConverseStreamClient = {
      send() {
        const error = new Error("Could not load credentials from any providers");
        error.name = "CredentialsProviderError";
        return Promise.reject(error);
      }
    };
    const provider = new BedrockConverseProvider({
      client,
      modelId: "anthropic.test",
      region: "us-east-2"
    });

    await expect(collect(provider.streamChat(testRequest()))).resolves.toEqual([
      {
        type: "error",
        code: "aws_auth",
        reason: "no_credentials",
        message: "AWS credentials were not found for the configured profile.",
        recoverable: true
      }
    ]);
  });
});
