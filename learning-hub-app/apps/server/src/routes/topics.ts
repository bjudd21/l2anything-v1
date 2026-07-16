import {
  chatStreamEventSchema,
  lessonDeleteResponseSchema,
  lessonDueDateUpdateSchema,
  lessonGroupAssignSchema,
  lessonGroupCreateSchema,
  lessonGroupResponseSchema,
  lessonStatusResponseSchema,
  lessonStatusUpdateSchema,
  lessonTitleUpdateSchema,
  quizGenerateRequestSchema,
  quizGenerateResponseSchema,
  quizQuestionSchema,
  reviewRatingRequestSchema,
  reviewRatingResponseSchema,
  topicCreateRequestSchema,
  topicDeleteResponseSchema,
  topicDetailResponseSchema,
  topicFileResponseSchema,
  topicGroupAssignSchema,
  topicGroupCreateSchema,
  topicGroupDeleteResponseSchema,
  topicGroupResponseSchema,
  topicGroupUpdateSchema,
  topicInterviewRequestSchema,
  topicLessonsResponseSchema,
  topicRecordsResponseSchema,
  topicReferenceResponseSchema,
  topicReviewResponseSchema,
  topicStatusResponseSchema,
  topicTitleUpdateSchema,
  topicsResponseSchema,
  type ChatStreamEvent,
  type ChatUsage,
  type LessonGroup,
  type LessonSummary,
  type QuizQuestion,
  type RecordSummary,
  type TopicInterviewMessage,
  type TopicGroup,
  type TopicSummary
} from "@learning-hub/shared";
import { and, eq } from "drizzle-orm";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, join, relative } from "node:path";
import { Hono } from "hono";
import { codeToHtml } from "shiki";
import type { AppDatabase } from "../db/client.js";
import {
  lessonGroups,
  lessonsIndex,
  quizzes,
  recordsIndex,
  reviewItems,
  topicGroups,
  topics
} from "../db/schema.js";
import { runTutorAgent } from "../llm/agent.js";
import { buildTutorContext } from "../llm/context.js";
import { buildLessonGenerationRequest } from "../llm/prompts/tutor.js";
import { createTutorToolRegistry } from "../llm/tools/registry.js";
import type { AgentMessage } from "../llm/types.js";
import { nextReviewSchedule } from "../review/scheduler.js";
import { scaffoldTopic } from "../workspace/scaffold.js";
import { indexWorkspace } from "../workspace/indexer.js";
import { assertInsideRoot, WorkspacePathError } from "../workspace/path.js";
import { parseLessonTitle } from "../workspace/title.js";
import type { ServerConfig } from "../config.js";
import { createTopicChatRoutes, type TopicChatRouteDependencies } from "./chat.js";
import { createConfiguredChatProvider } from "./settings.js";

export interface TopicsRouteDependencies {
  chatProvider?: TopicChatRouteDependencies["chatProvider"];
  config: ServerConfig;
  db: AppDatabase;
}

const fileNamesByKind = {
  mission: "MISSION.md",
  notes: "NOTES.md",
  resources: "RESOURCES.md"
} as const;

type FileKind = keyof typeof fileNamesByKind;

function completedLessonCount(db: AppDatabase, topicId: number) {
  return db
    .select()
    .from(lessonsIndex)
    .where(eq(lessonsIndex.topicId, topicId))
    .all()
    .filter((lesson) => lesson.status === "completed").length;
}

function todayDateKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function lessonDueCount(db: AppDatabase, topicId: number) {
  const today = todayDateKey();

  return db
    .select()
    .from(lessonsIndex)
    .where(eq(lessonsIndex.topicId, topicId))
    .all()
    .filter((lesson) => lesson.status !== "completed" && lesson.dueAt && lesson.dueAt <= today)
    .length;
}

function reviewCounts(db: AppDatabase, topicId: number) {
  const items = db.select().from(reviewItems).where(eq(reviewItems.topicId, topicId)).all();

  return {
    reviewItemCount: items.length,
    dueReviewCount: items.filter((item) => Date.parse(item.dueAt) <= Date.now()).length
  };
}

function effectiveTopicTitle(topic: typeof topics.$inferSelect) {
  return topic.displayTitle?.trim() || topic.title;
}

function topicSummary(db: AppDatabase, topic: typeof topics.$inferSelect): TopicSummary {
  const lessons = db.select().from(lessonsIndex).where(eq(lessonsIndex.topicId, topic.id)).all();
  const records = db.select().from(recordsIndex).where(eq(recordsIndex.topicId, topic.id)).all();

  return {
    id: topic.id,
    slug: topic.slug,
    title: effectiveTopicTitle(topic),
    groupId: topic.groupId,
    lessonCount: lessons.length,
    completedLessonCount: lessons.filter((lesson) => lesson.status === "completed").length,
    dueLessonCount: lessonDueCount(db, topic.id),
    recordCount: records.length,
    resourceCount: markdownResourceCount(
      textContent(readTopicFile(topic.dirPath, "resources")?.content ?? null)
    ),
    referenceCount: listReferenceDocs(topic.dirPath).length,
    ...reviewCounts(db, topic.id),
    lastActiveAt: topic.lastActiveAt
  };
}

function lessonSummary(lesson: typeof lessonsIndex.$inferSelect): LessonSummary {
  return {
    id: lesson.id,
    topicId: lesson.topicId,
    number: lesson.number,
    fileName: lesson.fileName,
    title: lesson.title,
    status: lesson.status,
    groupId: lesson.groupId,
    dueAt: lesson.dueAt
  };
}

function lessonGroupSummary(group: typeof lessonGroups.$inferSelect): LessonGroup {
  return {
    id: group.id,
    topicId: group.topicId,
    name: group.name
  };
}

function topicGroupSummary(group: typeof topicGroups.$inferSelect): TopicGroup {
  return {
    id: group.id,
    name: group.name,
    collapsed: group.collapsed
  };
}

function recordSummary(record: typeof recordsIndex.$inferSelect): RecordSummary {
  return {
    id: record.id,
    topicId: record.topicId,
    number: record.number,
    fileName: record.fileName,
    title: record.title
  };
}

function parsePositiveId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function syncWorkspace({ config, db }: TopicsRouteDependencies) {
  if (!config.LEARNING_HUB_DIR) {
    return false;
  }

  indexWorkspace(db, config.LEARNING_HUB_DIR);
  return true;
}

function getTopic(dependencies: TopicsRouteDependencies, id: number) {
  if (!syncWorkspace(dependencies)) {
    return null;
  }

  return dependencies.db.select().from(topics).where(eq(topics.id, id)).get() ?? null;
}

function safeFileName(fileName: string) {
  return (
    fileName === basename(fileName) &&
    fileName !== "." &&
    fileName !== ".." &&
    !fileName.includes("/") &&
    !fileName.includes("\\")
  );
}

function readTopicFile(topicDir: string, kind: FileKind) {
  const fileName = fileNamesByKind[kind];
  const path = join(topicDir, fileName);

  if (!existsSync(path) || !statSync(path).isFile()) {
    return null;
  }

  return {
    fileName,
    content: readFileSync(path)
  };
}

function textContent(buffer: Buffer | null) {
  return buffer ? buffer.toString("utf8") : null;
}

function markdownResourceCount(markdown: string | null) {
  if (!markdown) {
    return 0;
  }

  return markdown
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("- [") || line.trim().startsWith("- Local:")).length;
}

function listReferenceDocs(topicDir: string) {
  const referenceDir = join(topicDir, "reference");

  if (!existsSync(referenceDir) || !statSync(referenceDir).isDirectory()) {
    return [];
  }

  return readdirSync(referenceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) => {
      const html = readFileSync(join(referenceDir, entry.name), "utf8");
      return {
        fileName: entry.name,
        title: parseLessonTitle(html, entry.name)
      };
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

type RawHtmlResponseOptions = {
  normalizeLesson?: boolean;
};

const lessonViewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1">';

const lessonReaderTheme = `<style id="learning-hub-lesson-theme">
:root {
  color-scheme: dark;
  --lh-reader-text: oklch(0.9911 0 0);
  --lh-reader-muted: oklch(0.7118 0.0129 286.0665);
  --lh-reader-soft: oklch(0.62 0.0129 286.0665);
  --lh-reader-panel: oklch(0.2145 0.0184 270.4182 / 0.72);
  --lh-reader-panel-strong: oklch(0.2604 0.0471 267.4902 / 0.82);
  --lh-reader-border: oklch(0.2739 0.0055 286.0326 / 0.72);
  --lh-reader-field: oklch(0.1645 0.0086 274.3354 / 0.9);
  --lh-reader-accent: oklch(0.6453 0.2404 27.3106);
  --lh-reader-accent-strong: oklch(0.6986 0.1954 14.1660);
  --lh-reader-accent-soft: oklch(0.2604 0.0471 267.4902 / 0.72);
  --lh-reader-accent-foreground: oklch(1 0 0);
}

html {
  width: 100% !important;
  min-width: 0 !important;
  background: transparent !important;
}

body {
  box-sizing: border-box !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: min(900px, calc(100vw - 48px)) !important;
  margin: 0 auto !important;
  padding: 34px 28px 52px !important;
  background: transparent !important;
  color: var(--lh-reader-muted) !important;
  font-family: "Inter", "Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, sans-serif !important;
  font-size: 16px !important;
  line-height: 1.65 !important;
  overflow-wrap: break-word;
  text-rendering: geometricprecision;
}

body * {
  box-sizing: border-box;
  letter-spacing: 0 !important;
}

main,
body > div,
body > section,
body > article {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

h1,
h2,
h3,
h4,
strong,
b,
dt,
legend {
  color: var(--lh-reader-text) !important;
}

h1 {
  margin: 0 0 8px !important;
  font-size: 30px !important;
  line-height: 1.16 !important;
}

h2 {
  margin: 30px 0 10px !important;
  font-size: 22px !important;
  line-height: 1.25 !important;
}

h3 {
  margin: 22px 0 8px !important;
  font-size: 18px !important;
  line-height: 1.3 !important;
}

h1,
h2,
h3,
h4 {
  border-color: var(--lh-reader-border) !important;
}

h2 {
  border: 0 !important;
  background-image: none !important;
  box-shadow: none !important;
  padding-bottom: 0 !important;
}

h2::before,
h2::after {
  display: none !important;
  content: none !important;
}

p,
li,
dd,
td,
th,
label,
.sub,
.cite,
.caption,
.kicker,
.kana-sound,
.mnemonic,
#feedback,
footer {
  color: var(--lh-reader-muted) !important;
}

a {
  color: var(--lh-reader-accent-strong) !important;
  text-decoration-color: color-mix(in oklch, var(--lh-reader-accent) 55%, transparent) !important;
  text-underline-offset: 3px !important;
}

hr {
  border: 0 !important;
  border-top: 1px solid var(--lh-reader-border) !important;
}

section {
  border-color: var(--lh-reader-border) !important;
}

img,
svg,
video,
canvas {
  max-width: 100% !important;
}

blockquote,
details,
summary,
.why,
.exercise,
.recall,
.recall-box,
.kana-card,
.card,
.callout,
.note,
.practice,
.quiz {
  border: 1px solid var(--lh-reader-border) !important;
  border-radius: 8px !important;
  background: var(--lh-reader-panel) !important;
  box-shadow: none !important;
  color: var(--lh-reader-muted) !important;
}

blockquote,
.why,
.exercise,
.recall,
.recall-box,
.callout,
.note,
.practice,
.quiz {
  margin: 18px 0 !important;
  padding: 16px 18px !important;
}

.why {
  border-left: 1px solid var(--lh-reader-border) !important;
}

.kana-card,
.card {
  padding: 16px !important;
}

.kana-card *,
.card *,
.why *,
.exercise *,
.recall *,
.recall-box *,
.callout *,
.note *,
.practice *,
.quiz * {
  color: inherit !important;
}

.kana,
.kana-glyph,
.glyph,
.glyph-big,
.kana-card strong,
.card strong {
  color: var(--lh-reader-text) !important;
}

.romaji,
.kana-romaji,
.kana-card .romaji {
  color: var(--lh-reader-accent-strong) !important;
}

.correct {
  color: oklch(0.74 0.12 152) !important;
}

.wrong,
.incorrect {
  color: oklch(0.71 0.14 25) !important;
}

.kana-grid {
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)) !important;
  gap: 10px !important;
}

pre,
code,
kbd,
samp {
  border-radius: 7px !important;
  background: var(--lh-reader-field) !important;
  color: var(--lh-reader-text) !important;
}

pre {
  border: 1px solid var(--lh-reader-border) !important;
  overflow-x: auto !important;
  padding: 14px !important;
}

code,
kbd,
samp {
  padding: 0.12rem 0.34rem !important;
}

table {
  width: 100% !important;
  border-collapse: collapse !important;
}

th,
td {
  border-color: var(--lh-reader-border) !important;
}

input,
textarea,
select {
  min-height: 40px !important;
  border: 1px solid var(--lh-reader-border) !important;
  border-radius: 8px !important;
  background: var(--lh-reader-field) !important;
  color: var(--lh-reader-text) !important;
  font: inherit !important;
}

input,
select {
  padding: 0 12px !important;
}

textarea {
  padding: 10px 12px !important;
}

input::placeholder,
textarea::placeholder {
  color: var(--lh-reader-soft) !important;
}

button,
input[type="button"],
input[type="submit"],
input[type="reset"] {
  min-height: 40px !important;
  border: 1px solid color-mix(in oklch, var(--lh-reader-accent) 52%, transparent) !important;
  border-radius: 8px !important;
  background: var(--lh-reader-accent) !important;
  color: var(--lh-reader-accent-foreground) !important;
  font: inherit !important;
  font-weight: 700 !important;
  padding: 0 14px !important;
  cursor: pointer !important;
}

button:hover,
input[type="button"]:hover,
input[type="submit"]:hover,
input[type="reset"]:hover {
  background: var(--lh-reader-accent-strong) !important;
}

button:disabled,
input:disabled,
textarea:disabled,
select:disabled {
  cursor: not-allowed !important;
  opacity: 0.58 !important;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
a:focus-visible {
  outline: 2px solid var(--lh-reader-accent) !important;
  outline-offset: 2px !important;
}

@media (max-width: 640px) {
  body {
    max-width: none !important;
    padding: 24px 18px 40px !important;
    font-size: 15px !important;
  }

  h1 {
    font-size: 26px !important;
  }

  h2 {
    font-size: 20px !important;
  }
}
</style>`;

const lessonCodeStyles = `<style id="learning-hub-lesson-code">
pre.shiki,
pre[data-learning-hub-highlight="fallback"] {
  border: 1px solid var(--lh-reader-border) !important;
  border-radius: 10px !important;
  background: var(--lh-reader-field) !important;
  margin: 18px 0 !important;
  padding: 14px 16px !important;
  overflow-x: auto !important;
  font-size: 13.5px !important;
  line-height: 1.6 !important;
}

pre.shiki code,
pre[data-learning-hub-highlight="fallback"] code {
  display: block !important;
  background: transparent !important;
  padding: 0 !important;
}
</style>`;

const codeLanguageAliases: Record<string, string> = {
  bash: "shellscript",
  csharp: "csharp",
  cs: "csharp",
  html: "html",
  js: "javascript",
  jsx: "jsx",
  md: "markdown",
  plaintext: "text",
  ps1: "powershell",
  pwsh: "powershell",
  py: "python",
  rs: "rust",
  sh: "shellscript",
  shell: "shellscript",
  ts: "typescript",
  tsx: "tsx",
  txt: "text",
  yml: "yaml",
  zsh: "shellscript"
};

function decodeHtml(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    const normalized = name.toLowerCase();

    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }

    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }

    return namedEntities[normalized] ?? entity;
  });
}

function codeTextFromHtml(html: string) {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));
}

function codeLanguageFromAttributes(attributes: string) {
  const classMatch = /class\s*=\s*["']([^"']+)["']/i.exec(attributes);
  const classLanguage = classMatch?.[1]
    ?.split(/\s+/)
    .find((className) => /^(?:language|lang)-/i.test(className))
    ?.replace(/^(?:language|lang)-/i, "");
  const dataLanguage = /data-(?:language|lang)\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ?? "";
  const rawLanguage = (classLanguage || dataLanguage || "text").toLowerCase();
  const sanitized = rawLanguage.replace(/[^a-z0-9_+-]/g, "");

  return codeLanguageAliases[sanitized] ?? (sanitized || "text");
}

function extractPreCode(preAttributes: string, content: string) {
  const codeMatch = /^\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*$/i.exec(content);
  const codeAttributes = codeMatch?.[1] ?? "";
  const codeHtml = codeMatch?.[2] ?? content;

  return {
    code: codeTextFromHtml(codeHtml),
    language: codeLanguageFromAttributes(`${preAttributes} ${codeAttributes}`)
  };
}

function fallbackCodeBlock(code: string, language: string) {
  const languageClass = language === "text" ? "" : ` class="language-${escapeHtml(language)}"`;

  return `<pre data-learning-hub-highlight="fallback"><code${languageClass}>${escapeHtml(code)}</code></pre>`;
}

async function highlightedCodeBlock(code: string, language: string) {
  try {
    const highlighted = await codeToHtml(code, {
      lang: language,
      theme: "github-dark"
    });

    return highlighted.replace("<pre", '<pre data-learning-hub-highlight="shiki"');
  } catch {
    if (language !== "text") {
      return highlightedCodeBlock(code, "text");
    }

    return fallbackCodeBlock(code, language);
  }
}

async function highlightLessonCodeBlocks(html: string) {
  const pattern = /<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi;
  let next = "";
  let lastIndex = 0;

  for (const match of html.matchAll(pattern)) {
    const index = match.index ?? 0;
    const fullMatch = match[0] ?? "";
    const preAttributes = match[1] ?? "";
    const content = match[2] ?? "";
    const { code, language } = extractPreCode(preAttributes, content);

    next += html.slice(lastIndex, index);
    next += await highlightedCodeBlock(code, language);
    lastIndex = index + fullMatch.length;
  }

  return lastIndex === 0 ? html : next + html.slice(lastIndex);
}

async function normalizeLessonHtml(html: string) {
  if (html.includes('id="learning-hub-lesson-theme"')) {
    return html;
  }

  const highlightedHtml = await highlightLessonCodeBlocks(html);
  const viewport = /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(highlightedHtml)
    ? ""
    : `${lessonViewportMeta}\n`;
  const injection = `${viewport}${lessonReaderTheme}\n${lessonCodeStyles}`;

  if (/<\/head>/i.test(highlightedHtml)) {
    return highlightedHtml.replace(/<\/head>/i, `${injection}\n</head>`);
  }

  if (/<html\b[^>]*>/i.test(highlightedHtml)) {
    return highlightedHtml.replace(/(<html\b[^>]*>)/i, `$1\n<head>\n${injection}\n</head>`);
  }

  return `${injection}\n${highlightedHtml}`;
}

async function rawHtmlResponse(html: Buffer, options: RawHtmlResponseOptions = {}) {
  const text = html.toString("utf8");

  return new Response(options.normalizeLesson ? await normalizeLessonHtml(text) : text, {
    headers: {
      "content-security-policy": "sandbox allow-scripts",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}

function parseQuestionsJson(questionsJson: string) {
  return JSON.parse(questionsJson) as unknown;
}

function reviewAnswerGuide(question: QuizQuestion) {
  if (question.type === "mcq") {
    const answer = question.options.find((option) => option.id === question.answer)?.label;
    const answerText = answer
      ? `Correct answer: ${answer}${/[.!?]$/.test(answer) ? "" : "."}`
      : null;
    return [answerText, question.rubric].filter((part): part is string => Boolean(part)).join(" ");
  }

  return question.type === "free_text" ? (question.answer ?? question.rubric) : question.rubric;
}

function reviewItemResponse(db: AppDatabase, item: typeof reviewItems.$inferSelect) {
  const sourceQuiz = item.sourceQuizId
    ? db
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.id, item.sourceQuizId), eq(quizzes.topicId, item.topicId)))
        .get()
    : undefined;
  const sourceLesson = sourceQuiz?.sourceLessonId
    ? db
        .select()
        .from(lessonsIndex)
        .where(
          and(
            eq(lessonsIndex.id, sourceQuiz.sourceLessonId),
            eq(lessonsIndex.topicId, item.topicId)
          )
        )
        .get()
    : undefined;
  let question: QuizQuestion | undefined;
  if (sourceQuiz) {
    try {
      const parsed = quizQuestionSchema.array().safeParse(JSON.parse(sourceQuiz.questionsJson));
      question = parsed.success
        ? parsed.data.find((candidate) => candidate.prompt === item.concept)
        : undefined;
    } catch {
      question = undefined;
    }
  }

  return {
    id: item.id,
    topicId: item.topicId,
    concept: item.concept,
    answerGuide: question ? reviewAnswerGuide(question) : null,
    sourceLesson: sourceLesson
      ? {
          id: sourceLesson.id,
          number: sourceLesson.number,
          title: sourceLesson.title
        }
      : null,
    ease: item.ease,
    intervalDays: item.intervalDays,
    dueAt: item.dueAt
  };
}

function cleanNotFound(message: string) {
  return {
    ok: false,
    error: "not_found",
    message
  };
}

function invalidBody(error: string, issues: Array<{ path: string; message: string }>) {
  return {
    ok: false,
    error,
    issues
  };
}

function zodIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}

function lessonGroupsForTopic(db: AppDatabase, topicId: number) {
  return db
    .select()
    .from(lessonGroups)
    .where(eq(lessonGroups.topicId, topicId))
    .all()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(lessonGroupSummary);
}

function topicGroupsForWorkspace(db: AppDatabase) {
  return db
    .select()
    .from(topicGroups)
    .all()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(topicGroupSummary);
}

function lessonsForTopic(db: AppDatabase, topicId: number) {
  return db
    .select()
    .from(lessonsIndex)
    .where(eq(lessonsIndex.topicId, topicId))
    .all()
    .sort((a, b) => a.number - b.number)
    .map(lessonSummary);
}

function getLessonByNumber(db: AppDatabase, topicId: number, lessonNumber: number) {
  return (
    db
      .select()
      .from(lessonsIndex)
      .where(and(eq(lessonsIndex.topicId, topicId), eq(lessonsIndex.number, lessonNumber)))
      .get() ?? null
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function retitleLessonHtml(html: string, title: string) {
  const escapedTitle = escapeHtml(title);
  const withTitle = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/(<title\b[^>]*>)[\s\S]*?(<\/title>)/i, `$1${escapedTitle}$2`)
    : html.replace(/(<head\b[^>]*>)/i, `$1\n    <title>${escapedTitle}</title>`);

  return /<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(withTitle)
    ? withTitle.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i, `$1${escapedTitle}$2`)
    : withTitle;
}

function createGenerationProvider(dependencies: TopicsRouteDependencies) {
  if (dependencies.chatProvider) {
    return dependencies.chatProvider;
  }

  return createConfiguredChatProvider({
    config: dependencies.config,
    db: dependencies.db
  });
}

function encodeSse(event: ChatStreamEvent) {
  const parsed = chatStreamEventSchema.parse(event);
  return `event: ${parsed.type}\ndata: ${JSON.stringify(parsed)}\n\n`;
}

function usageFromEvent(
  usage: ChatUsage,
  event: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
) {
  return {
    ...usage,
    inputTokens: event.inputTokens ?? usage.inputTokens,
    outputTokens: event.outputTokens ?? usage.outputTokens,
    totalTokens: event.totalTokens ?? usage.totalTokens
  };
}

function topicInterviewSystem() {
  return [
    "You are the L2Anything mission interviewer for a new /teach workspace.",
    "Your job is to gather enough context to create a compact MISSION.md that can steer future lessons.",
    "Use the /teach philosophy: concrete real-world mission, success criteria, constraints, current level, zone of proximal development, and a useful first win.",
    "Ask one focused question at a time. Keep replies short and conversational.",
    "Do not generate a lesson yet. Do not claim the workspace exists yet.",
    "When the mission has enough shape, ask for any final constraint or out-of-scope area they want captured.",
    "After the learner confirms the mission is ready, choose a clean topic title that reads like a useful course header, not a transcript dump.",
    'Keep the title under 7 words when possible, preserve important goals, and drop constraints such as time available, level, uncertainty, or scheduling unless they are central. For example: "Learning to read manga in Japanese".',
    "After the learner confirms the mission is ready, give a concise final summary and end your response with exactly <TOPIC_TITLE>Clean topic title</TOPIC_TITLE><READY_TO_CREATE_TOPIC/>.",
    "Do not include <TOPIC_TITLE> or <READY_TO_CREATE_TOPIC/> before the learner has confirmed the final mission shape."
  ].join("\n");
}

function toAgentMessages(messages: TopicInterviewMessage[]): AgentMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

function streamTopicInterview(
  dependencies: TopicsRouteDependencies,
  messages: TopicInterviewMessage[]
) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };

      let usage: ChatUsage = {};
      let stopReason: string | undefined;
      let failed = false;

      try {
        const provider = createGenerationProvider(dependencies);

        for await (const event of provider.streamChat({
          system: topicInterviewSystem(),
          messages: toAgentMessages(messages),
          tools: [],
          maxTokens: 900
        })) {
          if (event.type === "text_delta") {
            emit({
              type: "text_delta",
              text: event.text
            });
            continue;
          }

          if (event.type === "usage") {
            usage = usageFromEvent(usage, event);
            continue;
          }

          if (event.type === "done") {
            stopReason = event.stopReason;
            continue;
          }

          if (event.type === "error") {
            failed = true;
            emit({
              type: "error",
              code: event.code,
              message: event.message,
              recoverable: event.recoverable,
              reason: event.reason
            });
            break;
          }
        }

        if (!failed) {
          emit({
            type: "done",
            stopReason,
            usage: Object.keys(usage).length ? usage : undefined
          });
        }
      } catch (error) {
        emit({
          type: "error",
          code: "provider_error",
          message: error instanceof Error ? error.message : "Mission interview failed.",
          recoverable: true
        });
      } finally {
        controller.close();
      }
    }
  });
}

function clipText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function interviewUserText(messages: TopicInterviewMessage[]) {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");
}

function missionFromInterview(title: string, messages: TopicInterviewMessage[] | undefined) {
  if (!messages?.length) {
    return undefined;
  }

  const userText = interviewUserText(messages);
  const why = userText
    ? `The learner described this mission during the new-topic interview: ${clipText(userText, 900)}`
    : "The learner started this topic through the mission interview.";

  return `# Mission: ${title}

## Why
${why}

## Success looks like
- Produce a first practical win that is directly useful for the learner's stated goal.
- Build enough durable recall to use the topic without depending on rereading.
- Keep each lesson tied to the real context captured in the mission interview.

## Constraints
- Lessons should stay short, concrete, and grounded in trusted resources.
- The tutor should refine this section when the learner names time, budget, level, or format constraints.

## Out of scope
- Adjacent topics that were not named in the mission interview unless the learner asks to expand the mission.
`;
}

function notesFromInterview(messages: TopicInterviewMessage[] | undefined) {
  if (!messages?.length) {
    return undefined;
  }

  const transcript = messages
    .map((message) => {
      const speaker = message.role === "assistant" ? "Tutor" : "Learner";
      return `### ${speaker}\n\n${message.content.trim()}`;
    })
    .join("\n\n");

  return `# Notes

Tutor scratchpad for learning preferences and working notes.

## Mission interview transcript

${transcript}
`;
}

function streamLessonGeneration(
  dependencies: TopicsRouteDependencies,
  topic: typeof topics.$inferSelect
) {
  const encoder = new TextEncoder();
  const lessonGenerationIterationLimit = 24;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };

      let usage: ChatUsage = {};
      let stopReason: string | undefined;
      let failed = false;
      let lessonCreated = false;
      let waitingForLessonArtifact = false;

      try {
        const unfinishedLesson = dependencies.db
          .select()
          .from(lessonsIndex)
          .where(eq(lessonsIndex.topicId, topic.id))
          .all()
          .sort((a, b) => a.number - b.number)
          .find((lesson) => lesson.status !== "completed");

        if (unfinishedLesson) {
          emit({
            type: "error",
            code: "provider_error",
            message: `Finish lesson ${String(unfinishedLesson.number).padStart(4, "0")} before generating the next lesson.`,
            recoverable: true
          });
          return;
        }

        const provider = createGenerationProvider(dependencies);
        const context = buildTutorContext({
          db: dependencies.db,
          topic
        });
        const tools = createTutorToolRegistry({
          config: dependencies.config,
          db: dependencies.db,
          topic
        });

        for await (const event of runTutorAgent({
          provider,
          system: context.system,
          messages: [
            {
              role: "user",
              content: buildLessonGenerationRequest(topic)
            }
          ],
          tools,
          maxIterations: lessonGenerationIterationLimit,
          maxTokens: 12000
        })) {
          if (event.type === "text_delta") {
            emit(event);
            continue;
          }

          if (event.type === "tool_error") {
            failed = true;
            waitingForLessonArtifact = false;
            emit({
              type: "error",
              code: "provider_error",
              message: `${event.label} failed: ${event.message}`,
              recoverable: true
            });
            break;
          }

          if (
            waitingForLessonArtifact &&
            !(event.type === "artifact_created" && event.kind === "lesson")
          ) {
            failed = true;
            emit({
              type: "error",
              code: "provider_error",
              message:
                "The tutor called write_lesson, but no lesson file was created. Try again; if it repeats, check the generated lesson payload.",
              recoverable: true
            });
            break;
          }

          if (event.type === "tool_started" || event.type === "tool_finished") {
            emit({
              type: event.type,
              name: event.name,
              label: event.label
            });

            if (event.type === "tool_finished" && event.name === "write_lesson") {
              waitingForLessonArtifact = true;
            }

            continue;
          }

          if (event.type === "artifact_created") {
            if (event.kind === "lesson") {
              lessonCreated = true;
              waitingForLessonArtifact = false;
              stopReason = "lesson_written";
              emit(event);
              break;
            }

            emit(event);
            continue;
          }

          if (event.type === "usage") {
            usage = usageFromEvent(usage, event);
            continue;
          }

          if (event.type === "done") {
            stopReason = event.stopReason;
            continue;
          }

          if (event.type === "error") {
            if (
              lessonCreated &&
              event.code === "provider_error" &&
              event.message.toLowerCase().includes("tool iteration limit")
            ) {
              stopReason = "lesson_written_after_iteration_limit";
              console.warn(
                `Lesson generation reached the tool iteration limit after writing a lesson for topic ${topic.id}.`
              );
              break;
            }

            failed = true;
            console.error(`Lesson generation error (${event.code}): ${event.message}`);
            emit({
              type: "error",
              code: event.code,
              message: event.message,
              recoverable: event.recoverable,
              reason: event.reason
            });
            break;
          }
        }

        if (waitingForLessonArtifact && !lessonCreated) {
          failed = true;
          emit({
            type: "error",
            code: "provider_error",
            message:
              "The tutor called write_lesson, but no lesson file was created. Try again; if it repeats, check the generated lesson payload.",
            recoverable: true
          });
        }

        if (!failed) {
          emit({
            type: "done",
            stopReason,
            usage: Object.keys(usage).length ? usage : undefined
          });
        }
      } catch (error) {
        emit({
          type: "error",
          code: "provider_error",
          message: error instanceof Error ? error.message : "Lesson generation failed.",
          recoverable: false
        });
      } finally {
        controller.close();
      }
    }
  });
}

export function listTopics({ config, db }: TopicsRouteDependencies) {
  if (!config.LEARNING_HUB_DIR) {
    return topicsResponseSchema.parse({
      ok: true,
      workspaceConfigured: false,
      workspaceDir: null,
      groups: [],
      topics: []
    });
  }

  const indexed = indexWorkspace(db, config.LEARNING_HUB_DIR);
  const topicSummaries: TopicSummary[] = indexed.map((topic) => ({
    id: topic.id,
    slug: topic.slug,
    title: topic.title,
    groupId: topic.groupId,
    lessonCount: topic.lessons.length,
    completedLessonCount: completedLessonCount(db, topic.id),
    dueLessonCount: lessonDueCount(db, topic.id),
    recordCount: topic.records.length,
    resourceCount: markdownResourceCount(
      textContent(readTopicFile(topic.dirPath, "resources")?.content ?? null)
    ),
    referenceCount: listReferenceDocs(topic.dirPath).length,
    ...reviewCounts(db, topic.id)
  }));

  return topicsResponseSchema.parse({
    ok: true,
    workspaceConfigured: true,
    workspaceDir: config.LEARNING_HUB_DIR,
    groups: topicGroupsForWorkspace(db),
    topics: topicSummaries
  });
}

export function createTopicsRoutes(dependencies: TopicsRouteDependencies) {
  const routes = new Hono();

  routes.get("/", (context) => context.json(listTopics(dependencies)));
  routes.post("/interview", async (context) => {
    const parsed = topicInterviewRequestSchema.safeParse(
      await context.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return context.json(invalidBody("invalid_topic_interview", zodIssues(parsed.error)), 400);
    }

    return new Response(streamTopicInterview(dependencies, parsed.data.messages), {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no"
      }
    });
  });
  routes.route("/:id/chat", createTopicChatRoutes(dependencies));

  routes.post("/", async (context) => {
    if (!dependencies.config.LEARNING_HUB_DIR) {
      return context.json(
        {
          ok: false,
          error: "workspace_not_configured"
        },
        400
      );
    }

    const parsed = topicCreateRequestSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(invalidBody("invalid_topic", zodIssues(parsed.error)), 400);
    }

    const body = parsed.data;

    await scaffoldTopic(dependencies.config.LEARNING_HUB_DIR, {
      missionContent: missionFromInterview(body.title, body.interviewMessages),
      notesContent: notesFromInterview(body.interviewMessages),
      slug: body.slug,
      title: body.title
    });

    return context.json(listTopics(dependencies), 201);
  });

  routes.post("/groups", async (context) => {
    const parsed = topicGroupCreateSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(invalidBody("invalid_topic_group", zodIssues(parsed.error)), 400);
    }

    const name = parsed.data.name;
    const existing = dependencies.db
      .select()
      .from(topicGroups)
      .where(eq(topicGroups.name, name))
      .get();
    const group =
      existing ??
      dependencies.db
        .insert(topicGroups)
        .values({
          name
        })
        .returning()
        .get();

    return context.json(
      topicGroupResponseSchema.parse({
        ok: true,
        group: topicGroupSummary(group)
      }),
      existing ? 200 : 201
    );
  });

  routes.put("/groups/:groupId", async (context) => {
    const groupId = parsePositiveId(context.req.param("groupId"));
    if (!groupId) {
      return context.json(cleanNotFound("Topic group id is invalid."), 404);
    }

    const group = dependencies.db
      .select()
      .from(topicGroups)
      .where(eq(topicGroups.id, groupId))
      .get();
    if (!group) {
      return context.json(cleanNotFound("Topic group is not indexed."), 404);
    }

    const parsed = topicGroupUpdateSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(invalidBody("invalid_topic_group", zodIssues(parsed.error)), 400);
    }

    if (parsed.data.name) {
      const duplicate = dependencies.db
        .select()
        .from(topicGroups)
        .where(eq(topicGroups.name, parsed.data.name))
        .get();

      if (duplicate && duplicate.id !== group.id) {
        return context.json(
          {
            ok: false,
            error: "topic_group_exists",
            message: "A topic group with that name already exists."
          },
          409
        );
      }
    }

    dependencies.db
      .update(topicGroups)
      .set({
        name: parsed.data.name ?? group.name,
        collapsed: parsed.data.collapsed ?? group.collapsed
      })
      .where(eq(topicGroups.id, group.id))
      .run();

    const updated = dependencies.db
      .select()
      .from(topicGroups)
      .where(eq(topicGroups.id, group.id))
      .get();

    return context.json(
      topicGroupResponseSchema.parse({
        ok: true,
        group: topicGroupSummary(updated ?? group)
      })
    );
  });

  routes.delete("/groups/:groupId", (context) => {
    const groupId = parsePositiveId(context.req.param("groupId"));
    if (!groupId) {
      return context.json(cleanNotFound("Topic group id is invalid."), 404);
    }

    const group = dependencies.db
      .select()
      .from(topicGroups)
      .where(eq(topicGroups.id, groupId))
      .get();
    if (!group) {
      return context.json(cleanNotFound("Topic group is not indexed."), 404);
    }

    dependencies.db.update(topics).set({ groupId: null }).where(eq(topics.groupId, groupId)).run();
    dependencies.db.delete(topicGroups).where(eq(topicGroups.id, groupId)).run();

    return context.json(
      topicGroupDeleteResponseSchema.parse({
        ok: true,
        groupId
      })
    );
  });

  routes.put("/:id/title", async (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const parsed = topicTitleUpdateSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(invalidBody("invalid_topic_title", zodIssues(parsed.error)), 400);
    }

    dependencies.db
      .update(topics)
      .set({ displayTitle: parsed.data.title })
      .where(eq(topics.id, topic.id))
      .run();

    const updated = getTopic(dependencies, topic.id) ?? topic;

    return context.json(
      topicStatusResponseSchema.parse({
        ok: true,
        topic: topicSummary(dependencies.db, updated)
      })
    );
  });

  routes.put("/:id/group", async (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const parsed = topicGroupAssignSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(invalidBody("invalid_topic_group", zodIssues(parsed.error)), 400);
    }

    if (parsed.data.groupId !== null) {
      const group = dependencies.db
        .select()
        .from(topicGroups)
        .where(eq(topicGroups.id, parsed.data.groupId))
        .get();

      if (!group) {
        return context.json(cleanNotFound("Topic group is not indexed."), 404);
      }
    }

    dependencies.db
      .update(topics)
      .set({ groupId: parsed.data.groupId })
      .where(eq(topics.id, topic.id))
      .run();

    const updated = getTopic(dependencies, topic.id) ?? topic;

    return context.json(
      topicStatusResponseSchema.parse({
        ok: true,
        topic: topicSummary(dependencies.db, updated)
      })
    );
  });

  routes.delete("/:id", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    if (!dependencies.config.LEARNING_HUB_DIR) {
      return context.json(
        {
          ok: false,
          error: "workspace_not_configured"
        },
        400
      );
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    let topicDir: string;
    try {
      const workspaceRoot = assertInsideRoot(dependencies.config.LEARNING_HUB_DIR);
      topicDir = assertInsideRoot(dependencies.config.LEARNING_HUB_DIR, topic.dirPath);

      if (relative(workspaceRoot, topicDir) === "") {
        return context.json(
          {
            ok: false,
            error: "invalid_topic_path",
            message: "Topic directory cannot be the workspace root."
          },
          400
        );
      }
    } catch (error) {
      if (error instanceof WorkspacePathError) {
        return context.json(
          {
            ok: false,
            error: "invalid_topic_path",
            message: "Topic directory is outside the configured workspace."
          },
          400
        );
      }

      throw error;
    }

    if (!existsSync(topicDir) || !statSync(topicDir).isDirectory()) {
      return context.json(cleanNotFound("Topic directory does not exist."), 404);
    }

    try {
      rmSync(topicDir, { recursive: true, force: false });
    } catch (error) {
      return context.json(
        {
          ok: false,
          error: "topic_delete_failed",
          message: error instanceof Error ? error.message : "Topic directory could not be deleted."
        },
        500
      );
    }

    dependencies.db.delete(topics).where(eq(topics.id, topic.id)).run();

    return context.json(
      topicDeleteResponseSchema.parse({
        ok: true,
        topicId: topic.id,
        slug: topic.slug
      })
    );
  });

  routes.get("/:id", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const lessons = dependencies.db
      .select()
      .from(lessonsIndex)
      .where(eq(lessonsIndex.topicId, topic.id))
      .all();
    const records = dependencies.db
      .select()
      .from(recordsIndex)
      .where(eq(recordsIndex.topicId, topic.id))
      .all()
      .sort((a, b) => b.number - a.number);
    const mission = textContent(readTopicFile(topic.dirPath, "mission")?.content ?? null);
    const resources = textContent(readTopicFile(topic.dirPath, "resources")?.content ?? null);
    const references = listReferenceDocs(topic.dirPath);
    const orderedLessons = [...lessons].sort((a, b) => a.number - b.number);
    const dueLesson = orderedLessons.find(
      (lesson) => lesson.status !== "completed" && lesson.dueAt && lesson.dueAt <= todayDateKey()
    );
    const firstUnreadLesson = orderedLessons.find((lesson) => lesson.status !== "completed");

    return context.json(
      topicDetailResponseSchema.parse({
        ok: true,
        topic: topicSummary(dependencies.db, topic),
        mission,
        counts: {
          lessons: lessons.length,
          completedLessons: lessons.filter((lesson) => lesson.status === "completed").length,
          records: records.length,
          resources: markdownResourceCount(resources),
          references: references.length
        },
        recentRecords: records.slice(0, 3).map(recordSummary),
        nextAction: dueLesson
          ? {
              label: `Finish lesson ${String(dueLesson.number).padStart(4, "0")}`,
              description: `${dueLesson.title} is due.`,
              href: `/t/${encodeURIComponent(topic.slug)}/lessons/${dueLesson.number}`
            }
          : firstUnreadLesson
            ? {
                label: `Open lesson ${String(firstUnreadLesson.number).padStart(4, "0")}`,
                description: firstUnreadLesson.title,
                href: `/t/${encodeURIComponent(topic.slug)}/lessons/${firstUnreadLesson.number}`
              }
            : !mission?.trim()
              ? {
                  label: "Open topic overview",
                  description: "This topic needs a mission before lessons can stay grounded.",
                  href: `/t/${encodeURIComponent(topic.slug)}`
                }
              : {
                  label: lessons.length ? "All lessons complete" : "Generate the first lesson",
                  description: lessons.length
                    ? "Review records or generate the next lesson when AWS is connected."
                    : "No lesson files are indexed for this topic yet.",
                  href: lessons.length ? `/t/${encodeURIComponent(topic.slug)}/records` : null
                }
      })
    );
  });

  routes.get("/:id/files/:kind", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    const kind = context.req.param("kind") as FileKind;
    if (!id || !(kind in fileNamesByKind)) {
      return context.json(cleanNotFound("Workspace file is not available."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const file = readTopicFile(topic.dirPath, kind);
    if (!file) {
      return context.json(cleanNotFound(`${fileNamesByKind[kind]} does not exist.`), 404);
    }

    return context.json(
      topicFileResponseSchema.parse({
        ok: true,
        kind,
        fileName: file.fileName,
        content: file.content.toString("utf8")
      })
    );
  });

  routes.get("/:id/lessons", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    return context.json(
      topicLessonsResponseSchema.parse({
        ok: true,
        topicId: topic.id,
        groups: lessonGroupsForTopic(dependencies.db, topic.id),
        lessons: lessonsForTopic(dependencies.db, topic.id)
      })
    );
  });

  routes.post("/:id/lesson-groups", async (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const parsed = lessonGroupCreateSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(invalidBody("invalid_lesson_group", zodIssues(parsed.error)), 400);
    }

    const name = parsed.data.name;
    const existing = dependencies.db
      .select()
      .from(lessonGroups)
      .where(and(eq(lessonGroups.topicId, topic.id), eq(lessonGroups.name, name)))
      .get();
    const group =
      existing ??
      dependencies.db
        .insert(lessonGroups)
        .values({
          topicId: topic.id,
          name
        })
        .returning()
        .get();

    return context.json(
      lessonGroupResponseSchema.parse({
        ok: true,
        group: lessonGroupSummary(group)
      }),
      existing ? 200 : 201
    );
  });

  routes.post("/:id/lessons/generate", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    return new Response(streamLessonGeneration(dependencies, topic), {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no"
      }
    });
  });

  routes.put("/:id/lessons/:num/title", async (context) => {
    const id = parsePositiveId(context.req.param("id"));
    const lessonNumber = parsePositiveId(context.req.param("num"));
    if (!id || !lessonNumber) {
      return context.json(cleanNotFound("Lesson is not indexed."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const parsed = lessonTitleUpdateSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(invalidBody("invalid_lesson_title", zodIssues(parsed.error)), 400);
    }

    const existing = getLessonByNumber(dependencies.db, topic.id, lessonNumber);
    if (!existing) {
      return context.json(cleanNotFound("Lesson is not indexed."), 404);
    }

    const path = join(topic.dirPath, "lessons", existing.fileName);
    if (!existsSync(path) || !statSync(path).isFile()) {
      return context.json(cleanNotFound("Lesson file does not exist."), 404);
    }

    const nextHtml = retitleLessonHtml(readFileSync(path, "utf8"), parsed.data.title);
    writeFileSync(path, nextHtml, "utf8");
    dependencies.db
      .update(lessonsIndex)
      .set({ title: parsed.data.title })
      .where(and(eq(lessonsIndex.topicId, topic.id), eq(lessonsIndex.number, lessonNumber)))
      .run();

    const lesson = getLessonByNumber(dependencies.db, topic.id, lessonNumber) ?? existing;

    return context.json(
      lessonStatusResponseSchema.parse({
        ok: true,
        lesson: lessonSummary(lesson)
      })
    );
  });

  routes.put("/:id/lessons/:num/due-date", async (context) => {
    const id = parsePositiveId(context.req.param("id"));
    const lessonNumber = parsePositiveId(context.req.param("num"));
    if (!id || !lessonNumber) {
      return context.json(cleanNotFound("Lesson is not indexed."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const parsed = lessonDueDateUpdateSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(invalidBody("invalid_lesson_due_date", zodIssues(parsed.error)), 400);
    }

    const existing = getLessonByNumber(dependencies.db, topic.id, lessonNumber);
    if (!existing) {
      return context.json(cleanNotFound("Lesson is not indexed."), 404);
    }

    dependencies.db
      .update(lessonsIndex)
      .set({ dueAt: parsed.data.dueAt })
      .where(and(eq(lessonsIndex.topicId, topic.id), eq(lessonsIndex.number, lessonNumber)))
      .run();

    const lesson = getLessonByNumber(dependencies.db, topic.id, lessonNumber) ?? existing;

    return context.json(
      lessonStatusResponseSchema.parse({
        ok: true,
        lesson: lessonSummary(lesson)
      })
    );
  });

  routes.put("/:id/lessons/:num/group", async (context) => {
    const id = parsePositiveId(context.req.param("id"));
    const lessonNumber = parsePositiveId(context.req.param("num"));
    if (!id || !lessonNumber) {
      return context.json(cleanNotFound("Lesson is not indexed."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const parsed = lessonGroupAssignSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(invalidBody("invalid_lesson_group", zodIssues(parsed.error)), 400);
    }

    const existing = getLessonByNumber(dependencies.db, topic.id, lessonNumber);
    if (!existing) {
      return context.json(cleanNotFound("Lesson is not indexed."), 404);
    }

    if (parsed.data.groupId !== null) {
      const group = dependencies.db
        .select()
        .from(lessonGroups)
        .where(and(eq(lessonGroups.topicId, topic.id), eq(lessonGroups.id, parsed.data.groupId)))
        .get();

      if (!group) {
        return context.json(cleanNotFound("Lesson group is not indexed for this topic."), 404);
      }
    }

    dependencies.db
      .update(lessonsIndex)
      .set({ groupId: parsed.data.groupId })
      .where(and(eq(lessonsIndex.topicId, topic.id), eq(lessonsIndex.number, lessonNumber)))
      .run();

    const lesson = getLessonByNumber(dependencies.db, topic.id, lessonNumber) ?? existing;

    return context.json(
      lessonStatusResponseSchema.parse({
        ok: true,
        lesson: lessonSummary(lesson)
      })
    );
  });

  routes.delete("/:id/lessons/:num", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    const lessonNumber = parsePositiveId(context.req.param("num"));
    if (!id || !lessonNumber) {
      return context.json(cleanNotFound("Lesson is not indexed."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const existing = getLessonByNumber(dependencies.db, topic.id, lessonNumber);
    if (!existing) {
      return context.json(cleanNotFound("Lesson is not indexed."), 404);
    }

    const path = join(topic.dirPath, "lessons", existing.fileName);
    if (existsSync(path) && statSync(path).isFile()) {
      unlinkSync(path);
    }

    dependencies.db
      .delete(lessonsIndex)
      .where(and(eq(lessonsIndex.topicId, topic.id), eq(lessonsIndex.number, lessonNumber)))
      .run();

    return context.json(
      lessonDeleteResponseSchema.parse({
        ok: true,
        topicId: topic.id,
        lessonNumber
      })
    );
  });

  routes.get("/:id/lessons/:file", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    const fileName = context.req.param("file");
    if (!id || !safeFileName(fileName)) {
      return context.json(cleanNotFound("Lesson file is not available."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const lesson = dependencies.db
      .select()
      .from(lessonsIndex)
      .where(and(eq(lessonsIndex.topicId, topic.id), eq(lessonsIndex.fileName, fileName)))
      .get();
    if (!lesson) {
      return context.json(cleanNotFound("Lesson file is not indexed."), 404);
    }

    const path = join(topic.dirPath, "lessons", lesson.fileName);
    if (!existsSync(path) || !statSync(path).isFile()) {
      return context.json(cleanNotFound("Lesson file does not exist."), 404);
    }

    return rawHtmlResponse(readFileSync(path), { normalizeLesson: true });
  });

  routes.put("/:id/lessons/:num/status", async (context) => {
    const id = parsePositiveId(context.req.param("id"));
    const lessonNumber = parsePositiveId(context.req.param("num"));
    if (!id || !lessonNumber) {
      return context.json(cleanNotFound("Lesson is not indexed."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const parsed = lessonStatusUpdateSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(
        {
          ok: false,
          error: "invalid_lesson_status",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        400
      );
    }

    const existing = dependencies.db
      .select()
      .from(lessonsIndex)
      .where(and(eq(lessonsIndex.topicId, topic.id), eq(lessonsIndex.number, lessonNumber)))
      .get();
    if (!existing) {
      return context.json(cleanNotFound("Lesson is not indexed."), 404);
    }

    dependencies.db
      .update(lessonsIndex)
      .set({ status: parsed.data.status })
      .where(and(eq(lessonsIndex.topicId, topic.id), eq(lessonsIndex.number, lessonNumber)))
      .run();

    const lesson = dependencies.db
      .select()
      .from(lessonsIndex)
      .where(and(eq(lessonsIndex.topicId, topic.id), eq(lessonsIndex.number, lessonNumber)))
      .get();

    return context.json(
      lessonStatusResponseSchema.parse({
        ok: true,
        lesson: lessonSummary(lesson ?? existing)
      })
    );
  });

  routes.post("/:id/quizzes/generate", async (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const parsed = quizGenerateRequestSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(
        {
          ok: false,
          error: "invalid_quiz_generation",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        400
      );
    }

    const sourceLessonId = parsed.data.lessonId;
    const questions = [
      {
        id: "mcq-core",
        type: "mcq" as const,
        prompt: `What is the fastest way to check understanding in ${topic.title}?`,
        options: [
          { id: "reread", label: "Reread the lesson." },
          { id: "explain", label: "Explain the idea back in your own words." }
        ],
        answer: "explain",
        rubric: "The learner should choose active recall over passive rereading."
      },
      {
        id: "explain-back",
        type: "explain_back" as const,
        prompt: `Explain the most recent ${topic.title} idea in plain language.`,
        rubric:
          "Score high when the explanation is concrete, accurate, and connected to the learner mission."
      }
    ];
    const quiz = dependencies.db
      .insert(quizzes)
      .values({
        topicId: topic.id,
        sourceLessonId: sourceLessonId ?? null,
        questionsJson: JSON.stringify(questions)
      })
      .returning()
      .get();

    return context.json(
      quizGenerateResponseSchema.parse({
        ok: true,
        quiz: {
          id: quiz.id,
          topicId: quiz.topicId,
          sourceLessonId: quiz.sourceLessonId,
          questions: parseQuestionsJson(quiz.questionsJson),
          createdAt: quiz.createdAt
        }
      }),
      201
    );
  });

  routes.get("/:id/review", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const dueItems = dependencies.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.topicId, topic.id))
      .all()
      .filter((item) => Date.parse(item.dueAt) <= Date.now())
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
      .map((item) => reviewItemResponse(dependencies.db, item));

    return context.json(
      topicReviewResponseSchema.parse({
        ok: true,
        topicId: topic.id,
        items: dueItems
      })
    );
  });

  routes.put("/:id/review/:reviewItemId", async (context) => {
    const id = parsePositiveId(context.req.param("id"));
    const reviewItemId = parsePositiveId(context.req.param("reviewItemId"));
    if (!id || !reviewItemId) {
      return context.json(cleanNotFound("Review item is not indexed."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const parsed = reviewRatingRequestSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(invalidBody("invalid_review_rating", zodIssues(parsed.error)), 400);
    }

    const existing = dependencies.db
      .select()
      .from(reviewItems)
      .where(and(eq(reviewItems.id, reviewItemId), eq(reviewItems.topicId, topic.id)))
      .get();
    if (!existing) {
      return context.json(cleanNotFound("Review item is not indexed for this topic."), 404);
    }

    const schedule = nextReviewSchedule({
      correct: parsed.data.rating === "remembered",
      ease: existing.ease,
      intervalDays: existing.intervalDays
    });
    const item = dependencies.db
      .update(reviewItems)
      .set(schedule)
      .where(eq(reviewItems.id, existing.id))
      .returning()
      .get();

    return context.json(
      reviewRatingResponseSchema.parse({
        ok: true,
        item: reviewItemResponse(dependencies.db, item)
      })
    );
  });

  routes.get("/:id/records", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const records = dependencies.db
      .select()
      .from(recordsIndex)
      .where(eq(recordsIndex.topicId, topic.id))
      .all()
      .sort((a, b) => a.number - b.number)
      .map((record) => {
        const path = join(topic.dirPath, "learning-records", record.fileName);
        return {
          ...recordSummary(record),
          content: existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : ""
        };
      });

    return context.json(
      topicRecordsResponseSchema.parse({
        ok: true,
        topicId: topic.id,
        records
      })
    );
  });

  routes.get("/:id/reference", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    if (!id) {
      return context.json(cleanNotFound("Topic id is invalid."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    return context.json(
      topicReferenceResponseSchema.parse({
        ok: true,
        topicId: topic.id,
        resources: textContent(readTopicFile(topic.dirPath, "resources")?.content ?? null),
        references: listReferenceDocs(topic.dirPath)
      })
    );
  });

  routes.get("/:id/reference/:file", (context) => {
    const id = parsePositiveId(context.req.param("id"));
    const fileName = context.req.param("file");
    if (!id || !safeFileName(fileName) || !fileName.toLowerCase().endsWith(".html")) {
      return context.json(cleanNotFound("Reference file is not available."), 404);
    }

    const topic = getTopic(dependencies, id);
    if (!topic) {
      return context.json(cleanNotFound("Topic is not indexed."), 404);
    }

    const references = listReferenceDocs(topic.dirPath);
    if (!references.some((reference) => reference.fileName === fileName)) {
      return context.json(cleanNotFound("Reference file is not indexed."), 404);
    }

    const path = join(topic.dirPath, "reference", fileName);
    if (!existsSync(path) || !statSync(path).isFile()) {
      return context.json(cleanNotFound("Reference file does not exist."), 404);
    }

    return rawHtmlResponse(readFileSync(path), { normalizeLesson: true });
  });

  return routes;
}
