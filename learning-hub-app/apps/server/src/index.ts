import { serve } from "@hono/node-server";
import { config as loadDotenv } from "dotenv";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createSqliteConnection } from "./db/client.js";

const serverDir = dirname(fileURLToPath(import.meta.url));
loadDotenv({ override: true, path: resolve(serverDir, "../../../.env") });

const config = loadConfig();
const defaultWorkspaceDir = resolve(serverDir, "../../../local-learning-hub");
config.LEARNING_HUB_DIR ??= defaultWorkspaceDir;
mkdirSync(config.LEARNING_HUB_DIR, { recursive: true });
// Persist app state (settings, lesson status, review schedule) across restarts.
// Tests keep using in-memory databases via createApp's default.
const dbPath = config.DB_PATH ?? resolve(serverDir, "../.data/learning-hub.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
const app = createApp(config, {
  database: createSqliteConnection(dbPath)
});

serve(
  {
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: config.PORT
  },
  (info) => {
    console.log(`Learning Hub server listening on http://127.0.0.1:${info.port}`);
  }
);
