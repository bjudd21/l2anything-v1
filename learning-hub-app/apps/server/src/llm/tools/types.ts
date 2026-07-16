import type { ChatStreamEvent } from "@learning-hub/shared";
import type { ToolSpec } from "../types.js";

export type ArtifactKind = Extract<ChatStreamEvent, { type: "artifact_created" }>["kind"];

export interface ToolExecutionResult {
  artifact?: {
    kind: ArtifactKind;
    ref: string;
  };
  content: string;
  data?: unknown;
}

export interface TutorTool {
  description: string;
  inputSchema: ToolSpec["inputSchema"];
  name: string;
  execute(input: unknown): Promise<ToolExecutionResult>;
}

export class ToolExecutionError extends Error {
  readonly code: "invalid_input" | "not_found" | "path_scope" | "tool_error";

  constructor(code: ToolExecutionError["code"], message: string) {
    super(message);
    this.name = "ToolExecutionError";
    this.code = code;
  }
}

export function toolSpec(tool: TutorTool): ToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  };
}
