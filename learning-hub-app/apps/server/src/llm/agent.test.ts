import { describe, expect, it, vi } from "vitest";
import { runTutorAgent } from "./agent.js";
import type { AgentEvent, ChatProvider, ChatProviderRequest } from "./types.js";
import type { TutorToolRegistry } from "./tools/registry.js";
import { ToolExecutionError } from "./tools/types.js";

async function collect(stream: AsyncIterable<unknown>) {
  const events: unknown[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

async function* events(items: AgentEvent[]) {
  await Promise.resolve();
  for (const item of items) {
    yield item;
  }
}

function registry(overrides: Partial<TutorToolRegistry> = {}): TutorToolRegistry {
  return {
    specs: [
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
    execute: vi.fn(() =>
      Promise.resolve({
        content: "Mission content.",
        data: {
          path: "MISSION.md"
        }
      })
    ),
    ...overrides
  };
}

describe("runTutorAgent", () => {
  it("executes tool calls, streams tool events, and feeds results back to the provider", async () => {
    const requests: ChatProviderRequest[] = [];
    const execute = vi.fn(() =>
      Promise.resolve({
        content: "Mission content.",
        data: {
          path: "MISSION.md"
        }
      })
    );
    const tools = registry({ execute });
    const provider: ChatProvider = {
      id: "bedrock-converse",
      streamChat(request) {
        requests.push(request);

        if (requests.length === 1) {
          return events([
            {
              type: "tool_call",
              id: "tool-1",
              name: "read_workspace_file",
              input: { path: "MISSION.md" },
              rawInput: '{"path":"MISSION.md"}'
            },
            { type: "done", stopReason: "tool_use" }
          ]);
        }

        return events([
          { type: "text_delta", text: "Mission read." },
          { type: "usage", inputTokens: 10, outputTokens: 4, totalTokens: 14 },
          { type: "done", stopReason: "end_turn" }
        ]);
      }
    };

    await expect(
      collect(
        runTutorAgent({
          messages: [{ role: "user", content: "Read the mission." }],
          provider,
          system: "System",
          tools
        })
      )
    ).resolves.toEqual([
      { type: "tool_started", name: "read_workspace_file", label: "Read Workspace File" },
      { type: "tool_finished", name: "read_workspace_file", label: "Read Workspace File" },
      { type: "text_delta", text: "Mission read." },
      { type: "usage", inputTokens: 10, outputTokens: 4, totalTokens: 14 },
      { type: "done", stopReason: "end_turn" }
    ]);
    expect(execute).toHaveBeenCalledWith("read_workspace_file", { path: "MISSION.md" });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.tools.map((tool) => tool.name)).toEqual(["read_workspace_file"]);
    expect(requests[1]?.messages).toEqual([
      { role: "user", content: "Read the mission." },
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
      },
      {
        role: "tool",
        content: JSON.stringify({
          ok: true,
          content: "Mission content.",
          data: {
            path: "MISSION.md"
          }
        }),
        isError: false,
        toolCallId: "tool-1"
      }
    ]);
  });

  it("feeds tool failures back as tool messages so the model can recover", async () => {
    const requests: ChatProviderRequest[] = [];
    const execute = vi.fn(() =>
      Promise.reject(new ToolExecutionError("path_scope", "Path escapes workspace root."))
    );
    const tools = registry({
      execute
    });
    const provider: ChatProvider = {
      id: "bedrock-converse",
      streamChat(request) {
        requests.push(request);

        if (requests.length === 1) {
          return events([
            {
              type: "tool_call",
              id: "tool-1",
              name: "read_workspace_file",
              input: { path: "../MISSION.md" },
              rawInput: '{"path":"../MISSION.md"}'
            },
            { type: "done", stopReason: "tool_use" }
          ]);
        }

        return events([{ type: "done", stopReason: "end_turn" }]);
      }
    };

    await expect(
      collect(
        runTutorAgent({
          messages: [{ role: "user", content: "Read outside the topic." }],
          provider,
          system: "System",
          tools
        })
      )
    ).resolves.toEqual([
      { type: "tool_started", name: "read_workspace_file", label: "Read Workspace File" },
      { type: "tool_finished", name: "read_workspace_file", label: "Read Workspace File" },
      {
        type: "tool_error",
        code: "path_scope",
        label: "Read Workspace File",
        message: "Path escapes workspace root.",
        name: "read_workspace_file"
      },
      { type: "done", stopReason: "end_turn" }
    ]);
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: "tool",
      content: JSON.stringify({
        ok: false,
        code: "path_scope",
        message: "Path escapes workspace root."
      }),
      isError: true,
      toolCallId: "tool-1"
    });
  });

  it("stops deterministic runaway tool loops at the configured cap", async () => {
    const execute = vi.fn(() =>
      Promise.resolve({
        content: "Mission content.",
        data: {
          path: "MISSION.md"
        }
      })
    );
    const tools = registry({ execute });
    const provider: ChatProvider = {
      id: "bedrock-converse",
      streamChat() {
        return events([
          {
            type: "tool_call",
            id: crypto.randomUUID(),
            name: "read_workspace_file",
            input: { path: "MISSION.md" },
            rawInput: '{"path":"MISSION.md"}'
          },
          { type: "done", stopReason: "tool_use" }
        ]);
      }
    };

    await expect(
      collect(
        runTutorAgent({
          maxIterations: 2,
          messages: [{ role: "user", content: "Loop." }],
          provider,
          system: "System",
          tools
        })
      )
    ).resolves.toEqual([
      { type: "tool_started", name: "read_workspace_file", label: "Read Workspace File" },
      { type: "tool_finished", name: "read_workspace_file", label: "Read Workspace File" },
      { type: "tool_started", name: "read_workspace_file", label: "Read Workspace File" },
      { type: "tool_finished", name: "read_workspace_file", label: "Read Workspace File" },
      {
        type: "error",
        code: "provider_error",
        message: "Tutor tool iteration limit reached (2).",
        recoverable: false
      }
    ]);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
