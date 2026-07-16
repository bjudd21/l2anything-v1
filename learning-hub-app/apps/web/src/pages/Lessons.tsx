import type { LessonSummary, TopicLessonsResponse, TopicSummary } from "@learning-hub/shared";
import {
  BookOpen,
  CalendarDays,
  MoreHorizontal,
  Pencil,
  Play,
  Save,
  Trash2,
  X
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { LessonDueDateControl } from "../components/LessonDueDateControl.js";
import { TopicHeader } from "../components/TopicHeader.js";
import {
  button,
  Button,
  card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  field,
  InlineNotice,
  Input,
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
    orderedLessons.find((lesson) => lesson.status === "in_progress") ??
    orderedLessons.find((lesson) => lesson.status === "unread")
  );
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
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  route: Route;
  topic?: TopicSummary;
}) {
  if (!topic) {
    return (
      <InlineNotice
        tone="error"
        title="Topic not found"
        body="The requested topic is not indexed."
      />
    );
  }

  const orderedLessons = orderedLessonList(lessons?.lessons ?? []);
  const currentLesson = currentLessonFrom(orderedLessons);
  const showLessonList = orderedLessons.length > 1 || !currentLesson;

  return (
    <div className="grid w-full min-w-0 max-w-[1400px] gap-6">
      <TopicHeader onTopicTitleChange={onTopicTitleChange} route={route} topic={topic} />
      {loading && !lessons ? (
        <PageSkeleton />
      ) : (
        <>
          {currentLesson ? <CurrentLessonPanel lesson={currentLesson} topic={topic} /> : null}

          {showLessonList ? (
            <section className={`${card} p-5`}>
              <SectionHeader
                icon={<BookOpen size={16} />}
                title={currentLesson ? "All lessons" : "Lesson history"}
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
          ) : null}
        </>
      )}
    </div>
  );
}

function CurrentLessonPanel({ lesson, topic }: { lesson: LessonSummary; topic: TopicSummary }) {
  return (
    <StatusCard className="grid gap-4 p-5" tone={lessonTone(lesson)}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <SectionHeader
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
        </div>
        <Button asChild className="w-full sm:w-auto">
          <a href={lessonRoute(topic, lesson)}>
            <Play size={14} />
            {primaryLessonLabel(lesson)}
          </a>
        </Button>
      </div>
    </StatusCard>
  );
}

function LessonRow({
  lesson,
  onDeleteLesson,
  onLessonDueDateChange,
  onLessonTitleChange,
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
  topic: TopicSummary;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(lesson.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [scheduling, setScheduling] = useState(false);
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
              {lesson.dueAt ? (
                <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                  {lessonDueText(lesson)}
                </span>
              ) : null}
            </span>
          </a>
        )}

        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          {!editing ? (
            <>
              <Button asChild size="sm" variant="secondary">
                <a href={lessonRoute(topic, lesson)}>
                  {lesson.status === "completed" ? <BookOpen size={14} /> : <Play size={14} />}
                  {primaryLessonLabel(lesson)}
                </a>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={`Lesson actions for ${lesson.title}`}
                    disabled={saving}
                    size="icon-sm"
                    title="Lesson actions"
                    type="button"
                    variant="ghost"
                  >
                    <MoreHorizontal size={15} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setConfirmingDelete(false);
                      setScheduling(false);
                      setEditing(true);
                    }}
                  >
                    <Pencil size={14} />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setConfirmingDelete(false);
                      setEditing(false);
                      setScheduling(true);
                    }}
                  >
                    <CalendarDays size={14} />
                    {lesson.dueAt ? "Change finish date" : "Set finish date"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={saving}
                    onSelect={() => {
                      setScheduling(false);
                      setConfirmingDelete(true);
                    }}
                    variant="destructive"
                  >
                    <Trash2 size={14} />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </div>
      </div>

      {scheduling ? (
        <section className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <LessonDueDateControl
            compact
            lesson={lesson}
            onLessonDueDateChange={onLessonDueDateChange}
            topicId={topic.id}
          />
          <Button onClick={() => setScheduling(false)} size="sm" type="button" variant="secondary">
            Done
          </Button>
        </section>
      ) : null}

      {confirmingDelete ? (
        <section className="flex min-w-0 flex-col gap-3 border-t border-danger/20 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-muted-foreground">
            Delete this lesson and its local file? This cannot be undone.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              className="text-danger hover:text-danger"
              disabled={saving}
              onClick={() => {
                void handleDelete();
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Trash2 size={14} />
              {saving ? "Deleting" : "Delete lesson"}
            </Button>
            <Button
              disabled={saving}
              onClick={() => setConfirmingDelete(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X size={14} />
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </article>
  );
}
