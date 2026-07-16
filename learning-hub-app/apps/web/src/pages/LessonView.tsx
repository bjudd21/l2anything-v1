import type {
  LessonStatus,
  Quiz,
  QuizAttemptResponse,
  TopicLessonsResponse,
  TopicSummary
} from "@learning-hub/shared";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  LoaderCircle,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LessonKnowledgeCheck } from "../components/LessonKnowledgeCheck.js";
import { LessonDueDateControl } from "../components/LessonDueDateControl.js";
import { LessonTutorSheet } from "../components/LessonTutorSheet.js";
import { ZapIcon } from "../components/icons.js";
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
  InlineNotice,
  LessonStatusPill,
  PageSkeleton,
  SectionHeader,
  StatusCard,
  type StatusTone
} from "../components/ui.js";
import {
  lessonDueText,
  lessonFileUrl,
  lessonNumberLabel,
  lessonRoute,
  topicPath,
  type ArtifactCreatedEvent,
  type Route
} from "../lib.js";

function lessonTone(status: LessonStatus): StatusTone {
  if (status === "completed") {
    return "success";
  }

  if (status === "in_progress") {
    return "warning";
  }

  return "neutral";
}

function workflowErrorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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
  onSubmitQuiz,
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
  onGenerateQuiz: (topicId: number, lessonId?: number) => Promise<Quiz>;
  onStatusChange: (topicId: number, lessonNumber: number, status: LessonStatus) => Promise<void>;
  onSubmitQuiz: (
    topicId: number,
    quizId: number,
    answers: Record<string, string>
  ) => Promise<QuizAttemptResponse>;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  route: Route;
  topic?: TopicSummary;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quiz, setQuiz] = useState<Quiz>();
  const [startingQuiz, setStartingQuiz] = useState(false);
  const [managementError, setManagementError] = useState<string>();
  const startedLessonIds = useRef(new Set<number>());
  const quizSectionRef = useRef<HTMLDivElement>(null);
  const lesson = lessons?.lessons.find((item) => item.number === lessonNumber);

  useEffect(() => {
    setQuiz(undefined);
    setStartingQuiz(false);
    setManagementError(undefined);
  }, [lesson?.id]);

  useEffect(() => {
    if (
      !lesson ||
      !topic ||
      lesson.status !== "unread" ||
      startedLessonIds.current.has(lesson.id)
    ) {
      return;
    }

    startedLessonIds.current.add(lesson.id);
    void onStatusChange(topic.id, lesson.number, "in_progress").catch((error) => {
      setManagementError(workflowErrorText(error, "Lesson progress could not be started."));
    });
  }, [lesson, onStatusChange, topic]);

  useEffect(() => {
    if (!quiz) {
      return;
    }

    quizSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [quiz]);

  if (!topic) {
    return (
      <InlineNotice
        tone="error"
        title="Topic not found"
        body="The requested topic is not indexed."
      />
    );
  }

  const displayStatus: LessonStatus =
    lesson?.status === "unread" ? "in_progress" : (lesson?.status ?? "unread");
  const nextLesson = lessons?.lessons
    .filter((item) => item.number > lessonNumber)
    .sort((left, right) => left.number - right.number)[0];

  const handleDelete = async () => {
    if (!lesson) {
      return;
    }

    setSaving(true);
    setManagementError(undefined);

    try {
      await onDeleteLesson(topic.id, lesson.number);
    } catch (error) {
      setManagementError(workflowErrorText(error, "Lesson could not be deleted."));
      setSaving(false);
    }
  };

  const handleStartKnowledgeCheck = async () => {
    if (!lesson || startingQuiz) {
      return;
    }

    setStartingQuiz(true);
    setManagementError(undefined);

    try {
      setQuiz(await onGenerateQuiz(topic.id, lesson.id));
    } catch (error) {
      setManagementError(workflowErrorText(error, "The knowledge check could not be started."));
    } finally {
      setStartingQuiz(false);
    }
  };

  const handleComplete = async () => {
    if (!lesson) {
      return;
    }

    setManagementError(undefined);

    try {
      await onStatusChange(topic.id, lesson.number, "completed");
    } catch (error) {
      setManagementError(workflowErrorText(error, "Lesson progress could not be completed."));
      throw error;
    }
  };

  const handleReopen = async () => {
    if (!lesson) {
      return;
    }

    setManagementError(undefined);

    try {
      await onStatusChange(topic.id, lesson.number, "in_progress");
      setQuiz(undefined);
    } catch (error) {
      setManagementError(workflowErrorText(error, "Lesson progress could not be reopened."));
    }
  };

  return (
    <div className="mx-auto grid min-w-0 w-full max-w-7xl gap-5 pb-20">
      <TopicHeader onTopicTitleChange={onTopicTitleChange} route={route} topic={topic} />
      {loading && !lesson ? <PageSkeleton /> : null}
      {lesson ? (
        <>
          <section className="mx-auto grid w-full max-w-6xl min-w-0 gap-4">
            <StatusCard className="grid gap-4 p-5" tone={lessonTone(displayStatus)}>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
                  <SectionHeader
                    as="h1"
                    count={lessonNumberLabel(lesson.number)}
                    icon={<BookOpen size={16} />}
                    title={lesson.title}
                    tone={displayStatus === "in_progress" ? "accent" : "neutral"}
                  />
                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                    <LessonStatusPill status={displayStatus} />
                    {lesson.dueAt && displayStatus !== "completed" ? (
                      <span className="tnum rounded-full border border-border bg-secondary/45 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {lessonDueText({ dueAt: lesson.dueAt, status: displayStatus })}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label="Lesson actions"
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
                        Delete lesson
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {scheduling ? (
                <section className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <LessonDueDateControl
                    compact
                    lesson={{ ...lesson, status: displayStatus }}
                    onLessonDueDateChange={onLessonDueDateChange}
                    topicId={topic.id}
                  />
                  <Button
                    onClick={() => setScheduling(false)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Done
                  </Button>
                </section>
              ) : null}

              {confirmingDelete ? (
                <section className="flex min-w-0 flex-col gap-3 border-t border-danger/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
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
              {managementError ? (
                <InlineNotice tone="error" title="Lesson action failed" body={managementError} />
              ) : null}
            </StatusCard>

            <div className="grid min-w-0 gap-3">
              <div className={`${card} min-h-[34rem] min-w-0 overflow-hidden bg-card/70 shadow-xl`}>
                <iframe
                  className="h-[min(72dvh,58rem)] min-h-[34rem] min-w-0 w-full bg-transparent"
                  sandbox="allow-scripts"
                  src={lessonFileUrl(topic.id, lesson.fileName)}
                  title={lesson.title}
                />
              </div>

              {quiz ? (
                <div ref={quizSectionRef}>
                  <LessonKnowledgeCheck
                    key={quiz.id}
                    onComplete={handleComplete}
                    onSubmit={(quizId, answers) => onSubmitQuiz(topic.id, quizId, answers)}
                    quiz={quiz}
                  />
                </div>
              ) : (
                <footer
                  className={`${card} flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}
                >
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-foreground">
                      {displayStatus === "completed"
                        ? "Lesson complete"
                        : "Ready to check your understanding?"}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {displayStatus === "completed"
                        ? "Your progress is saved. Take the knowledge check to schedule future review."
                        : "A short knowledge check completes this lesson and schedules future review."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {displayStatus === "completed" ? (
                      <button
                        className={button.secondary}
                        onClick={() => {
                          void handleReopen();
                        }}
                        type="button"
                      >
                        <RotateCcw size={14} />
                        Reopen lesson
                      </button>
                    ) : null}
                    <button
                      className={button.primary}
                      disabled={startingQuiz}
                      onClick={() => {
                        void handleStartKnowledgeCheck();
                      }}
                      type="button"
                    >
                      {startingQuiz ? (
                        <LoaderCircle className="animate-spin" size={14} />
                      ) : (
                        <ZapIcon size={14} />
                      )}
                      {startingQuiz
                        ? "Starting check..."
                        : displayStatus === "completed"
                          ? "Take knowledge check"
                          : "Start knowledge check"}
                    </button>
                  </div>
                </footer>
              )}

              {quiz && displayStatus === "completed" ? (
                <footer
                  className={`${card} flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}
                >
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-foreground">What&apos;s next?</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {nextLesson
                        ? `Continue with lesson ${nextLesson.number}, or reopen this lesson if you want another pass.`
                        : "Return to your lesson list, or reopen this lesson if you want another pass."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      className={button.secondary}
                      onClick={() => {
                        void handleReopen();
                      }}
                      type="button"
                    >
                      <RotateCcw size={14} />
                      Reopen lesson
                    </button>
                    <a
                      className={button.primary}
                      href={
                        nextLesson ? lessonRoute(topic, nextLesson) : topicPath(topic, "lessons")
                      }
                    >
                      {nextLesson ? `Continue to lesson ${nextLesson.number}` : "Back to lessons"}
                      <ArrowRight size={14} />
                    </a>
                  </div>
                </footer>
              ) : null}
            </div>
          </section>
          <LessonTutorSheet lesson={lesson} onArtifactCreated={onArtifactCreated} topic={topic} />
        </>
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
