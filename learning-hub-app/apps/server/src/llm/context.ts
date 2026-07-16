import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";
import { lessonsIndex, recordsIndex } from "../db/schema.js";
import type { topics } from "../db/schema.js";
import { tutorSystemPreamble } from "./prompts/tutor.js";

export interface TutorContextOptions {
  db: AppDatabase;
  lessonId?: number;
  topic: typeof topics.$inferSelect;
}

export interface TutorContext {
  lesson?: typeof lessonsIndex.$inferSelect;
  system: string;
}

const missingMarker = "Not available in this topic workspace.";

function readOptionalText(path: string) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    return null;
  }

  return readFileSync(path, "utf8");
}

function section(title: string, content: string | null) {
  return `## ${title}\n\n${content?.trim() ? content.trim() : missingMarker}`;
}

function compact(content: string, maxLength = 2400) {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function latestRecordSections(db: AppDatabase, topic: typeof topics.$inferSelect) {
  const records = db
    .select()
    .from(recordsIndex)
    .where(eq(recordsIndex.topicId, topic.id))
    .all()
    .sort((a, b) => b.number - a.number)
    .slice(0, 5);

  if (!records.length) {
    return missingMarker;
  }

  return records
    .map((record) => {
      const content = readOptionalText(join(topic.dirPath, "learning-records", record.fileName));
      return [
        `### ${String(record.number).padStart(4, "0")} ${record.title}`,
        content ? compact(content) : missingMarker
      ].join("\n\n");
    })
    .join("\n\n");
}

function lessonIndexSection(db: AppDatabase, topicId: number) {
  const lessons = db
    .select()
    .from(lessonsIndex)
    .where(eq(lessonsIndex.topicId, topicId))
    .all()
    .sort((a, b) => a.number - b.number);

  if (!lessons.length) {
    return missingMarker;
  }

  return lessons
    .map(
      (lesson) =>
        `- ${String(lesson.number).padStart(4, "0")} ${lesson.title} (${lesson.status}) [${lesson.fileName}]`
    )
    .join("\n");
}

function lessonHtmlSection(
  topic: typeof topics.$inferSelect,
  lesson?: typeof lessonsIndex.$inferSelect
) {
  if (!lesson) {
    return "No lesson is active for this chat turn.";
  }

  const html = readOptionalText(join(topic.dirPath, "lessons", lesson.fileName));

  return html ? compact(html, 6000) : missingMarker;
}

export function buildTutorContext({ db, lessonId, topic }: TutorContextOptions): TutorContext {
  const mission = readOptionalText(join(topic.dirPath, "MISSION.md"));
  const notes = readOptionalText(join(topic.dirPath, "NOTES.md"));
  const resources = readOptionalText(join(topic.dirPath, "RESOURCES.md"));
  const lesson = lessonId
    ? db.select().from(lessonsIndex).where(eq(lessonsIndex.id, lessonId)).get()
    : undefined;

  const system = [
    tutorSystemPreamble(),
    "",
    `# Active topic\n\n${topic.title} (${topic.slug})`,
    section("MISSION.md", mission),
    section("NOTES.md", notes),
    section("RESOURCES.md", resources),
    `## Latest learning records\n\n${latestRecordSections(db, topic)}`,
    `## Lesson index\n\n${lessonIndexSection(db, topic.id)}`,
    `## Active lesson HTML\n\n${lessonHtmlSection(topic, lesson)}`
  ].join("\n\n");

  return { lesson, system };
}
