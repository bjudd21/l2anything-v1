import type { ServerConfig } from "../../config.js";
import type { AppDatabase } from "../../db/client.js";
import type { topics } from "../../db/schema.js";
import type { ToolSpec } from "../types.js";
import { createFetchUrlTool, createWebSearchTool } from "./research.js";
import type { ToolExecutionResult, TutorTool } from "./types.js";
import { ToolExecutionError, toolSpec } from "./types.js";
import { createWorkspaceTools } from "./workspace.js";

export interface TutorToolRegistryOptions {
  config: Pick<ServerConfig, "LEARNING_HUB_DIR" | "TAVILY_API_KEY">;
  db: AppDatabase;
  fetchImpl?: typeof fetch;
  topic: typeof topics.$inferSelect;
}

export interface TutorToolRegistry {
  execute(name: string, input: unknown): Promise<ToolExecutionResult>;
  specs: ToolSpec[];
}

export function createTutorToolRegistry(options: TutorToolRegistryOptions): TutorToolRegistry {
  const maybeSearch = createWebSearchTool({
    config: options.config,
    fetchImpl: options.fetchImpl
  });
  const tools: TutorTool[] = [
    ...createWorkspaceTools({
      config: options.config,
      db: options.db,
      topic: options.topic
    }),
    createFetchUrlTool({
      config: options.config,
      fetchImpl: options.fetchImpl
    }),
    ...(maybeSearch ? [maybeSearch] : [])
  ];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    specs: tools.map(toolSpec),
    async execute(name, input) {
      const tool = byName.get(name);

      if (!tool) {
        throw new ToolExecutionError("tool_error", `Unknown tutor tool: ${name}`);
      }

      return tool.execute(input);
    }
  };
}
