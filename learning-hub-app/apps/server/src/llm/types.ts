import type { AwsCredentialReason, ProviderId } from "@learning-hub/shared";

export type JsonObject = Record<string, unknown>;

export interface AgentToolCall {
  id: string;
  input: unknown;
  name: string;
  rawInput: string;
}

export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  isError?: boolean;
  toolCallId?: string;
  toolCalls?: AgentToolCall[];
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

export interface ChatProviderRequest {
  system: string;
  messages: AgentMessage[];
  tools: ToolSpec[];
  maxTokens?: number;
}

export type AgentEvent =
  | {
      type: "text_delta";
      text: string;
    }
  | {
      type: "tool_call";
      id: string;
      name: string;
      input: unknown;
      rawInput: string;
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

export interface ChatProvider {
  id: ProviderId;
  streamChat(request: ChatProviderRequest): AsyncIterable<AgentEvent>;
}
