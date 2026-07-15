import { eq } from "drizzle-orm";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSqliteConnection } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { lessonGroups, lessonsIndex, recordsIndex, topicGroups, topics } from "../db/schema.js";
import { indexWorkspace } from "./indexer.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "learning-hub-fixture"
);
const visualFixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "learning-hub-visual-fixture"
);

describe("indexWorkspace", () => {
  it("indexes fixture topics, lessons, and records", () => {
    const { db, sqlite } = createSqliteConnection();
    runMigrations(sqlite);

    const indexed = indexWorkspace(db, fixtureRoot);

    expect(indexed.map((topic) => topic.slug)).toEqual(["half-scaffolded", "typescript-basics"]);

    const typeScriptTopic = db
      .select()
      .from(topics)
      .where(eq(topics.slug, "typescript-basics"))
      .get();

    expect(typeScriptTopic?.title).toBe("TypeScript Basics");

    const lessons = db
      .select()
      .from(lessonsIndex)
      .where(eq(lessonsIndex.topicId, typeScriptTopic?.id ?? -1))
      .all();

    expect(lessons.map((lesson) => [lesson.number, lesson.title])).toEqual([
      [1, "Values Before Types"],
      [2, "Function Inputs"]
    ]);

    const records = db
      .select()
      .from(recordsIndex)
      .where(eq(recordsIndex.topicId, typeScriptTopic?.id ?? -1))
      .all();

    expect(records.map((record) => [record.number, record.title])).toEqual([
      [1, "Values are the runtime floor"]
    ]);

    sqlite.close();
  });

  it("indexes the visual fixture workspace", () => {
    const { db, sqlite } = createSqliteConnection();
    runMigrations(sqlite);

    const indexed = indexWorkspace(db, visualFixtureRoot);

    expect(
      indexed.map((topic) => ({
        lessons: topic.lessons.length,
        records: topic.records.length,
        slug: topic.slug,
        title: topic.title
      }))
    ).toEqual([
      {
        lessons: 2,
        records: 1,
        slug: "bedrock-local-operations",
        title: "Bedrock Local Operations"
      },
      {
        lessons: 2,
        records: 1,
        slug: "react-dashboard-polish",
        title: "React Dashboard Polish"
      },
      {
        lessons: 3,
        records: 2,
        slug: "typescript-pr-review",
        title: "TypeScript PR Review"
      }
    ]);

    const typeScriptTopic = indexed.find((topic) => topic.slug === "typescript-pr-review");

    expect(typeScriptTopic?.lessons.map((lesson) => [lesson.number, lesson.title])).toEqual([
      [1, "Read Runtime First"],
      [2, "Review a Type Change"],
      [3, "Spot Risky Generics"]
    ]);
    expect(typeScriptTopic?.records.map((record) => [record.number, record.title])).toEqual([
      [1, "Values before types"],
      [2, "Prefers review checklists"]
    ]);

    sqlite.close();
  });

  it("preserves app metadata when the workspace is re-indexed", () => {
    const { db, sqlite } = createSqliteConnection();
    runMigrations(sqlite);

    indexWorkspace(db, fixtureRoot);

    const typeScriptTopic = db
      .select()
      .from(topics)
      .where(eq(topics.slug, "typescript-basics"))
      .get();
    const topicGroup = db
      .insert(topicGroups)
      .values({
        name: "Work"
      })
      .returning()
      .get();

    const group = db
      .insert(lessonGroups)
      .values({
        topicId: typeScriptTopic?.id ?? -1,
        name: "Core concepts"
      })
      .returning()
      .get();

    db.update(topics)
      .set({
        displayTitle: "TS Runtime Basics",
        groupId: topicGroup.id
      })
      .where(eq(topics.id, typeScriptTopic?.id ?? -1))
      .run();
    db.update(lessonsIndex)
      .set({ dueAt: "2026-07-15", groupId: group.id, status: "completed" })
      .where(eq(lessonsIndex.topicId, typeScriptTopic?.id ?? -1))
      .run();

    const originalLessons = db
      .select()
      .from(lessonsIndex)
      .where(eq(lessonsIndex.topicId, typeScriptTopic?.id ?? -1))
      .all()
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
    const originalRecords = db
      .select()
      .from(recordsIndex)
      .where(eq(recordsIndex.topicId, typeScriptTopic?.id ?? -1))
      .all()
      .sort((a, b) => a.fileName.localeCompare(b.fileName));

    const indexed = indexWorkspace(db, fixtureRoot);
    const indexedTopic = indexed.find((topic) => topic.slug === "typescript-basics");
    const refreshedTopic = db
      .select()
      .from(topics)
      .where(eq(topics.slug, "typescript-basics"))
      .get();

    const lessons = db
      .select()
      .from(lessonsIndex)
      .where(eq(lessonsIndex.topicId, typeScriptTopic?.id ?? -1))
      .all()
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
    const records = db
      .select()
      .from(recordsIndex)
      .where(eq(recordsIndex.topicId, typeScriptTopic?.id ?? -1))
      .all()
      .sort((a, b) => a.fileName.localeCompare(b.fileName));

    expect(indexedTopic).toMatchObject({
      title: "TS Runtime Basics",
      groupId: topicGroup.id
    });
    expect(refreshedTopic).toMatchObject({
      title: "TypeScript Basics",
      displayTitle: "TS Runtime Basics",
      groupId: topicGroup.id
    });
    expect(lessons.map((lesson) => lesson.id)).toEqual(
      originalLessons.map((lesson) => lesson.id)
    );
    expect(records.map((record) => record.id)).toEqual(originalRecords.map((record) => record.id));
    expect(lessons.map((lesson) => lesson.status)).toEqual(["completed", "completed"]);
    expect(lessons.map((lesson) => lesson.groupId)).toEqual([group.id, group.id]);
    expect(lessons.map((lesson) => lesson.dueAt)).toEqual(["2026-07-15", "2026-07-15"]);

    sqlite.close();
  });

  it("tolerates missing topic child directories", () => {
    const { db, sqlite } = createSqliteConnection();
    runMigrations(sqlite);

    const indexed = indexWorkspace(db, fixtureRoot);
    const halfScaffolded = indexed.find((topic) => topic.slug === "half-scaffolded");

    expect(halfScaffolded).toMatchObject({
      title: "Half Scaffolded",
      lessons: [],
      records: []
    });

    sqlite.close();
  });

  it("ignores hidden workspace directories", () => {
    const root = mkdtempSync(join(tmpdir(), "learning-hub-indexer-"));
    const { db, sqlite } = createSqliteConnection();
    runMigrations(sqlite);

    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "real-topic"));
    writeFileSync(join(root, "real-topic", "MISSION.md"), "# Real Topic\n");

    const indexed = indexWorkspace(db, root);

    expect(indexed.map((topic) => topic.slug)).toEqual(["real-topic"]);
    expect(
      db
        .select()
        .from(topics)
        .all()
        .map((topic) => topic.slug)
    ).toEqual(["real-topic"]);

    sqlite.close();
    rmSync(root, { recursive: true, force: true });
  });
});
