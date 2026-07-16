import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import { z } from "zod";
import type { ServerConfig } from "../../config.js";
import type { AppDatabase } from "../../db/client.js";
import type { topics } from "../../db/schema.js";
import { indexWorkspace } from "../../workspace/indexer.js";
import { getNextWorkspaceNumber } from "../../workspace/numbering.js";
import { assertInsideRoot, WorkspacePathError } from "../../workspace/path.js";
import type { ToolExecutionResult, TutorTool } from "./types.js";
import { ToolExecutionError } from "./types.js";

export interface WorkspaceToolContext {
  config: Pick<ServerConfig, "LEARNING_HUB_DIR">;
  db: AppDatabase;
  topic: typeof topics.$inferSelect;
}

const readWorkspaceFileSchema = z
  .object({
    path: z.string().trim().min(1)
  })
  .strict();

const writeLessonSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    html: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
    body: z.string().trim().min(1).optional()
  })
  .passthrough();

const writeRecordSchema = z
  .object({
    title: z.string().trim().min(1),
    markdown: z.string().trim().min(1)
  })
  .strict();

const writeReferenceSchema = z
  .object({
    name: z.string().trim().min(1),
    html: z.string().trim().min(1)
  })
  .strict();

const markdownSchema = z
  .object({
    markdown: z.string().trim().min(1)
  })
  .strict();

const appendResourceSchema = z
  .object({
    entry: z.string().trim().min(1)
  })
  .strict();

function stringSchema(description: string) {
  return { type: "string", minLength: 1, description };
}

function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function invalidInput(error: z.ZodError) {
  return new ToolExecutionError(
    "invalid_input",
    error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")
  );
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown) {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw invalidInput(parsed.error);
  }

  return parsed.data;
}

function textFromHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromHtml(html: string) {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const headingMatch = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = textFromHtml(titleMatch?.[1] ?? headingMatch?.[1] ?? "");

  return title || "Generated Lesson";
}

function looksLikeHtml(value: string) {
  return /<(?:!doctype|html|head|body|main|article|section|h1)\b/i.test(value);
}

function parseWriteLessonInput(input: unknown) {
  if (typeof input === "string") {
    const html = input.trim();
    if (!html) {
      throw new ToolExecutionError("invalid_input", "html: Lesson HTML is required.");
    }

    if (/^[{[]/.test(html)) {
      try {
        return parseWriteLessonInput(JSON.parse(html) as unknown);
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new ToolExecutionError(
            "invalid_input",
            "input: Malformed JSON tool payload. Expected an object with title and html."
          );
        }

        throw error;
      }
    }

    if (!looksLikeHtml(html)) {
      throw new ToolExecutionError(
        "invalid_input",
        "html: Raw string input must be self-contained lesson HTML."
      );
    }

    return {
      html,
      title: titleFromHtml(html)
    };
  }

  const parsed = parseInput(writeLessonSchema, input);
  const html = parsed.html ?? parsed.content ?? parsed.body;

  if (!html) {
    throw new ToolExecutionError(
      "invalid_input",
      "html: Lesson HTML is required. Use html, content, or body."
    );
  }

  return {
    html,
    title: parsed.title ?? titleFromHtml(html)
  };
}

function resolveTopicPath(topicDir: string, requestedPath: string) {
  try {
    return assertInsideRoot(topicDir, requestedPath);
  } catch (error) {
    if (error instanceof WorkspacePathError) {
      throw new ToolExecutionError("path_scope", error.message);
    }

    throw error;
  }
}

function fileResult(path: string, content: string): ToolExecutionResult {
  return {
    content,
    data: {
      path
    }
  };
}

function ensureFile(path: string, requestedPath: string) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new ToolExecutionError("not_found", `Workspace file is not available: ${requestedPath}`);
  }
}

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "untitled";
}

function safeReferenceName(value: string) {
  if (value !== basename(value) || value.includes("/") || value.includes("\\")) {
    throw new ToolExecutionError("path_scope", "Reference name must not include path segments.");
  }

  return `${slugify(value.replace(/\.html$/i, ""))}.html`;
}

async function ensureToolDir(topicDir: string, requestedPath: string) {
  const dir = resolveTopicPath(topicDir, requestedPath);
  await mkdir(dir, { recursive: true });
  return dir;
}

function refreshIndex(context: WorkspaceToolContext) {
  if (context.config.LEARNING_HUB_DIR) {
    indexWorkspace(context.db, context.config.LEARNING_HUB_DIR);
  }
}

function formatRecord(title: string, markdown: string) {
  const body = markdown.replace(/^# .+?(\r?\n)+/, "").trim();

  return `# ${title.trim()}\n\n${body}\n`;
}

function normalizeMarkdown(markdown: string) {
  return `${markdown.trim()}\n`;
}

function assertMissionFormat(markdown: string) {
  const requiredSections = ["## Why", "## Success looks like", "## Constraints", "## Out of scope"];

  if (!/^# Mission:\s+\S+/m.test(markdown)) {
    throw new ToolExecutionError(
      "invalid_input",
      "MISSION.md must start with '# Mission: {Topic}'."
    );
  }

  for (const section of requiredSections) {
    if (!markdown.includes(section)) {
      throw new ToolExecutionError("invalid_input", `MISSION.md is missing '${section}'.`);
    }
  }
}

function normalizeNotes(markdown: string) {
  const trimmed = markdown.trim();

  return /^# Notes\b/m.test(trimmed) ? `${trimmed}\n` : `# Notes\n\n${trimmed}\n`;
}

function resourcesStub(topicTitle: string) {
  return `# ${topicTitle} Resources\n\n## Knowledge\n\n## Wisdom (Communities)\n\n## Gaps\n- Trusted resources have not been curated yet.\n`;
}

function normalizeResourceEntry(entry: string) {
  const trimmed = entry.trim();

  return trimmed.startsWith("- ") ? trimmed : `- ${trimmed}`;
}

function appendResourceEntry(current: string, entry: string) {
  const normalized = normalizeResourceEntry(entry);
  const insertionPoint = current.search(/\n## (Wisdom|Gaps)\b/);

  if (insertionPoint >= 0) {
    const before = current.slice(0, insertionPoint).replace(/\s+$/g, "");
    const after = current.slice(insertionPoint).replace(/^\s+/g, "\n");

    return `${before}\n\n${normalized}\n${after.endsWith("\n") ? after : `${after}\n`}`;
  }

  return `${current.trim()}\n\n${normalized}\n`;
}

function isInsideDirectory(parentDir: string, path: string) {
  const rel = relative(parentDir, path);

  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function listWorkspaceTree(topicDir: string) {
  const rows: string[] = [];

  function visit(current: string, depth: number) {
    const entries = readdirSync(current, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const path = join(current, entry.name);
      const rel = relative(topicDir, path).replace(/\\/g, "/");
      rows.push(`${"  ".repeat(depth)}${entry.isDirectory() ? `${entry.name}/` : entry.name}`);

      if (entry.isDirectory() && depth < 3) {
        visit(path, depth + 1);
      } else if (entry.isFile()) {
        resolveTopicPath(topicDir, rel);
      }
    }
  }

  visit(topicDir, 0);
  return rows.join("\n");
}

function readWorkspaceFileTool(context: WorkspaceToolContext): TutorTool {
  return {
    name: "read_workspace_file",
    description:
      "Read a file from the active topic workspace. The path must resolve inside the topic directory.",
    inputSchema: objectSchema(
      {
        path: stringSchema(
          "Topic-relative path to read, such as MISSION.md or lessons/0001-topic.html."
        )
      },
      ["path"]
    ),
    execute(input) {
      const parsed = parseInput(readWorkspaceFileSchema, input);
      const path = resolveTopicPath(context.topic.dirPath, parsed.path);
      ensureFile(path, parsed.path);

      return Promise.resolve(fileResult(parsed.path, readFileSync(path, "utf8")));
    }
  };
}

function listWorkspaceTool(context: WorkspaceToolContext): TutorTool {
  return {
    name: "list_workspace",
    description: "List the active topic workspace tree.",
    inputSchema: objectSchema({}, []),
    execute() {
      return Promise.resolve({
        content: listWorkspaceTree(context.topic.dirPath)
      });
    }
  };
}

function writeLessonTool(context: WorkspaceToolContext): TutorTool {
  return {
    name: "write_lesson",
    description: "Write the next numbered lesson HTML file under lessons/.",
    inputSchema: objectSchema(
      {
        title: stringSchema("Lesson title."),
        html: stringSchema("Self-contained lesson HTML.")
      },
      ["title", "html"]
    ),
    async execute(input) {
      const parsed = parseWriteLessonInput(input);
      const dir = await ensureToolDir(context.topic.dirPath, "lessons");
      const next = getNextWorkspaceNumber(dir);
      const fileName = `${next.padded}-${slugify(parsed.title)}.html`;
      const path = resolveTopicPath(context.topic.dirPath, join("lessons", fileName));

      await writeFile(path, normalizeMarkdown(parsed.html), { flag: "wx" });
      refreshIndex(context);

      return {
        artifact: {
          kind: "lesson",
          ref: fileName
        },
        content: `Wrote lesson ${fileName}.`,
        data: {
          fileName,
          number: next.number,
          path: `lessons/${fileName}`
        }
      };
    }
  };
}

function writeRecordTool(context: WorkspaceToolContext): TutorTool {
  return {
    name: "write_learning_record",
    description: "Write the next numbered learning record under learning-records/.",
    inputSchema: objectSchema(
      {
        title: stringSchema("Short record title."),
        markdown: stringSchema("Learning record body without the top-level heading.")
      },
      ["title", "markdown"]
    ),
    async execute(input) {
      const parsed = parseInput(writeRecordSchema, input);
      const dir = await ensureToolDir(context.topic.dirPath, "learning-records");
      const next = getNextWorkspaceNumber(dir);
      const fileName = `${next.padded}-${slugify(parsed.title)}.md`;
      const path = resolveTopicPath(context.topic.dirPath, join("learning-records", fileName));

      await writeFile(path, formatRecord(parsed.title, parsed.markdown), { flag: "wx" });
      refreshIndex(context);

      return {
        artifact: {
          kind: "record",
          ref: fileName
        },
        content: `Wrote learning record ${fileName}.`,
        data: {
          fileName,
          number: next.number,
          path: `learning-records/${fileName}`
        }
      };
    }
  };
}

function writeReferenceTool(context: WorkspaceToolContext): TutorTool {
  return {
    name: "write_reference",
    description: "Create or update an HTML reference file under reference/.",
    inputSchema: objectSchema(
      {
        name: stringSchema("Reference name or filename."),
        html: stringSchema("Self-contained reference HTML.")
      },
      ["name", "html"]
    ),
    async execute(input) {
      const parsed = parseInput(writeReferenceSchema, input);
      const dir = await ensureToolDir(context.topic.dirPath, "reference");
      const fileName = safeReferenceName(parsed.name);
      const path = resolveTopicPath(context.topic.dirPath, join("reference", fileName));

      if (extname(fileName).toLowerCase() !== ".html" || !isInsideDirectory(dir, path)) {
        throw new ToolExecutionError("path_scope", "Reference files must stay under reference/.");
      }

      await writeFile(path, normalizeMarkdown(parsed.html));
      refreshIndex(context);

      return {
        artifact: {
          kind: "reference",
          ref: fileName
        },
        content: `Wrote reference ${fileName}.`,
        data: {
          fileName,
          path: `reference/${fileName}`
        }
      };
    }
  };
}

function updateMissionTool(context: WorkspaceToolContext): TutorTool {
  return {
    name: "update_mission",
    description: "Replace MISSION.md with markdown that follows the teach-skill mission format.",
    inputSchema: objectSchema(
      {
        markdown: stringSchema("Full MISSION.md markdown.")
      },
      ["markdown"]
    ),
    async execute(input) {
      const parsed = parseInput(markdownSchema, input);
      assertMissionFormat(parsed.markdown);
      const path = resolveTopicPath(context.topic.dirPath, "MISSION.md");

      await writeFile(path, normalizeMarkdown(parsed.markdown));
      refreshIndex(context);

      return {
        content: "Updated MISSION.md.",
        data: {
          path: "MISSION.md"
        }
      };
    }
  };
}

function updateNotesTool(context: WorkspaceToolContext): TutorTool {
  return {
    name: "update_notes",
    description: "Replace NOTES.md. A '# Notes' heading is added if missing.",
    inputSchema: objectSchema(
      {
        markdown: stringSchema("NOTES.md markdown.")
      },
      ["markdown"]
    ),
    async execute(input) {
      const parsed = parseInput(markdownSchema, input);
      const path = resolveTopicPath(context.topic.dirPath, "NOTES.md");

      await writeFile(path, normalizeNotes(parsed.markdown));
      refreshIndex(context);

      return {
        content: "Updated NOTES.md.",
        data: {
          path: "NOTES.md"
        }
      };
    }
  };
}

function appendResourceTool(context: WorkspaceToolContext): TutorTool {
  return {
    name: "append_resource",
    description: "Append a curated resource entry to RESOURCES.md under the Knowledge section.",
    inputSchema: objectSchema(
      {
        entry: stringSchema("Markdown resource entry. Include the annotation line when useful.")
      },
      ["entry"]
    ),
    async execute(input) {
      const parsed = parseInput(appendResourceSchema, input);
      const path = resolveTopicPath(context.topic.dirPath, "RESOURCES.md");
      const current = existsSync(path)
        ? readFileSync(path, "utf8")
        : resourcesStub(context.topic.title);
      const next = appendResourceEntry(current, parsed.entry);

      await writeFile(path, next);
      refreshIndex(context);

      return {
        content: "Appended resource entry to RESOURCES.md.",
        data: {
          path: "RESOURCES.md"
        }
      };
    }
  };
}

export function createWorkspaceTools(context: WorkspaceToolContext): TutorTool[] {
  return [
    readWorkspaceFileTool(context),
    listWorkspaceTool(context),
    writeLessonTool(context),
    writeRecordTool(context),
    writeReferenceTool(context),
    updateMissionTool(context),
    updateNotesTool(context),
    appendResourceTool(context)
  ];
}
