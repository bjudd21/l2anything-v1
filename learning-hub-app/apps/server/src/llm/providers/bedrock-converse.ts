import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type ConverseStreamCommandInput,
  type ConverseStreamCommandOutput,
  type ConverseStreamOutput
} from "@aws-sdk/client-bedrock-runtime";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { errorMessage } from "../../aws/errors.js";
import type { ServerConfig } from "../../config.js";
import { providerConfigError, providerErrorEvent } from "../errors.js";
import type {
  AgentEvent,
  AgentMessage,
  AgentToolCall,
  ChatProvider,
  ChatProviderRequest,
  ToolSpec
} from "../types.js";

export interface ConverseStreamClient {
  send(command: ConverseStreamCommand): Promise<Pick<ConverseStreamCommandOutput, "stream">>;
}

export interface BedrockConverseProviderOptions {
  client?: ConverseStreamClient;
  modelId?: string | null;
  profile?: string;
  region: string;
}

interface ToolAccumulator {
  id: string;
  input: string;
  name: string;
}

type ConverseToolUseInput = NonNullable<
  NonNullable<
    NonNullable<
      NonNullable<ConverseStreamCommandInput["messages"]>[number]["content"]
    >[number]["toolUse"]
  >["input"]
>;

function parseToolInput(rawInput: string) {
  if (!rawInput.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawInput) as unknown;
  } catch {
    return rawInput;
  }
}

function toolInputValue(toolCall: AgentToolCall): ConverseToolUseInput {
  return typeof toolCall.input === "object" && toolCall.input !== null
    ? (toolCall.input as ConverseToolUseInput)
    : { rawInput: toolCall.rawInput };
}

function toConverseMessages(
  messages: AgentMessage[]
): NonNullable<ConverseStreamCommandInput["messages"]> {
  const converseMessages: NonNullable<ConverseStreamCommandInput["messages"]> = [];
  let previousWasToolResult = false;

  for (const message of messages) {
    if (message.role === "assistant") {
      const content: NonNullable<
        NonNullable<ConverseStreamCommandInput["messages"]>[number]["content"]
      > = [];

      if (message.content.trim()) {
        content.push({ text: message.content });
      }

      for (const toolCall of message.toolCalls ?? []) {
        content.push({
          toolUse: {
            toolUseId: toolCall.id,
            name: toolCall.name,
            input: toolInputValue(toolCall)
          }
        });
      }

      converseMessages.push({
        role: "assistant",
        content
      });
      previousWasToolResult = false;
      continue;
    }

    if (message.role === "tool" && message.toolCallId) {
      const block = {
        toolResult: {
          toolUseId: message.toolCallId,
          content: [{ text: message.content }],
          status: message.isError ? ("error" as const) : ("success" as const)
        }
      };
      const previous = converseMessages[converseMessages.length - 1];

      // Converse requires every toolUse from one assistant turn to be answered
      // by toolResult blocks inside a single user message, so consecutive tool
      // results are merged instead of emitted as separate messages.
      if (previousWasToolResult && previous?.content) {
        previous.content.push(block);
      } else {
        converseMessages.push({
          role: "user",
          content: [block]
        });
      }
      previousWasToolResult = true;
      continue;
    }

    converseMessages.push({
      role: "user",
      content: [{ text: message.content }]
    });
    previousWasToolResult = false;
  }

  return converseMessages;
}

function toConverseTools(
  tools: ToolSpec[]
): NonNullable<ConverseStreamCommandInput["toolConfig"]> | undefined {
  if (!tools.length) {
    return undefined;
  }

  return {
    tools: tools.map((tool) => ({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          json: tool.inputSchema
        }
      }
    }))
  } as NonNullable<ConverseStreamCommandInput["toolConfig"]>;
}

function streamErrorEvent(event: ConverseStreamOutput): AgentEvent | null {
  const error =
    event.internalServerException ??
    event.modelStreamErrorException ??
    event.validationException ??
    event.throttlingException ??
    event.serviceUnavailableException;

  if (!error) {
    return null;
  }

  return {
    type: "error",
    code: "provider_error",
    message: errorMessage(error) || "Bedrock Converse stream error.",
    recoverable: true
  };
}

export async function* normalizeConverseStream(
  stream: AsyncIterable<ConverseStreamOutput>
): AsyncIterable<AgentEvent> {
  const toolBlocks = new Map<number, ToolAccumulator>();

  for await (const event of stream) {
    const streamError = streamErrorEvent(event);
    if (streamError) {
      yield streamError;
      continue;
    }

    const blockStart = event.contentBlockStart;
    const toolUseStart = blockStart?.start?.toolUse;
    if (
      typeof blockStart?.contentBlockIndex === "number" &&
      toolUseStart?.toolUseId &&
      toolUseStart.name
    ) {
      toolBlocks.set(blockStart.contentBlockIndex, {
        id: toolUseStart.toolUseId,
        name: toolUseStart.name,
        input: ""
      });
    }

    const delta = event.contentBlockDelta;
    if (delta?.delta?.text) {
      yield {
        type: "text_delta",
        text: delta.delta.text
      };
    }

    const toolUseDelta = delta?.delta?.toolUse;
    if (typeof delta?.contentBlockIndex === "number" && toolUseDelta?.input) {
      const current = toolBlocks.get(delta.contentBlockIndex);
      if (current) {
        current.input += toolUseDelta.input;
      }
    }

    const blockStop = event.contentBlockStop;
    if (typeof blockStop?.contentBlockIndex === "number") {
      const current = toolBlocks.get(blockStop.contentBlockIndex);
      if (current) {
        yield {
          type: "tool_call",
          id: current.id,
          name: current.name,
          input: parseToolInput(current.input),
          rawInput: current.input
        };
        toolBlocks.delete(blockStop.contentBlockIndex);
      }
    }

    const usage = event.metadata?.usage;
    if (usage) {
      yield {
        type: "usage",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens
      };
    }

    const messageStop = event.messageStop;
    if (messageStop) {
      yield {
        type: "done",
        stopReason: messageStop.stopReason
      };
    }
  }
}

export class BedrockConverseProvider implements ChatProvider {
  readonly id = "bedrock-converse";
  private readonly client: ConverseStreamClient;
  private readonly modelId: string | null | undefined;

  constructor(options: BedrockConverseProviderOptions) {
    this.modelId = options.modelId;
    this.client =
      options.client ??
      new BedrockRuntimeClient({
        region: options.region,
        credentials: defaultProvider({
          profile: options.profile
        })
      });
  }

  async *streamChat(request: ChatProviderRequest): AsyncIterable<AgentEvent> {
    if (!this.modelId) {
      yield providerConfigError("Bedrock Converse model is not configured.");
      return;
    }

    try {
      const command = new ConverseStreamCommand({
        modelId: this.modelId,
        messages: toConverseMessages(request.messages),
        system: request.system ? [{ text: request.system }] : undefined,
        inferenceConfig: request.maxTokens ? { maxTokens: request.maxTokens } : undefined,
        toolConfig: toConverseTools(request.tools)
      });
      const response = await this.client.send(command);

      if (!response.stream) {
        yield {
          type: "error",
          code: "provider_error",
          message: "Bedrock Converse response did not include a stream.",
          recoverable: true
        };
        return;
      }

      yield* normalizeConverseStream(response.stream);
    } catch (error) {
      yield providerErrorEvent(error);
    }
  }
}

export function createBedrockConverseProvider(config: ServerConfig) {
  return new BedrockConverseProvider({
    modelId: config.CONVERSE_MODEL_ID,
    profile: config.AWS_PROFILE,
    region: config.AWS_REGION
  });
}
