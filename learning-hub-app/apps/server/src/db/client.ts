import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as appSchema from "./schema.js";

export type AppDatabase = BetterSQLite3Database<typeof appSchema.schema>;

export function createSqliteConnection(path = ":memory:") {
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");

  return {
    sqlite,
    db: drizzle(sqlite, { schema: appSchema.schema })
  };
}
