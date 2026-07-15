import { relations, sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const topicGroups = sqliteTable(
  "topic_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    collapsed: integer("collapsed", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [uniqueIndex("topic_groups_name_unique").on(table.name)]
);

export const topics = sqliteTable(
  "topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    dirPath: text("dir_path").notNull(),
    title: text("title").notNull(),
    displayTitle: text("display_title"),
    groupId: integer("group_id").references(() => topicGroups.id, { onDelete: "set null" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastActiveAt: text("last_active_at")
  },
  (table) => [uniqueIndex("topics_slug_unique").on(table.slug)]
);

export const lessonGroups = sqliteTable(
  "lesson_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [uniqueIndex("lesson_groups_topic_name_unique").on(table.topicId, table.name)]
);

export const lessonsIndex = sqliteTable(
  "lessons_index",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    fileName: text("file_name").notNull(),
    title: text("title").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    status: text("status", { enum: ["unread", "in_progress", "completed"] })
      .notNull()
      .default("unread"),
    groupId: integer("group_id").references(() => lessonGroups.id, { onDelete: "set null" }),
    dueAt: text("due_at")
  },
  (table) => [uniqueIndex("lessons_topic_file_unique").on(table.topicId, table.fileName)]
);

export const recordsIndex = sqliteTable(
  "records_index",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    fileName: text("file_name").notNull(),
    title: text("title").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [uniqueIndex("records_topic_file_unique").on(table.topicId, table.fileName)]
);

export const chatSessions = sqliteTable("chat_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").references(() => lessonsIndex.id, { onDelete: "set null" }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  contentJson: text("content_json").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const quizzes = sqliteTable("quizzes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  sourceLessonId: integer("source_lesson_id").references(() => lessonsIndex.id, {
    onDelete: "set null"
  }),
  questionsJson: text("questions_json").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const quizAttempts = sqliteTable("quiz_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quizId: integer("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  answersJson: text("answers_json").notNull(),
  score: real("score").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const reviewItems = sqliteTable("review_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  concept: text("concept").notNull(),
  sourceRecordId: integer("source_record_id").references(() => recordsIndex.id, {
    onDelete: "set null"
  }),
  ease: real("ease").notNull().default(2.5),
  intervalDays: integer("interval_days").notNull().default(1),
  dueAt: text("due_at").notNull()
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull()
});

export const topicsRelations = relations(topics, ({ many, one }) => ({
  group: one(topicGroups, {
    fields: [topics.groupId],
    references: [topicGroups.id]
  }),
  lessons: many(lessonsIndex),
  lessonGroups: many(lessonGroups),
  records: many(recordsIndex),
  chatSessions: many(chatSessions),
  quizzes: many(quizzes),
  reviewItems: many(reviewItems)
}));

export const topicGroupsRelations = relations(topicGroups, ({ many }) => ({
  topics: many(topics)
}));

export const lessonsRelations = relations(lessonsIndex, ({ one, many }) => ({
  topic: one(topics, {
    fields: [lessonsIndex.topicId],
    references: [topics.id]
  }),
  group: one(lessonGroups, {
    fields: [lessonsIndex.groupId],
    references: [lessonGroups.id]
  }),
  chatSessions: many(chatSessions),
  quizzes: many(quizzes)
}));

export const lessonGroupsRelations = relations(lessonGroups, ({ one, many }) => ({
  topic: one(topics, {
    fields: [lessonGroups.topicId],
    references: [topics.id]
  }),
  lessons: many(lessonsIndex)
}));

export const recordsRelations = relations(recordsIndex, ({ one, many }) => ({
  topic: one(topics, {
    fields: [recordsIndex.topicId],
    references: [topics.id]
  }),
  reviewItems: many(reviewItems)
}));

export const schema = {
  topicGroups,
  topics,
  lessonGroups,
  lessonsIndex,
  recordsIndex,
  chatSessions,
  chatMessages,
  quizzes,
  quizAttempts,
  reviewItems,
  appSettings
};
