import { eq } from "drizzle-orm";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteConnection } from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";
import { topics } from "../../db/schema.js";
import { indexWorkspace } from "../../workspace/indexer.js";
import { createTutorToolRegistry } from "./registry.js";

const tempDirs: string[] = [];

function makeRoot() {
  const dir = mkdtempSync(join(tmpdir(), "learning-hub-tools-"));
  tempDirs.push(dir);
  return dir;
}

function writeTopic(root: string) {
  const topicDir = join(root, "typescript-basics");

  mkdirSync(join(topicDir, "lessons"), { recursive: true });
  mkdirSync(join(topicDir, "learning-records"), { recursive: true });
  mkdirSync(join(topicDir, "reference"), { recursive: true });
  writeFileSync(
    join(topicDir, "MISSION.md"),
    [
      "# Mission: TypeScript Basics",
      "",
      "## Why",
      "Ship safer code.",
      "",
      "## Success looks like",
      "- Explain values.",
      "",
      "## Constraints",
      "- Keep it short.",
      "",
      "## Out of scope",
      "- Frameworks.",
      ""
    ].join("\n")
  );
  writeFileSync(join(topicDir, "NOTES.md"), "# Notes\n\nRemember runtime values.\n");
  writeFileSync(
    join(topicDir, "RESOURCES.md"),
    [
      "# TypeScript Basics Resources",
      "",
      "## Knowledge",
      "",
      "- [TypeScript Handbook](https://www.typescriptlang.org/docs/)",
      "  Use for language basics.",
      "",
      "## Wisdom (Communities)",
      "",
      "- [TypeScript Discord](https://example.com)",
      "  Use for practical questions.",
      "",
      "## Gaps",
      "- More local examples.",
      ""
    ].join("\n")
  );
  writeFileSync(join(topicDir, "lessons", "0003-existing.html"), "<title>Existing</title>");
  writeFileSync(join(topicDir, "learning-records", "0002-existing.md"), "# Existing\n\nKnown.\n");

  return topicDir;
}

function createContext() {
  const root = makeRoot();
  const topicDir = writeTopic(root);
  const connection = createSqliteConnection();
  runMigrations(connection.sqlite);
  indexWorkspace(connection.db, root);

  const topic = connection.db
    .select()
    .from(topics)
    .where(eq(topics.slug, "typescript-basics"))
    .get();

  if (!topic) {
    throw new Error("Test topic was not indexed.");
  }

  const registry = createTutorToolRegistry({
    config: {
      LEARNING_HUB_DIR: root,
      TAVILY_API_KEY: ""
    },
    db: connection.db,
    topic
  });

  return {
    ...connection,
    registry,
    root,
    topicDir
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("workspace tutor tools", () => {
  it("reads and lists files inside the active topic", async () => {
    const context = createContext();

    try {
      const mission = await context.registry.execute("read_workspace_file", {
        path: "MISSION.md"
      });
      expect(mission.content).toContain("# Mission: TypeScript Basics");
      expect(mission.data).toEqual({
        path: "MISSION.md"
      });

      const workspace = await context.registry.execute("list_workspace", {});
      expect(workspace.content).toContain("MISSION.md");
    } finally {
      context.sqlite.close();
    }
  });

  it("rejects traversal and absolute paths outside the active topic", async () => {
    const context = createContext();

    try {
      await expect(
        context.registry.execute("read_workspace_file", { path: "../outside.md" })
      ).rejects.toMatchObject({
        code: "path_scope"
      });
      await expect(
        context.registry.execute("read_workspace_file", { path: join(tmpdir(), "outside.md") })
      ).rejects.toMatchObject({
        code: "path_scope"
      });
    } finally {
      context.sqlite.close();
    }
  });

  it("writes the next numbered lesson from files on disk", async () => {
    const context = createContext();

    try {
      await expect(
        context.registry.execute("write_lesson", {
          title: "New Values",
          html: "<!doctype html><title>New Values</title>"
        })
      ).resolves.toMatchObject({
        artifact: {
          kind: "lesson",
          ref: "0004-new-values.html"
        },
        data: {
          number: 4,
          path: "lessons/0004-new-values.html"
        }
      });
      expect(existsSync(join(context.topicDir, "lessons", "0004-new-values.html"))).toBe(true);
    } finally {
      context.sqlite.close();
    }
  });

  it("accepts content as a lesson HTML alias", async () => {
    const context = createContext();

    try {
      await expect(
        context.registry.execute("write_lesson", {
          title: "Alias Payload",
          content: "<!doctype html><title>Alias Payload</title>"
        })
      ).resolves.toMatchObject({
        artifact: {
          kind: "lesson",
          ref: "0004-alias-payload.html"
        }
      });
      expect(existsSync(join(context.topicDir, "lessons", "0004-alias-payload.html"))).toBe(true);
    } finally {
      context.sqlite.close();
    }
  });

  it("accepts raw lesson HTML strings", async () => {
    const context = createContext();

    try {
      await expect(
        context.registry.execute(
          "write_lesson",
          "<!doctype html><html><head><title>Raw Payload</title></head><body>Ready.</body></html>"
        )
      ).resolves.toMatchObject({
        artifact: {
          kind: "lesson",
          ref: "0004-raw-payload.html"
        },
        data: {
          path: "lessons/0004-raw-payload.html"
        }
      });
      expect(existsSync(join(context.topicDir, "lessons", "0004-raw-payload.html"))).toBe(true);
    } finally {
      context.sqlite.close();
    }
  });

  it("rejects malformed JSON lesson payload strings", async () => {
    const context = createContext();

    try {
      await expect(
        context.registry.execute("write_lesson", '{"title": "Incomplete payload"')
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "input: Malformed JSON tool payload. Expected an object with title and html."
      });
      expect(existsSync(join(context.topicDir, "lessons", "0004-incomplete-payload.html"))).toBe(
        false
      );
    } finally {
      context.sqlite.close();
    }
  });

  it("writes learning records in the teach-skill format", async () => {
    const context = createContext();

    try {
      await context.registry.execute("write_learning_record", {
        title: "Values Are Runtime",
        markdown: "# Draft\n\nValues exist at runtime."
      });

      expect(
        readFileSync(
          join(context.topicDir, "learning-records", "0003-values-are-runtime.md"),
          "utf8"
        )
      ).toBe("# Values Are Runtime\n\nValues exist at runtime.\n");
    } finally {
      context.sqlite.close();
    }
  });

  it("keeps references under reference/ and rejects path-like names", async () => {
    const context = createContext();

    try {
      await expect(
        context.registry.execute("write_reference", {
          name: "../escape.html",
          html: "<title>Escape</title>"
        })
      ).rejects.toMatchObject({
        code: "path_scope"
      });

      await expect(
        context.registry.execute("write_reference", {
          name: "Value Guide.HTML",
          html: "<title>Value Guide</title>"
        })
      ).resolves.toMatchObject({
        artifact: {
          kind: "reference",
          ref: "value-guide.html"
        }
      });
      expect(readFileSync(join(context.topicDir, "reference", "value-guide.html"), "utf8")).toBe(
        "<title>Value Guide</title>\n"
      );
    } finally {
      context.sqlite.close();
    }
  });

  it("validates mission format before replacing MISSION.md", async () => {
    const context = createContext();
    const validMission = [
      "# Mission: TypeScript Basics",
      "",
      "## Why",
      "Ship safer code.",
      "",
      "## Success looks like",
      "- Explain values.",
      "",
      "## Constraints",
      "- Keep it short.",
      "",
      "## Out of scope",
      "- Frameworks."
    ].join("\n");

    try {
      await expect(
        context.registry.execute("update_mission", {
          markdown: "# Mission: Missing Sections"
        })
      ).rejects.toMatchObject({
        code: "invalid_input"
      });

      await context.registry.execute("update_mission", {
        markdown: validMission
      });
      expect(readFileSync(join(context.topicDir, "MISSION.md"), "utf8")).toBe(`${validMission}\n`);
    } finally {
      context.sqlite.close();
    }
  });

  it("normalizes notes and appends resources before wisdom and gaps", async () => {
    const context = createContext();

    try {
      await context.registry.execute("update_notes", {
        markdown: "A useful observation."
      });
      expect(readFileSync(join(context.topicDir, "NOTES.md"), "utf8")).toBe(
        "# Notes\n\nA useful observation.\n"
      );

      await context.registry.execute("append_resource", {
        entry: "[TS Deep Dive](https://example.com)\n  Use for deeper examples."
      });
      const resources = readFileSync(join(context.topicDir, "RESOURCES.md"), "utf8");

      expect(resources.indexOf("- [TS Deep Dive](https://example.com)")).toBeGreaterThan(
        resources.indexOf("## Knowledge")
      );
      expect(resources.indexOf("- [TS Deep Dive](https://example.com)")).toBeLessThan(
        resources.indexOf("## Wisdom")
      );
    } finally {
      context.sqlite.close();
    }
  });
});
