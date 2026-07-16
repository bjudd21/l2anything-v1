CREATE TABLE IF NOT EXISTS lesson_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_groups_topic_name_unique
  ON lesson_groups(topic_id, name);

ALTER TABLE lessons_index
  ADD COLUMN group_id INTEGER REFERENCES lesson_groups(id) ON DELETE SET NULL;
