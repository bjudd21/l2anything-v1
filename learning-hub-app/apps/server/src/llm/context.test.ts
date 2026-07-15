import { and, eq } from "drizzle-orm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSqliteConnection } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { lessonsIndex, topics } from "../db/schema.js";
import { indexWorkspace } from "../workspace/indexer.js";
import { buildTutorContext } from "./context.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "learning-hub-fixture"
);

describe("buildTutorContext", () => {
  it("assembles topic and lesson context from workspace files", () => {
    const connection = createSqliteConnection();

    try {
      runMigrations(connection.sqlite);
      indexWorkspace(connection.db, fixtureRoot);

      const topic = connection.db
        .select()
        .from(topics)
        .where(eq(topics.slug, "typescript-basics"))
        .get();
      if (!topic) {
        throw new Error("Fixture topic was not indexed.");
      }

      const lesson = connection.db
        .select()
        .from(lessonsIndex)
        .where(and(eq(lessonsIndex.topicId, topic.id), eq(lessonsIndex.number, 1)))
        .get();
      if (!lesson) {
        throw new Error("Fixture lesson was not indexed.");
      }

      const context = buildTutorContext({
        db: connection.db,
        lessonId: lesson.id,
        topic
      });

      expect(context.lesson?.id).toBe(lesson.id);
      expect(context.system).toContain("MISSION.md");
      expect(context.system).toContain("NOTES.md");
      expect(context.system).toContain("RESOURCES.md");
      expect(context.system).toContain("Values are the runtime floor");
      expect(context.system).toContain("0001 Values Before Types");
      expect(context.system).toContain("<title>Values Before Types</title>");
      expect(context.system).toContain(
        "Only read or write workspace files by calling the provided tools"
      );
      expect(context.system).toContain("preserve the teach-skill formats");
    } finally {
      connection.sqlite.close();
    }
  });

  it("handles thin topic folders without throwing", () => {
    const connection = createSqliteConnection();

    try {
      runMigrations(connection.sqlite);
      indexWorkspace(connection.db, fixtureRoot);

      const topic = connection.db
        .select()
        .from(topics)
        .where(eq(topics.slug, "half-scaffolded"))
        .get();
      if (!topic) {
        throw new Error("Fixture topic was not indexed.");
      }

      const context = buildTutorContext({
        db: connection.db,
        topic
      });

      expect(context.system).toContain("Half Scaffolded");
      expect(context.system).toContain("Not available in this topic workspace.");
      expect(context.system).toContain("No lesson is active for this chat turn.");
    } finally {
      connection.sqlite.close();
    }
  });
});
