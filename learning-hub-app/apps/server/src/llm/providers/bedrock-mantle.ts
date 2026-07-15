import { getTokenProvider } from "@aws/bedrock-token-generator";
import { BedrockOpenAI } from "openai/bedrock";
import { errorMessage } from "../../aws/errors.js";
import type { ServerConfig } from "../../config.js";
import { isUnauthorizedError, providerErrorEvent } from "../errors.js";
import type {
  AgentEvent,
  AgentMessage,
  ChatProvider,
  ChatProviderRequest,
  ToolSpec
} from "../types.js";

export type MantleResponseStreamEvent = Record<string, unknown> & { type?: string };

export interface MantleResponsesClient {
  responses: {
    stream(body: Record<string, unknown>): AsyncIterable<MantleResponseStreamEvent>;
  };
}

export interface MantleTokenCacheOptions {
  generator: () => Promise<string>;
  now?: () => number;
  ttlMs?: number;
}

export interface BedrockMantleProviderOptions {
  baseUrl: string;
  client?: MantleResponsesClient;
  modelId: string;
  region: string;
  tokenCache?: MantleTokenCache;
}

const defaultMantleTokenTtlMs = 11 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function numberValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

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

function toResponsesInput(messages: AgentMessage[]) {
  return messages.flatMap((message) => {
    if (message.role === "tool" && message.toolCallId) {
      return [
        {
          type: "function_call_output",
          call_id: message.toolCallId,
          output: message.content
        }
      ];
    }

    const items: Array<Record<string, unknown>> = [];

    if (message.content.trim() || message.role !== "assistant") {
      items.push({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content
      });
    }

    for (const toolCall of message.toolCalls ?? []) {
      items.push({
        type: "function_call",
        call_id: toolCall.id,
        name: toolCall.name,
        arguments:
          toolCall.rawInput.trim() ||
          (typeof toolCall.input === "string"
            ? toolCall.input
            : JSON.stringify(toolCall.input ?? {}))
      });
    }

    return items;
  });
}

function toResponsesTools(tools: ToolSpec[]) {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  }));
}

function toResponsesBody(request: ChatProviderRequest, modelId: string): Record<string, unknown> {
  return {
    model: modelId,
    instructions: request.system,
    input: toResponsesInput(request.messages),
    tools: toResponsesTools(request.tools),
    max_output_tokens: request.maxTokens,
    reasoning: {
      effort: "medium"
    }
  };
}

function usageEventFromResponse(response: Record<string, unknown>): AgentEvent | null {
  const usage = response.usage;
  if (!isRecord(usage)) {
    return null;
  }

  return {
    type: "usage",
    inputTokens: numberValue(usage, "input_tokens"),
    outputTokens: numberValue(usage, "output_tokens"),
    totalTokens: numberValue(usage, "total_tokens")
  };
}

function outputItemToolCall(event: MantleResponseStreamEvent): AgentEvent | null {
  const item = event.item;
  if (!isRecord(item) || item.type !== "function_call") {
    return null;
  }

  const rawInput = stringValue(item, "arguments") ?? "";
  const id =
    stringValue(item, "call_id") ?? stringValue(item, "id") ?? stringValue(event, "item_id");
  const name = stringValue(item, "name");

  if (!id || !name) {
    return null;
  }

  return {
    type: "tool_call",
    id,
    name,
    input: parseToolInput(rawInput),
    rawInput
  };
}

export function normalizeMantleResponseEvent(event: MantleResponseStreamEvent): AgentEvent[] {
  if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
    return [
      {
        type: "text_delta",
        text: event.delta
      }
    ];
  }

  if (event.type === "response.function_call_arguments.done") {
    const rawInput = typeof event.arguments === "string" ? event.arguments : "";
    const id = stringValue(event, "item_id");
    const name = stringValue(event, "name");

    if (id && name) {
      return [
        {
          type: "tool_call",
          id,
          name,
          input: parseToolInput(rawInput),
          rawInput
        }
      ];
    }
  }

  if (event.type === "response.output_item.done") {
    const toolCall = outputItemToolCall(event);
    return toolCall ? [toolCall] : [];
  }

  if (event.type === "response.completed" && isRecord(event.response)) {
    const usage = usageEventFromResponse(event.response);
    return usage
      ? [
          usage,
          {
            type: "done"
          }
        ]
      : [
          {
            type: "done"
          }
        ];
  }

  if (event.type === "response.failed" || event.type === "response.error") {
    const response = isRecord(event.response) ? event.response : undefined;
    const error = isRecord(event.error)
      ? event.error
      : response && isRecord(response.error)
        ? response.error
        : undefined;

    return [
      {
        type: "error",
        code: "provider_error",
        message: error
          ? (stringValue(error, "message") ?? "Bedrock Mantle stream error.")
          : "Bedrock Mantle stream error.",
        recoverable: true
      }
    ];
  }

  return [];
}

export async function* normalizeMantleResponseStream(
  stream: AsyncIterable<MantleResponseStreamEvent>
): AsyncIterable<AgentEvent> {
  for await (const event of stream) {
    yield* normalizeMantleResponseEvent(event);
  }
}

export class MantleTokenCache {
  private readonly generator: () => Promise<string>;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private cachedToken: { expiresAt: number; value: string } | undefined;

  constructor(options: MantleTokenCacheOptions) {
    this.generator = options.generator;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? defaultMantleTokenTtlMs;
  }

  async getToken() {
    if (this.cachedToken && this.cachedToken.expiresAt > this.now()) {
      return this.cachedToken.value;
    }

    const value = await this.generator();
    this.cachedToken = {
      value,
      expiresAt: this.now() + this.ttlMs
    };

    return value;
  }

  invalidate() {
    this.cachedToken = undefined;
  }
}

export class BedrockMantleProvider implements ChatProvider {
  readonly id = "bedrock-mantle";
  private readonly client: MantleResponsesClient;
  private readonly modelId: string;
  private readonly tokenCache: MantleTokenCache | undefined;

  constructor(options: BedrockMantleProviderOptions) {
    this.modelId = options.modelId;
    this.tokenCache = options.tokenCache;
    this.client =
      options.client ??
      (new BedrockOpenAI({
        awsRegion: options.region,
        baseURL: options.baseUrl,
        bedrockTokenProvider: options.tokenCache
          ? () =>
              options.tokenCache?.getToken() ??
              Promise.reject(new Error("Mantle token cache is unavailable."))
          : undefined
      }) as unknown as MantleResponsesClient);
  }

  async *streamChat(request: ChatProviderRequest): AsyncIterable<AgentEvent> {
    const body = toResponsesBody(request, this.modelId);
    let retriedAfterUnauthorized = false;

    while (true) {
      try {
        await this.tokenCache?.getToken();
        const stream = await Promise.resolve(this.client.responses.stream(body));
        yield* normalizeMantleResponseStream(stream);
        return;
      } catch (error) {
        if (!retriedAfterUnauthorized && isUnauthorizedError(error)) {
          retriedAfterUnauthorized = true;
          this.tokenCache?.invalidate();
          continue;
        }

        const event = providerErrorEvent(error);
        yield event.type === "error" && event.code === "provider_error"
          ? {
              ...event,
              message: errorMessage(error) || event.message
            }
          : event;
        return;
      }
    }
  }
}

export function createMantleTokenCache(config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION">) {
  const generator = getTokenProvider({
    profile: config.AWS_PROFILE,
    region: config.AWS_REGION,
    expiresInSeconds: 60 * 60 * 12
  });

  return new MantleTokenCache({ generator });
}

export function createBedrockMantleProvider(config: ServerConfig) {
  const tokenCache = createMantleTokenCache(config);

  return new BedrockMantleProvider({
    baseUrl: config.MANTLE_BASE_URL,
    modelId: config.MANTLE_MODEL_ID,
    region: config.AWS_REGION,
    tokenCache
  });
}
