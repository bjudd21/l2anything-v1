import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteConnection } from "./client.js";
import { runMigrations } from "./migrate.js";

const tempDirs: string[] = [];

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "learning-hub-db-"));
  tempDirs.push(dir);
  return join(dir, "test.sqlite");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("runMigrations", () => {
  it("creates the build-plan tables in a temp database", () => {
    const { sqlite } = createSqliteConnection(makeTempDb());

    runMigrations(sqlite);

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "topics",
        "topic_groups",
        "lesson_groups",
        "lessons_index",
        "records_index",
        "chat_sessions",
        "chat_messages",
        "quizzes",
        "quiz_attempts",
        "review_items",
        "app_settings"
      ])
    );

    const reviewColumns = sqlite
      .prepare("PRAGMA table_info(review_items)")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(reviewColumns).toContain("source_quiz_id");

    sqlite.close();
  });

  it("is idempotent", () => {
    const { sqlite } = createSqliteConnection(makeTempDb());

    runMigrations(sqlite);
    runMigrations(sqlite);

    const migrationCount = sqlite.prepare("SELECT count(*) AS count FROM _migrations").get() as {
      count: number;
    };

    expect(migrationCount.count).toBe(5);
    sqlite.close();
  });
});
