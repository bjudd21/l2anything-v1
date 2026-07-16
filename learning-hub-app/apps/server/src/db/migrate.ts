import type Database from "better-sqlite3";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultMigrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const sourceMigrationsDir = join(process.cwd(), "apps", "server", "src", "db", "migrations");
const packageSourceMigrationsDir = join(process.cwd(), "src", "db", "migrations");

function resolveMigrationsDir(migrationsDir: string) {
  if (existsSync(migrationsDir)) {
    return migrationsDir;
  }

  if (existsSync(sourceMigrationsDir)) {
    return sourceMigrationsDir;
  }

  if (existsSync(packageSourceMigrationsDir)) {
    return packageSourceMigrationsDir;
  }

  return migrationsDir;
}

export function runMigrations(sqlite: Database.Database, migrationsDir = defaultMigrationsDir) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = new Set(
    sqlite
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => (row as { name: string }).name)
  );

  const resolvedMigrationsDir = resolveMigrationsDir(migrationsDir);
  const migrationFiles = readdirSync(resolvedMigrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  const applyMigration = sqlite.transaction((fileName: string, sql: string) => {
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO _migrations (name) VALUES (?)").run(fileName);
  });

  for (const fileName of migrationFiles) {
    if (applied.has(fileName)) {
      continue;
    }

    applyMigration(fileName, readFileSync(join(resolvedMigrationsDir, fileName), "utf8"));
  }
}
