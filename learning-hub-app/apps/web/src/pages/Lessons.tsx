import type {
  LessonStatus,
  LessonSummary,
  TopicLessonsResponse,
  TopicSummary
} from "@learning-hub/shared";
import { BookOpen, Pencil, Play, Save, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { LessonCompletionControl } from "../components/LessonCompletionControl.js";
import { LessonDueDateControl } from "../components/LessonDueDateControl.js";
import { TopicHeader } from "../components/TopicHeader.js";
import {
  button,
  card,
  field,
  InlineNotice,
  Input,
  LessonStepper,
  LessonStatusPill,
  PageSkeleton,
  SectionHeader,
  StatusCard,
  type StatusTone
} from "../components/ui.js";
import { lessonDueText, lessonRoute, topicPath, type Route } from "../lib.js";

function orderedLessonList(lessons: LessonSummary[]) {
  return [...lessons].sort((left, right) => left.number - right.number);
}

function currentLessonFrom(lessons: LessonSummary[]) {
  const orderedLessons = orderedLessonList(lessons);
  return (
    orderedLessons.find((lesson) => lesson.status !== "completed") ??
    orderedLessons[orderedLessons.length - 1]
  );
}

function lessonStepFor(lesson: LessonSummary): "read" | "exercise" | "quiz" {
  if (lesson.status === "completed") {
    return "quiz";
  }

  if (lesson.status === "in_progress") {
    return "exercise";
  }

  return "read";
}

function lessonTone(lesson: LessonSummary): StatusTone {
  if (lesson.status === "completed") {
    return "success";
  }

  if (lesson.status === "in_progress") {
    return "warning";
  }

  return "neutral";
}

function primaryLessonLabel(lesson: LessonSummary) {
  if (lesson.status === "completed") {
    return "Review lesson";
  }

  if (lesson.status === "in_progress") {
    return "Continue lesson";
  }

  return "Start lesson";
}

export function LessonListPage({
  lessons,
  loading,
  onDeleteLesson,
  onLessonDueDateChange,
  onLessonTitleChange,
  onStatusChange,
  onTopicTitleChange,
  route,
  topic
}: {
  lessons?: TopicLessonsResponse;
  loading: boolean;
  onDeleteLesson: (topicId: number, lessonNumber: number) => Promise<void>;
  onLessonDueDateChange: (
    topicId: number,
    lessonNumber: number,
    dueAt: string | null
  ) => Promise<void>;
  onLessonTitleChange: (topicId: number, lessonNumber: number, title: string) => Promise<void>;
  onStatusChange: (topicId: number, lessonNumber: number, status: LessonStatus) => void;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  route: Route;
  topic?: TopicSummary;
}) {
  if (!topic) {
    return (
      <InlineNotice tone="error" title="Topic not found" body="The requested topic is not indexed." />
    );
  }

  const orderedLessons = orderedLessonList(lessons?.lessons ?? []);
  const total = lessons?.lessons.length ?? topic.lessonCount;
  const completed =
    lessons?.lessons.filter((lesson) => lesson.status === "completed").length ??
    topic.completedLessonCount;
  const currentLesson = currentLessonFrom(orderedLessons);

  return (
    <div className="grid w-full min-w-0 max-w-[1400px] gap-6">
      <TopicHeader onTopicTitleChange={onTopicTitleChange} route={route} topic={topic} />
      {loading && !lessons ? (
        <PageSkeleton />
      ) : (
        <>
          {currentLesson ? (
            <CurrentLessonPanel lesson={currentLesson} topic={topic} total={total} />
          ) : null}

          <section className={`${card} p-5`}>
            <SectionHeader
              count={`${completed}/${total}`}
              icon={<BookOpen size={16} />}
              meta="completed"
              title="All lessons"
              tone="neutral"
            />

            <div className="mt-5 grid gap-3">
              {orderedLessons.length ? (
                orderedLessons.map((lesson) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    onDeleteLesson={onDeleteLesson}
                    onLessonDueDateChange={onLessonDueDateChange}
                    onLessonTitleChange={onLessonTitleChange}
                    onStatusChange={onStatusChange}
                    topic={topic}
                  />
                ))
              ) : (
                <div className="grid gap-3">
                  <InlineNotice
                    title="No lessons yet"
                    body="Generate the first lesson from the topic overview, or drop lesson files into the topic folder."
                  />
                  <div>
                    <a className={button.primary} href={topicPath(topic)}>
                      <Play size={14} />
                      Open topic overview
                    </a>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function CurrentLessonPanel({
  lesson,
  topic,
  total
}: {
  lesson: LessonSummary;
  topic: TopicSummary;
  total: number;
}) {
  return (
    <StatusCard className="grid gap-4 p-5" tone={lessonTone(lesson)}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <SectionHeader
            count={`Lesson ${lesson.number} of ${total || lesson.number}`}
            icon={<Play size={16} />}
            title="Current lesson"
            tone={lesson.status === "in_progress" ? "accent" : "neutral"}
          />
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
            <LessonStatusPill status={lesson.status} />
            <span className="tnum rounded-full border border-border bg-secondary/45 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {lessonDueText(lesson)}
            </span>
          </div>
          <h2 className="mt-3 min-w-0 break-words text-lg font-bold leading-tight text-foreground">
            {lesson.title}
          </h2>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {lesson.fileName}
          </p>
        </div>
        <a className={`${button.primary} w-full sm:w-auto`} href={lessonRoute(topic, lesson)}>
          <Play size={14} />
          {primaryLessonLabel(lesson)}
        </a>
      </div>
      <LessonStepper current={lessonStepFor(lesson)} />
    </StatusCard>
  );
}

function LessonRow({
  lesson,
  onDeleteLesson,
  onLessonDueDateChange,
  onLessonTitleChange,
  onStatusChange,
  topic
}: {
  lesson: LessonSummary;
  onDeleteLesson: (topicId: number, lessonNumber: number) => Promise<void>;
  onLessonDueDateChange: (
    topicId: number,
    lessonNumber: number,
    dueAt: string | null
  ) => Promise<void>;
  onLessonTitleChange: (topicId: number, lessonNumber: number, title: string) => Promise<void>;
  onStatusChange: (topicId: number, lessonNumber: number, status: LessonStatus) => void;
  topic: TopicSummary;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(lesson.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSaveTitle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = draftTitle.trim();
    if (!title || saving) {
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      await onLessonTitleChange(topic.id, lesson.number, title);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Lesson title could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(undefined);

    try {
      await onDeleteLesson(topic.id, lesson.number);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Lesson could not be deleted.");
      setSaving(false);
      return;
    }

    setSaving(false);
  };

  return (
    <article className="grid gap-3 rounded-lg border border-border bg-secondary/25 px-4 py-3 transition-colors duration-150 hover:border-primary/35 hover:bg-secondary/55">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        {editing ? (
          <form
            className="flex min-w-0 flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              void handleSaveTitle(event);
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Lesson title</span>
              <Input
                className={field}
                onChange={(event) => setDraftTitle(event.currentTarget.value)}
                value={draftTitle}
              />
            </label>
            <div className="flex gap-2">
              <button
                aria-label="Save lesson title"
                className={`${button.secondary} min-h-10 px-3`}
                disabled={saving || !draftTitle.trim()}
                type="submit"
              >
                <Save size={14} />
              </button>
              <button
                aria-label="Cancel title edit"
                className={`${button.ghost} min-h-10 px-3`}
                disabled={saving}
                onClick={() => {
                  setDraftTitle(lesson.title);
                  setEditing(false);
                }}
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          </form>
        ) : (
          <a
            className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={lessonRoute(topic, lesson)}
          >
            <span
              aria-hidden="true"
              className={`grid size-9 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold ${
                lesson.status === "completed"
                  ? "bg-success-soft text-success"
                  : lesson.status === "in_progress"
                    ? "border border-warning/25 bg-warning-soft/65 text-warning"
                    : "border border-border bg-secondary/60 text-muted-foreground"
              }`}
            >
              {String(lesson.number).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate text-base font-semibold text-foreground">
                  {lesson.title}
                </span>
                <LessonStatusPill status={lesson.status} />
              </span>
              <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                {lesson.fileName}
              </span>
            </span>
          </a>
        )}

        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          {!editing ? (
            <>
              <LessonDueDateControl
                compact
                minimal
                lesson={lesson}
                onLessonDueDateChange={onLessonDueDateChange}
                topicId={topic.id}
              />
              <LessonCompletionControl
                lesson={lesson}
                onStatusChange={onStatusChange}
                topicId={topic.id}
              />
            </>
          ) : null}
          {confirmingDelete ? (
            <>
              <button
                className={`${button.secondary} min-h-9 px-2.5 text-xs`}
                disabled={saving}
                onClick={() => {
                  void handleDelete();
                }}
                type="button"
              >
                Delete
              </button>
              <button
                aria-label="Cancel delete"
                className={`${button.ghost} min-h-9 px-2.5`}
                disabled={saving}
                onClick={() => setConfirmingDelete(false)}
                type="button"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                aria-label={`Edit ${lesson.title}`}
                className={`${button.ghost} min-h-9 px-2.5`}
                disabled={saving}
                onClick={() => setEditing(true)}
                type="button"
              >
                <Pencil size={14} />
              </button>
              <button
                aria-label={`Delete ${lesson.title}`}
                className={`${button.ghost} min-h-9 px-2.5 text-danger hover:text-danger`}
                disabled={saving}
                onClick={() => setConfirmingDelete(true)}
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </article>
  );
}
