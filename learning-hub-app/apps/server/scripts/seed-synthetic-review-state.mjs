import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "../../..");
const repoRoot = resolve(scriptDir, "../../../..");
const envPath = resolve(appRoot, ".env");
const seedPath = resolve(repoRoot, "data/l2anything-synthetic-review-state.json");

function readEnv(path) {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const splitAt = line.indexOf("=");
        if (splitAt === -1) {
          return null;
        }

        const key = line.slice(0, splitAt).trim();
        const rawValue = line.slice(splitAt + 1).trim();
        const value = rawValue.replace(/^["']|["']$/g, "");
        return [key, value];
      })
      .filter(Boolean)
  );
}

function resolveFromAppRoot(path) {
  return isAbsolute(path) ? path : resolve(appRoot, path);
}

function dueAt(offsetDays) {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString();
}

function lastActiveAt(offsetDays) {
  const value = new Date();
  value.setHours(9, 30, 0, 0);
  value.setDate(value.getDate() - offsetDays);
  return value.toISOString();
}

const env = { ...process.env, ...readEnv(envPath) };
const dbPath = resolveFromAppRoot(
  env.DB_PATH || resolve(appRoot, "apps/server/.data/learning-hub.sqlite")
);

if (!existsSync(dbPath)) {
  console.error(`Database does not exist: ${dbPath}`);
  console.error("Start the app and load /api/topics once so the workspace is indexed, then rerun.");
  process.exit(1);
}

if (!existsSync(seedPath)) {
  console.error(`Seed file does not exist: ${seedPath}`);
  process.exit(1);
}

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const findTopic = db.prepare("SELECT id, slug FROM topics WHERE slug = ?");
const findSourceRecord = db.prepare(
  "SELECT id FROM records_index WHERE topic_id = ? ORDER BY number LIMIT 1"
);
const deleteSeedItem = db.prepare(
  "DELETE FROM review_items WHERE topic_id = ? AND concept = ?"
);
const insertReviewItem = db.prepare(`
  INSERT INTO review_items (topic_id, concept, source_record_id, ease, interval_days, due_at)
  VALUES (@topicId, @concept, @sourceRecordId, @ease, @intervalDays, @dueAt)
`);
const updateTopicState = db.prepare(`
  UPDATE topics SET last_active_at = @lastActiveAt WHERE slug = @topicSlug
`);

const insertSeed = db.transaction((seedData) => {
  const inserted = [];
  const missingTopics = new Set();

  for (const topicState of seedData.topics ?? []) {
    const result = updateTopicState.run({
      lastActiveAt: lastActiveAt(topicState.lastActiveOffsetDays ?? 0),
      topicSlug: topicState.topicSlug
    });
    if (!result.changes) {
      missingTopics.add(topicState.topicSlug);
    }
  }

  for (const item of seedData.items ?? []) {
    const topic = findTopic.get(item.topicSlug);
    if (!topic) {
      missingTopics.add(item.topicSlug);
      continue;
    }

    const sourceRecord = findSourceRecord.get(topic.id);
    deleteSeedItem.run(topic.id, item.concept);
    insertReviewItem.run({
      concept: item.concept,
      dueAt: dueAt(item.dueOffsetDays),
      ease: item.ease,
      intervalDays: item.intervalDays,
      sourceRecordId: sourceRecord?.id ?? null,
      topicId: topic.id
    });
    inserted.push(item);
  }

  return { inserted, missingTopics: [...missingTopics] };
});

const result = insertSeed(seed);

console.log(`Seeded ${result.inserted.length} synthetic due review items and topic activity into ${dbPath}`);
if (result.missingTopics.length) {
  console.log(`Skipped missing topics: ${result.missingTopics.join(", ")}`);
}
