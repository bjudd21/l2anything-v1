import { dashboardResponseSchema } from "@learning-hub/shared";
import { eq } from "drizzle-orm";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import type { ServerConfig } from "../config.js";
import type { AppDatabase } from "../db/client.js";
import { lessonsIndex, recordsIndex, reviewItems } from "../db/schema.js";
import { indexWorkspace } from "../workspace/indexer.js";

export interface DashboardRouteDependencies {
  config: ServerConfig;
  db: AppDatabase;
}

function reviewCounts(db: AppDatabase, topicId: number) {
  const items = db.select().from(reviewItems).where(eq(reviewItems.topicId, topicId)).all();

  return {
    reviewItemCount: items.length,
    dueReviewCount: items.filter((item) => Date.parse(item.dueAt) <= Date.now()).length
  };
}

function todayDateKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function dueLessons(db: AppDatabase, topicId: number) {
  const today = todayDateKey();

  return db
    .select()
    .from(lessonsIndex)
    .where(eq(lessonsIndex.topicId, topicId))
    .all()
    .filter((lesson) => lesson.status !== "completed" && lesson.dueAt && lesson.dueAt <= today)
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "") || a.number - b.number);
}

function lessonDeadlines(
  db: AppDatabase,
  topics: Array<{ id: number; slug: string; title: string }>
) {
  return topics
    .flatMap((topic) =>
      db
        .select()
        .from(lessonsIndex)
        .where(eq(lessonsIndex.topicId, topic.id))
        .all()
        .flatMap((lesson) =>
          lesson.status !== "completed" && lesson.dueAt
            ? [
                {
                  id: lesson.id,
                  topicId: topic.id,
                  topicSlug: topic.slug,
                  topicTitle: topic.title,
                  number: lesson.number,
                  title: lesson.title,
                  dueAt: lesson.dueAt,
                  href: `/t/${encodeURIComponent(topic.slug)}/lessons/${lesson.number}`
                }
              ]
            : []
        )
    )
    .sort(
      (left, right) =>
        left.dueAt.localeCompare(right.dueAt) ||
        left.topicTitle.localeCompare(right.topicTitle) ||
        left.number - right.number
    );
}

function markdownResourceCount(markdown: string | null) {
  if (!markdown) {
    return 0;
  }

  return markdown
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("- [") || line.trim().startsWith("- Local:")).length;
}

function referenceCount(topicDir: string) {
  const referenceDir = join(topicDir, "reference");

  if (!existsSync(referenceDir)) {
    return 0;
  }

  return statSync(referenceDir).isDirectory()
    ? readdirSync(referenceDir, { withFileTypes: true }).filter(
        (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html")
      ).length
    : 0;
}

function firstOpenLesson(db: AppDatabase, topicId: number) {
  return db
    .select()
    .from(lessonsIndex)
    .where(eq(lessonsIndex.topicId, topicId))
    .all()
    .sort((a, b) => a.number - b.number)
    .find((lesson) => lesson.status !== "completed");
}

function missionNeedsInterview(topicDir: string) {
  const path = join(topicDir, "MISSION.md");

  if (!existsSync(path)) {
    return true;
  }

  const mission = readFileSync(path, "utf8");
  return !mission.trim() || mission.includes("_To be established_");
}

export function createDashboardRoutes(dependencies: DashboardRouteDependencies) {
  const routes = new Hono();

  routes.get("/", (context) => {
    const indexed = dependencies.config.LEARNING_HUB_DIR
      ? indexWorkspace(dependencies.db, dependencies.config.LEARNING_HUB_DIR)
      : [];
    const dirPathById = new Map(indexed.map((topic) => [topic.id, topic.dirPath]));
    const topicSummaries = indexed.map((topic) => {
      const lessons = dependencies.db
        .select()
        .from(lessonsIndex)
        .where(eq(lessonsIndex.topicId, topic.id))
        .all();
      const records = dependencies.db
        .select()
        .from(recordsIndex)
        .where(eq(recordsIndex.topicId, topic.id))
        .all();

      return {
        id: topic.id,
        slug: topic.slug,
        title: topic.title,
        groupId: topic.groupId,
        lessonCount: lessons.length,
        completedLessonCount: lessons.filter((lesson) => lesson.status === "completed").length,
        dueLessonCount: dueLessons(dependencies.db, topic.id).length,
        recordCount: records.length,
        resourceCount: markdownResourceCount(
          existsSync(join(topic.dirPath, "RESOURCES.md"))
            ? readFileSync(join(topic.dirPath, "RESOURCES.md"), "utf8")
            : null
        ),
        referenceCount: referenceCount(topic.dirPath),
        ...reviewCounts(dependencies.db, topic.id)
      };
    });
    const recentRecords = dependencies.db
      .select()
      .from(recordsIndex)
      .all()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 5)
      .map((record) => ({
        id: record.id,
        topicId: record.topicId,
        number: record.number,
        fileName: record.fileName,
        title: record.title
      }));
    const totalDueLessons = topicSummaries.reduce(
      (total, topic) => total + topic.dueLessonCount,
      0
    );
    const totalDueReviews = topicSummaries.reduce(
      (total, topic) => total + topic.dueReviewCount,
      0
    );
    const scheduledLessonDeadlines = lessonDeadlines(dependencies.db, topicSummaries);

    // "Up next" follows the teach-skill flow instead of list order:
    // due lesson deadline -> due reviews -> an unfinished lesson -> a mission
    // interview -> generating the first lesson for a ready topic -> plain fallback.
    const dueLessonCandidate = (() => {
      for (const topic of topicSummaries) {
        const lesson = dueLessons(dependencies.db, topic.id)[0];
        if (lesson) {
          return { topic, lesson };
        }
      }
      return undefined;
    })();
    const firstDueTopic = topicSummaries.find((topic) => topic.dueReviewCount > 0);
    const lessonCandidate = (() => {
      for (const topic of topicSummaries) {
        const lesson = firstOpenLesson(dependencies.db, topic.id);
        if (lesson) {
          return { topic, lesson };
        }
      }
      return undefined;
    })();
    const interviewTopic = topicSummaries.find((topic) => {
      const dirPath = dirPathById.get(topic.id);
      return dirPath ? missionNeedsInterview(dirPath) : false;
    });
    const generateTopic = topicSummaries.find((topic) => topic.lessonCount === 0);
    const firstTopic = topicSummaries[0];

    const nextAction = dueLessonCandidate
      ? {
          label: `Finish lesson ${String(dueLessonCandidate.lesson.number).padStart(4, "0")}`,
          description: `${dueLessonCandidate.topic.title}: ${dueLessonCandidate.lesson.title} is due.`,
          href: `/t/${encodeURIComponent(dueLessonCandidate.topic.slug)}/lessons/${dueLessonCandidate.lesson.number}`
        }
      : firstDueTopic
        ? {
            label: "Review due items",
            description: `${firstDueTopic.title} has ${firstDueTopic.dueReviewCount} due review items.`,
            href: `/t/${encodeURIComponent(firstDueTopic.slug)}/review`
          }
        : lessonCandidate
          ? {
              label: `Open lesson ${String(lessonCandidate.lesson.number).padStart(4, "0")}`,
              description: `${lessonCandidate.topic.title}: ${lessonCandidate.lesson.title}`,
              href: `/t/${encodeURIComponent(lessonCandidate.topic.slug)}/lessons/${lessonCandidate.lesson.number}`
            }
          : interviewTopic
            ? {
                label: "Open topic overview",
                description: `${interviewTopic.title} needs a mission before lessons can stay grounded.`,
                href: `/t/${encodeURIComponent(interviewTopic.slug)}`
              }
            : generateTopic
              ? {
                  label: "Generate the first lesson",
                  description: `${generateTopic.title} has a mission and is ready for its first lesson.`,
                  href: `/t/${encodeURIComponent(generateTopic.slug)}`
                }
              : firstTopic
                ? {
                    label: "Continue topic",
                    description: `${firstTopic.title} is ready for the next action.`,
                    href: `/t/${encodeURIComponent(firstTopic.slug)}`
                  }
                : {
                    label: "Create a topic",
                    description: "Start with a mission interview.",
                    href: "/topics/new"
                  };

    return context.json(
      dashboardResponseSchema.parse({
        ok: true,
        dueLessonCount: totalDueLessons,
        dueReviewCount: totalDueReviews,
        lessonDeadlines: scheduledLessonDeadlines,
        recentRecords,
        topics: topicSummaries,
        nextAction
      })
    );
  });

  return routes;
}
