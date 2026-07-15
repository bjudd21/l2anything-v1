import type {
  LessonStatus,
  LessonSummary,
  TopicLessonsResponse,
  TopicSummary
} from "@learning-hub/shared";
import { BookOpen, CheckCircle2, CircleDashed, Trash2, X } from "lucide-react";
import { useState } from "react";
import { ChatSurface } from "../components/ChatSurface.js";
import { ZapIcon } from "../components/icons.js";
import { LessonDueDateControl } from "../components/LessonDueDateControl.js";
import { TopicHeader } from "../components/TopicHeader.js";
import {
  button,
  card,
  InlineNotice,
  LessonStatusPill,
  LessonStepper,
  PageSkeleton,
  SectionHeader,
  StatusCard,
  type StatusTone
} from "../components/ui.js";
import {
  lessonFileUrl,
  lessonNumberLabel,
  lessonDueText,
  type ArtifactCreatedEvent,
  type Route
} from "../lib.js";

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

export function LessonViewPage({
  lessonNumber,
  lessons,
  loading,
  onArtifactCreated,
  onDeleteLesson,
  onLessonDueDateChange,
  onGenerateQuiz,
  onStatusChange,
  onTopicTitleChange,
  route,
  topic
}: {
  lessonNumber: number;
  lessons?: TopicLessonsResponse;
  loading: boolean;
  onArtifactCreated: (event: ArtifactCreatedEvent) => void;
  onDeleteLesson: (topicId: number, lessonNumber: number) => Promise<void>;
  onLessonDueDateChange: (
    topicId: number,
    lessonNumber: number,
    dueAt: string | null
  ) => Promise<void>;
  onGenerateQuiz: (topicId: number, lessonId?: number) => void;
  onStatusChange: (topicId: number, lessonNumber: number, status: LessonStatus) => void;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  route: Route;
  topic?: TopicSummary;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [managementError, setManagementError] = useState<string | undefined>();

  if (!topic) {
    return (
      <InlineNotice tone="error" title="Topic not found" body="The requested topic is not indexed." />
    );
  }

  const lesson = lessons?.lessons.find((item) => item.number === lessonNumber);

  const handleDelete = async () => {
    if (!lesson) {
      return;
    }

    setSaving(true);
    setManagementError(undefined);

    try {
      await onDeleteLesson(topic.id, lesson.number);
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : "Lesson could not be deleted.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto grid min-w-0 w-full max-w-7xl gap-5">
      <TopicHeader onTopicTitleChange={onTopicTitleChange} route={route} topic={topic} />
      {loading && !lesson ? <PageSkeleton /> : null}
      {lesson ? (
        <section className="mx-auto grid w-full max-w-[calc(75ch+430px+1rem)] min-w-0 gap-4">
          <StatusCard className="grid gap-4 p-5" tone={lessonTone(lesson)}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="min-w-0">
                <SectionHeader
                  as="h1"
                  count={lessonNumberLabel(lesson.number)}
                  icon={<BookOpen size={16} />}
                  title={lesson.title}
                  tone={lesson.status === "in_progress" ? "accent" : "neutral"}
                />
                <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                  <LessonStatusPill status={lesson.status} />
                  <span className="tnum rounded-full border border-border bg-secondary/45 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {lessonDueText(lesson)}
                  </span>
                  <span className="min-w-0 truncate rounded-full border border-border bg-secondary/45 px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                    {lesson.fileName}
                  </span>
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:justify-end">
                <LessonDueDateControl
                  compact
                  minimal
                  className="shrink-0"
                  lesson={lesson}
                  onLessonDueDateChange={onLessonDueDateChange}
                  topicId={topic.id}
                />
                {confirmingDelete ? (
                  <>
                    <button
                      className={`${button.secondary} !h-8 !min-h-8 px-2.5 text-xs`}
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
                      className={`${button.ghost} size-8 px-0`}
                      disabled={saving}
                      onClick={() => setConfirmingDelete(false)}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    aria-label="Delete lesson"
                    className={`${button.ghost} size-8 px-0 text-danger hover:text-danger`}
                    disabled={saving}
                    onClick={() => setConfirmingDelete(true)}
                    title="Delete lesson"
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
            <LessonStepper current={lessonStepFor(lesson)} />
            {managementError ? (
              <InlineNotice tone="error" title="Lesson action failed" body={managementError} />
            ) : null}
          </StatusCard>

          <div className="grid min-w-0 justify-center gap-4 xl:grid-cols-[minmax(0,75ch)_minmax(320px,400px)] xl:items-start">
            <div className="grid min-w-0 gap-3">
              <div
                className={`${card} min-h-[34rem] min-w-0 overflow-hidden bg-card/70 shadow-xl`}
              >
                <iframe
                  className="h-[min(72dvh,58rem)] min-h-[34rem] min-w-0 w-full bg-transparent"
                  sandbox="allow-scripts"
                  src={lessonFileUrl(topic.id, lesson.fileName)}
                  title={lesson.title}
                />
              </div>

              <footer className={`${card} flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-foreground">
                    {lesson.status === "completed" ? "Ready for active recall" : "Finish this lesson"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {lesson.status === "completed"
                      ? "Start a quiz to turn this lesson into due review prompts."
                      : "Mark it complete when the reading and exercise are done."}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {lesson.status === "completed" ? (
                    <>
                      <button
                        className={button.secondary}
                        onClick={() => onStatusChange(topic.id, lesson.number, "in_progress")}
                        type="button"
                      >
                        <CircleDashed size={14} />
                        Mark in progress
                      </button>
                      <button
                        aria-label="Quiz me on this lesson"
                        className={button.primary}
                        onClick={() => onGenerateQuiz(topic.id, lesson.id)}
                        title="Quiz me on this lesson"
                        type="button"
                      >
                        <ZapIcon size={14} />
                        Quiz me
                      </button>
                    </>
                  ) : (
                    <button
                      className={button.primary}
                      onClick={() => onStatusChange(topic.id, lesson.number, "completed")}
                      type="button"
                    >
                      <CheckCircle2 size={14} />
                      Mark complete
                    </button>
                  )}
                </div>
              </footer>
            </div>

            <aside className="h-[30rem] min-w-0 xl:sticky xl:top-16 xl:h-[34rem] xl:self-start">
              <div className={`${card} h-full min-w-0 overflow-hidden p-4`}>
                <ChatSurface
                  compact
                  lesson={lesson}
                  onArtifactCreated={onArtifactCreated}
                  topic={topic}
                />
              </div>
            </aside>
          </div>
        </section>
      ) : !loading ? (
        <InlineNotice
          tone="error"
          title="Lesson not found"
          body="The requested lesson is not indexed for this topic."
        />
      ) : null}
    </div>
  );
}
