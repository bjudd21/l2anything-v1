import { eq } from "drizzle-orm";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AppDatabase } from "../db/client.js";
import { lessonsIndex, recordsIndex, topics } from "../db/schema.js";
import { assertInsideRoot, normalizeWorkspaceRoot } from "./path.js";
import { parseLessonNumber, parseLessonTitle, parseRecordTitle, parseTopicTitle } from "./title.js";

export interface IndexedLesson {
  number: number;
  fileName: string;
  title: string;
}

export interface IndexedRecord {
  number: number;
  fileName: string;
  title: string;
}

export interface IndexedTopic {
  id: number;
  slug: string;
  dirPath: string;
  title: string;
  groupId: number | null;
  lessons: IndexedLesson[];
  records: IndexedRecord[];
}

function readIfExists(path: string) {
  if (!existsSync(path)) {
    return null;
  }

  return readFileSync(path, "utf8");
}

function listFiles(directory: string, extension: string) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
    .map((entry) => entry.name)
    .sort();
}

function indexLessons(topicDir: string) {
  const lessonsDir = join(topicDir, "lessons");

  return listFiles(lessonsDir, ".html")
    .map((fileName) => {
      const number = parseLessonNumber(fileName);
      if (number === null) {
        return null;
      }

      const html = readFileSync(join(lessonsDir, fileName), "utf8");
      return {
        number,
        fileName,
        title: parseLessonTitle(html, fileName)
      };
    })
    .filter((lesson): lesson is IndexedLesson => lesson !== null);
}

function indexRecords(topicDir: string) {
  const recordsDir = join(topicDir, "learning-records");

  return listFiles(recordsDir, ".md")
    .map((fileName) => {
      const number = parseLessonNumber(fileName);
      if (number === null) {
        return null;
      }

      const markdown = readFileSync(join(recordsDir, fileName), "utf8");
      return {
        number,
        fileName,
        title: parseRecordTitle(markdown, fileName)
      };
    })
    .filter((record): record is IndexedRecord => record !== null);
}

function upsertTopic(db: AppDatabase, slug: string, dirPath: string, title: string) {
  db.insert(topics)
    .values({
      slug,
      dirPath,
      title
    })
    .onConflictDoUpdate({
      target: topics.slug,
      set: {
        dirPath,
        title
      }
    })
    .run();

  const topic = db.select().from(topics).where(eq(topics.slug, slug)).get();
  if (!topic) {
    throw new Error(`Failed to index topic ${slug}`);
  }

  return topic;
}

function replaceTopicChildren(
  db: AppDatabase,
  topicId: number,
  lessons: IndexedLesson[],
  records: IndexedRecord[]
) {
  const existingLessons = db
    .select()
    .from(lessonsIndex)
    .where(eq(lessonsIndex.topicId, topicId))
    .all();
  const existingLessonsByFile = new Map(
    existingLessons.map((lesson) => [lesson.fileName, lesson])
  );
  const indexedLessonFiles = new Set(lessons.map((lesson) => lesson.fileName));

  for (const lesson of lessons) {
    const existing = existingLessonsByFile.get(lesson.fileName);

    if (existing) {
      db.update(lessonsIndex)
        .set({
          number: lesson.number,
          title: lesson.title
        })
        .where(eq(lessonsIndex.id, existing.id))
        .run();
      continue;
    }

    db.insert(lessonsIndex)
      .values({
        topicId,
        number: lesson.number,
        fileName: lesson.fileName,
        title: lesson.title,
        status: "unread",
        groupId: null,
        dueAt: null
      })
      .run();
  }

  for (const existing of existingLessons) {
    if (!indexedLessonFiles.has(existing.fileName)) {
      db.delete(lessonsIndex).where(eq(lessonsIndex.id, existing.id)).run();
    }
  }

  const existingRecords = db
    .select()
    .from(recordsIndex)
    .where(eq(recordsIndex.topicId, topicId))
    .all();
  const existingRecordsByFile = new Map(existingRecords.map((record) => [record.fileName, record]));
  const indexedRecordFiles = new Set(records.map((record) => record.fileName));

  for (const record of records) {
    const existing = existingRecordsByFile.get(record.fileName);

    if (existing) {
      db.update(recordsIndex)
        .set({
          number: record.number,
          title: record.title
        })
        .where(eq(recordsIndex.id, existing.id))
        .run();
      continue;
    }

    db.insert(recordsIndex)
      .values({
        topicId,
        number: record.number,
        fileName: record.fileName,
        title: record.title
      })
      .run();
  }

  for (const existing of existingRecords) {
    if (!indexedRecordFiles.has(existing.fileName)) {
      db.delete(recordsIndex).where(eq(recordsIndex.id, existing.id)).run();
    }
  }
}

export function indexWorkspace(db: AppDatabase, rootDir: string): IndexedTopic[] {
  const root = normalizeWorkspaceRoot(rootDir);

  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => {
      const slug = entry.name;
      const topicDir = assertInsideRoot(root, slug);
      const mission = readIfExists(join(topicDir, "MISSION.md"));
      const title = parseTopicTitle(mission, slug);
      const lessons = indexLessons(topicDir);
      const records = indexRecords(topicDir);
      const topic = upsertTopic(db, slug, topicDir, title);

      replaceTopicChildren(db, topic.id, lessons, records);

      return {
        id: topic.id,
        slug,
        dirPath: topicDir,
        title: topic.displayTitle?.trim() || topic.title,
        groupId: topic.groupId,
        lessons,
        records
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
