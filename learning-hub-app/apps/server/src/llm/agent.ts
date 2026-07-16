import type { AwsCredentialReason } from "@learning-hub/shared";
import type { AgentMessage, AgentToolCall, ChatProvider } from "./types.js";
import type { TutorToolRegistry } from "./tools/registry.js";
import { ToolExecutionError } from "./tools/types.js";

export const defaultTutorToolIterationLimit = 12;

export type TutorAgentEvent =
  | {
      type: "text_delta";
      text: string;
    }
  | {
      type: "tool_started";
      label: string;
      name: string;
    }
  | {
      type: "tool_finished";
      label: string;
      name: string;
    }
  | {
      type: "tool_error";
      code: string;
      label: string;
      message: string;
      name: string;
    }
  | {
      type: "artifact_created";
      kind: "lesson" | "record" | "quiz" | "reference";
      ref: string;
    }
  | {
      type: "usage";
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    }
  | {
      type: "done";
      stopReason?: string;
    }
  | {
      type: "error";
      code: "aws_auth" | "provider_config" | "provider_error";
      message: string;
      recoverable: boolean;
      reason?: AwsCredentialReason;
    };

export interface RunTutorAgentOptions {
  maxIterations?: number;
  maxTokens?: number;
  messages: AgentMessage[];
  provider: ChatProvider;
  system: string;
  tools: TutorToolRegistry;
}

function toolLabel(name: string) {
  return name
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toolResultMessage(toolCallId: string, content: unknown, isError = false): AgentMessage {
  return {
    role: "tool",
    content: JSON.stringify(content),
    isError,
    toolCallId
  };
}

function toolErrorPayload(error: unknown) {
  if (error instanceof ToolExecutionError) {
    return {
      ok: false,
      code: error.code,
      message: error.message
    };
  }

  return {
    ok: false,
    code: "tool_error",
    message: error instanceof Error ? error.message : "Tutor tool failed."
  };
}

async function* executeTool(
  tools: TutorToolRegistry,
  toolCall: AgentToolCall
): AsyncIterable<TutorAgentEvent | AgentMessage> {
  const label = toolLabel(toolCall.name);

  yield {
    type: "tool_started",
    name: toolCall.name,
    label
  };

  try {
    const result = await tools.execute(toolCall.name, toolCall.input);

    yield {
      type: "tool_finished",
      name: toolCall.name,
      label
    };

    if (result.artifact) {
      yield {
        type: "artifact_created",
        kind: result.artifact.kind,
        ref: result.artifact.ref
      };
    }

    yield toolResultMessage(toolCall.id, {
      ok: true,
      content: result.content,
      data: result.data ?? null
    });
  } catch (error) {
    yield {
      type: "tool_finished",
      name: toolCall.name,
      label
    };

    const payload = toolErrorPayload(error);
    yield {
      type: "tool_error",
      code: payload.code,
      label,
      message: payload.message,
      name: toolCall.name
    };

    yield toolResultMessage(toolCall.id, payload, true);
  }
}

function isAgentMessage(value: TutorAgentEvent | AgentMessage): value is AgentMessage {
  return "role" in value;
}

export async function* runTutorAgent({
  maxIterations = defaultTutorToolIterationLimit,
  maxTokens,
  messages,
  provider,
  system,
  tools
}: RunTutorAgentOptions): AsyncIterable<TutorAgentEvent> {
  const workingMessages = [...messages];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let assistantText = "";
    let stopReason: string | undefined;
    const toolCalls: AgentToolCall[] = [];
    const toolMessages: AgentMessage[] = [];

    for await (const event of provider.streamChat({
      system,
      messages: [...workingMessages],
      tools: tools.specs,
      maxTokens
    })) {
      if (event.type === "text_delta") {
        assistantText += event.text;
        yield event;
        continue;
      }

      if (event.type === "tool_call") {
        const toolCall: AgentToolCall = {
          id: event.id,
          input: event.input,
          name: event.name,
          rawInput: event.rawInput
        };
        toolCalls.push(toolCall);

        for await (const toolEvent of executeTool(tools, toolCall)) {
          if (isAgentMessage(toolEvent)) {
            toolMessages.push(toolEvent);
          } else {
            yield toolEvent;
          }
        }
        continue;
      }

      if (event.type === "usage") {
        yield event;
        continue;
      }

      if (event.type === "done") {
        stopReason = event.stopReason;
        continue;
      }

      if (event.type === "error") {
        yield event;
        return;
      }
    }

    if (!toolCalls.length) {
      yield {
        type: "done",
        stopReason
      };
      return;
    }

    workingMessages.push({
      role: "assistant",
      content: assistantText,
      toolCalls
    });
    workingMessages.push(...toolMessages);
  }

  yield {
    type: "error",
    code: "provider_error",
    message: `Tutor tool iteration limit reached (${maxIterations}).`,
    recoverable: false
  };
}
