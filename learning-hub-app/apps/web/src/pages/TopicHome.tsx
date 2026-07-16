import type {
  AwsStatusResponse,
  TopicDetailResponse,
  TopicLessonsResponse,
  TopicSummary
} from "@learning-hub/shared";
import { GenerationProgress } from "../components/GenerationProgress.js";
import { FileTextIcon, PlayIcon, SparklesIcon } from "../components/icons.js";
import { MarkdownView } from "../components/markdown.js";
import { TopicHeader } from "../components/TopicHeader.js";
import {
  button,
  card,
  InlineNotice,
  LessonStepper,
  PageSkeleton,
  SectionHeader,
  StatusCard
} from "../components/ui.js";
import { type LessonGenerationState, topicPath, type Route } from "../lib.js";

export function TopicHome({
  awsStatus,
  detail,
  lessonGeneration,
  lessons,
  loading,
  onGenerateLesson,
  onTopicTitleChange,
  route,
  topic
}: {
  awsStatus?: AwsStatusResponse;
  detail?: TopicDetailResponse;
  lessonGeneration: LessonGenerationState;
  lessons?: TopicLessonsResponse;
  loading: boolean;
  onGenerateLesson: (topicId: number) => void;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  route: Route;
  topic?: TopicSummary;
}) {
  const awsReady = awsStatus?.ok === true;

  if (!topic) {
    return (
      <InlineNotice
        tone="error"
        title="Topic not found"
        body="The requested topic is not indexed."
      />
    );
  }

  const lessonUnderConstruction = lessonGeneration.status === "streaming";
  const orderedLessons = [...(lessons?.lessons ?? [])].sort((a, b) => a.number - b.number);
  const currentLesson = orderedLessons.find((lesson) => lesson.status !== "completed");
  const lessonCount = lessons
    ? orderedLessons.length
    : (detail?.counts.lessons ?? topic.lessonCount);
  const completedLessonCount = lessons
    ? orderedLessons.filter((lesson) => lesson.status === "completed").length
    : (detail?.counts.completedLessons ?? topic.completedLessonCount);
  const lessonSequenceReady =
    lessonCount === 0 || (lessonCount > 0 && completedLessonCount >= lessonCount);
  const canGenerateLesson = !lessonUnderConstruction && awsReady && lessonSequenceReady;
  const showGenerateLesson = !lessonUnderConstruction && lessonSequenceReady;
  const generateLabel = lessonCount === 0 ? "Generate first lesson" : "Generate next lesson";
  const runningActivity = [...lessonGeneration.activities]
    .reverse()
    .find((activity) => activity.status === "running");

  return (
    <div className="grid w-full min-w-0 max-w-[1400px] gap-5">
      <TopicHeader onTopicTitleChange={onTopicTitleChange} route={route} topic={topic} />

      {loading && !detail ? <PageSkeleton /> : null}

      {lessonUnderConstruction ? (
        <section
          aria-live="polite"
          className={`${card} tint-accent grid gap-4 border-primary/30 p-5`}
        >
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary-soft/60 text-primary">
                <SparklesIcon size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold">Lesson under construction</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  The tutor is turning the mission interview into the first teach-skill lesson.
                </p>
              </div>
            </div>
            <span className="tnum shrink-0 rounded-md border border-primary/25 bg-primary-soft/55 px-2 py-1 text-[10px] font-bold uppercase text-primary-strong">
              Working
            </span>
          </div>
          <GenerationProgress
            activities={lessonGeneration.activities}
            status={lessonGeneration.status}
          />
          {runningActivity ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Current step: {runningActivity.label}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={`${card} p-5`}>
          <SectionHeader icon={<FileTextIcon size={16} />} title="Mission" tone="neutral" />
          <div className="mt-3">
            <MarkdownView
              content={detail?.mission}
              empty="No mission file is available for this topic."
            />
          </div>
        </div>

        <StatusCard className="grid content-start gap-4 p-5" tone="accent">
          <div>
            <SectionHeader icon={<PlayIcon size={16} />} title="Up next" />
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
              {detail?.nextAction.description ??
                "Open a lesson or generate a new lesson after AWS connects."}
            </p>
          </div>
          <div className="grid gap-2.5">
            {detail?.nextAction.href ? (
              <a className={button.primary} href={detail.nextAction.href}>
                <PlayIcon size={14} />
                {detail.nextAction.label}
              </a>
            ) : null}
            {showGenerateLesson ? (
              <button
                className={detail?.nextAction.href ? button.secondary : button.primary}
                disabled={!canGenerateLesson}
                onClick={() => onGenerateLesson(topic.id)}
                title={awsReady ? generateLabel : "AWS credentials are required"}
                type="button"
              >
                <SparklesIcon size={14} />
                {generateLabel}
              </button>
            ) : null}
            {currentLesson ? (
              <section className="grid gap-3 rounded-md border border-border bg-background/45 p-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Current lesson
                  </p>
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {currentLesson.title}
                  </h3>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {currentLesson.fileName}
                  </p>
                </div>
                <LessonStepper current="learn" />
              </section>
            ) : null}
            {lessonGeneration.error ? (
              <InlineNotice
                tone="error"
                title="Generation needs attention"
                body={
                  lessonGeneration.needsModelSettings ? (
                    <>
                      {lessonGeneration.error} Choose a model in{" "}
                      <a
                        className="font-semibold text-foreground underline underline-offset-4 hover:text-primary-strong"
                        href="/settings"
                      >
                        Settings
                      </a>
                      .
                    </>
                  ) : (
                    lessonGeneration.error
                  )
                }
              />
            ) : null}
          </div>
        </StatusCard>
      </section>

      <section className={`${card} p-5`}>
        <SectionHeader
          count={detail?.recentRecords.length ?? 0}
          icon={<FileTextIcon size={16} />}
          title="Recent tutor memory"
          tone="neutral"
        />
        {detail?.recentRecords.length ? (
          <div className="mt-3 grid gap-1.5">
            {detail.recentRecords.map((record) => (
              <a
                className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-[13px] hover:bg-secondary/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
                href={topicPath(topic, "records")}
                key={record.id}
              >
                <FileTextIcon className="shrink-0 text-muted-foreground" size={15} />
                <span className="min-w-0 flex-1 truncate font-medium">{record.title}</span>
                <span className="tnum shrink-0 text-xs text-muted-foreground">
                  #{record.number}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            No tutor memory yet. It appears as the tutor captures what changed in your
            understanding.
          </p>
        )}
      </section>
    </div>
  );
}
