import { z } from "zod";
import type { ServerConfig } from "../../config.js";
import type { TutorTool } from "./types.js";
import { ToolExecutionError } from "./types.js";

export interface ResearchToolContext {
  config: Pick<ServerConfig, "TAVILY_API_KEY">;
  fetchImpl?: typeof fetch;
}

const fetchUrlSchema = z
  .object({
    url: z.string().url()
  })
  .strict();

const webSearchSchema = z
  .object({
    query: z.string().trim().min(1),
    maxResults: z.number().int().positive().max(10).optional()
  })
  .strict();

function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown) {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw new ToolExecutionError(
      "invalid_input",
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; ")
    );
  }

  return parsed.data;
}

function fetcher(context: ResearchToolContext) {
  return context.fetchImpl ?? fetch;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromHtml(html: string) {
  return /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim();
}

export function createFetchUrlTool(context: ResearchToolContext): TutorTool {
  return {
    name: "fetch_url",
    description: "Fetch a URL and extract readable text content for grounding.",
    inputSchema: objectSchema(
      {
        url: {
          type: "string",
          format: "uri",
          description: "HTTP or HTTPS URL to fetch."
        }
      },
      ["url"]
    ),
    async execute(input) {
      const parsed = parseInput(fetchUrlSchema, input);
      const response = await fetcher(context)(parsed.url);

      if (!response.ok) {
        throw new ToolExecutionError(
          "tool_error",
          `Fetch failed for ${parsed.url}: ${response.status} ${response.statusText}`.trim()
        );
      }

      const html = await response.text();
      const title = titleFromHtml(html) ?? parsed.url;
      const text = stripHtml(html).slice(0, 12000);

      return {
        content: [`# ${title}`, "", text].join("\n"),
        data: {
          title,
          url: parsed.url
        }
      };
    }
  };
}

export function createWebSearchTool(context: ResearchToolContext): TutorTool | null {
  if (!context.config.TAVILY_API_KEY) {
    return null;
  }

  return {
    name: "web_search",
    description: "Search the web through Tavily for trusted source discovery.",
    inputSchema: objectSchema(
      {
        query: {
          type: "string",
          minLength: 1,
          description: "Search query."
        },
        maxResults: {
          type: "number",
          minimum: 1,
          maximum: 10,
          description: "Maximum search results."
        }
      },
      ["query"]
    ),
    async execute(input) {
      const parsed = parseInput(webSearchSchema, input);
      const response = await fetcher(context)("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          api_key: context.config.TAVILY_API_KEY,
          query: parsed.query,
          max_results: parsed.maxResults ?? 5
        })
      });

      if (!response.ok) {
        throw new ToolExecutionError(
          "tool_error",
          `Search failed: ${response.status} ${response.statusText}`.trim()
        );
      }

      const body = (await response.json()) as {
        results?: Array<{ content?: string; title?: string; url?: string }>;
      };
      const results = (body.results ?? []).slice(0, parsed.maxResults ?? 5);

      return {
        content: results.length
          ? results
              .map(
                (result, index) =>
                  `${index + 1}. ${result.title ?? "Untitled"}\n${result.url ?? ""}\n${result.content ?? ""}`
              )
              .join("\n\n")
          : "No search results returned.",
        data: {
          results
        }
      };
    }
  };
}
