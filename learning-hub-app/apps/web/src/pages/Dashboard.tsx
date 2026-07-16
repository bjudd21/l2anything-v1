import type {
  AwsStatusResponse,
  DashboardResponse,
  ReviewItem,
  SettingsResponse,
  TopicReviewResponse,
  TopicsResponse,
  TopicSummary
} from "@learning-hub/shared";
import {
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  LayoutGrid,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { AwsBanner } from "../components/AwsBanner.js";
import {
  Badge,
  button,
  card,
  DueBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  GradientCardCta,
  InlineNotice,
  SectionHeader,
  ShellSkeleton,
  StatusCard,
  StatusPill,
  StrengthMeter,
  type StatusTone,
  type StrengthLevel
} from "../components/ui.js";
import { formatStudiedAt, topicPath, type AwsLoginStatus } from "../lib.js";

const dayMs = 24 * 60 * 60 * 1000;

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function orderedTopics(topics: TopicSummary[]) {
  return [...topics].sort((left, right) => {
    const dueDelta = right.dueReviewCount - left.dueReviewCount;
    const lessonDelta =
      Number(left.completedLessonCount >= left.lessonCount && left.lessonCount > 0) -
      Number(right.completedLessonCount >= right.lessonCount && right.lessonCount > 0);

    return dueDelta || lessonDelta || left.title.localeCompare(right.title);
  });
}

function topicFromNextAction(topics: TopicSummary[], nextAction?: DashboardResponse["nextAction"]) {
  if (!nextAction?.href) {
    return orderedTopics(topics)[0];
  }

  return (
    topics.find((topic) => nextAction.href?.startsWith(topicPath(topic))) ??
    orderedTopics(topics)[0]
  );
}

function parseTopicTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function lastActiveTopic(topics: TopicSummary[]) {
  return topics
    .filter((topic) => parseTopicTimestamp(topic.lastActiveAt) > 0)
    .sort(
      (left, right) =>
        parseTopicTimestamp(right.lastActiveAt) - parseTopicTimestamp(left.lastActiveAt)
    )[0];
}

function resumeTopicFor(topics: TopicSummary[], nextAction?: DashboardResponse["nextAction"]) {
  return lastActiveTopic(topics) ?? topicFromNextAction(topics, nextAction);
}

function topicStatus(topic: TopicSummary): "in-progress" | "up-next" {
  if (topic.lessonCount > 0 && topic.completedLessonCount < topic.lessonCount) {
    return "in-progress";
  }

  return "up-next";
}

function topicTone(topic: TopicSummary): StatusTone {
  return topicStatus(topic) === "in-progress" ? "warning" : "neutral";
}

function topicCta(topic: TopicSummary, nextAction?: DashboardResponse["nextAction"]) {
  const matchedNextAction =
    nextAction?.href && nextAction.href.startsWith(topicPath(topic)) ? nextAction : undefined;

  if (topic.dueReviewCount > 0) {
    return {
      href: topicPath(topic, "review"),
      label: "Review topic",
      detail: `${topic.dueReviewCount} due`
    };
  }

  if (matchedNextAction?.href) {
    return {
      href: matchedNextAction.href,
      label: matchedNextAction.label,
      detail: topic.lessonCount ? `${topic.completedLessonCount} lessons done` : "mission ready"
    };
  }

  if (topic.lessonCount === 0) {
    return {
      href: topicPath(topic),
      label: "Generate first lesson",
      detail: "mission"
    };
  }

  return {
    href: topicPath(topic, "lessons"),
    label: topic.completedLessonCount < topic.lessonCount ? "Continue lesson" : "Open lessons",
    detail: `${topic.completedLessonCount} lessons done`
  };
}

function lessonNumberFromHref(href: string) {
  const match = /\/lessons\/(\d+)$/.exec(href);
  return match?.[1] ? Number(match[1]) : null;
}

function primaryActionLabel(action: ReturnType<typeof topicCta>) {
  return lessonNumberFromHref(action.href) ? "Continue lesson" : action.label;
}

function actionDetailLabel(action: ReturnType<typeof topicCta>) {
  // Uniform across all topic cards: the resume topic used to show a padded
  // lesson number while others showed the lessons-done count. Keep one format.
  return action.detail;
}

function topicMissionLine(topic: TopicSummary, nextAction?: DashboardResponse["nextAction"]) {
  if (topic.dueReviewCount > 0) {
    return `${plural(topic.dueReviewCount, "active-recall prompt")} waiting. Start with the oldest concept before opening new material.`;
  }

  if (nextAction?.href?.startsWith(topicPath(topic)) && nextAction.description) {
    return nextAction.description.replace(`${topic.title}: `, "");
  }

  if (topic.lessonCount === 0) {
    return "Mission ready for its first lesson.";
  }

  if (topic.completedLessonCount >= topic.lessonCount) {
    return "Review learning records or generate the next lesson when ready.";
  }

  return "Continue the next lesson and keep the mission moving.";
}

function topicLessonSummary(topic: TopicSummary) {
  if (!topic.lessonCount) {
    return "No lessons yet";
  }

  return `${plural(topic.completedLessonCount, "lesson")} done`;
}

function topicMetaLine(topic: TopicSummary) {
  const parts = [topic.lessonCount ? plural(topic.lessonCount, "lesson") : "No lessons yet"];

  if (topic.recordCount) {
    parts.push(plural(topic.recordCount, "learning record"));
  }
  if (topic.resourceCount) {
    parts.push(plural(topic.resourceCount, "resource"));
  }
  if (topic.referenceCount) {
    parts.push(plural(topic.referenceCount, "reference doc"));
  }

  return parts.join(" / ");
}

function topicReviewStrength(topic: TopicSummary): StrengthLevel {
  if (topic.reviewItemCount >= 5 && topic.dueReviewCount <= 1) {
    return "strong";
  }

  return topic.dueReviewCount > 2 ? "learning" : "new";
}

function reviewItemStrength(item: ReviewItem): StrengthLevel {
  if (item.intervalDays >= 7 || item.ease >= 2.5) {
    return "strong";
  }

  return item.intervalDays >= 2 || item.ease >= 2 ? "learning" : "new";
}

function dayStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function relativePastDate(value: Date) {
  const diffDays = Math.max(0, Math.round((dayStart(new Date()) - dayStart(value)) / dayMs));

  if (diffDays === 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  if (diffDays < 31) {
    return `${diffDays} days ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short"
  }).format(value);
}

function lastReviewedText(item: ReviewItem) {
  const dueAt = Date.parse(item.dueAt);
  if (Number.isNaN(dueAt)) {
    return "Scheduled";
  }

  return relativePastDate(new Date(dueAt - item.intervalDays * dayMs));
}

function dueText(value: string) {
  const dueAt = Date.parse(value);
  if (Number.isNaN(dueAt)) {
    return { label: "Due", overdue: false };
  }

  const diffDays = Math.round((dayStart(new Date()) - dayStart(new Date(dueAt))) / dayMs);
  if (diffDays > 0) {
    return { label: `Overdue ${diffDays}d`, overdue: true };
  }

  if (diffDays === 0) {
    return { label: "Today", overdue: false };
  }

  return {
    label: `Due ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(
      new Date(dueAt)
    )}`,
    overdue: false
  };
}

function localDateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function lessonDeadlineText(value: string) {
  const dueDate = localDateFromKey(value);
  const diffDays = Math.round((dayStart(dueDate) - dayStart(new Date())) / dayMs);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    weekday: "short",
    ...(dueDate.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" })
  }).format(dueDate);

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return {
      dateLabel,
      label: `Overdue ${plural(days, "day")}`,
      overdue: true,
      tone: "danger" as const
    };
  }

  if (diffDays === 0) {
    return { dateLabel, label: "Due today", overdue: false, tone: "warning" as const };
  }

  if (diffDays === 1) {
    return { dateLabel, label: "Due tomorrow", overdue: false, tone: "warning" as const };
  }

  return {
    dateLabel,
    label: `Due in ${plural(diffDays, "day")}`,
    overdue: false,
    tone: "neutral" as const
  };
}

interface DashboardReviewRow {
  concept: string;
  due: string;
  href: string;
  id: string;
  lastReviewed: string;
  overdue: boolean;
  strength: StrengthLevel;
  topic: TopicSummary;
}

function reviewRows(
  topics: TopicSummary[],
  reviewCache: Record<number, TopicReviewResponse>
): DashboardReviewRow[] {
  return topics.flatMap((topic) => {
    if (topic.dueReviewCount <= 0) {
      return [];
    }

    const href = topicPath(topic, "review");
    const items = reviewCache[topic.id]?.items ?? [];

    if (items.length) {
      return items.map((item) => {
        const due = dueText(item.dueAt);

        return {
          concept: item.concept,
          due: due.label,
          href,
          id: `item-${item.id}`,
          lastReviewed: lastReviewedText(item),
          overdue: due.overdue,
          strength: reviewItemStrength(item),
          topic
        };
      });
    }

    return [
      {
        concept: plural(topic.dueReviewCount, "review") + " due",
        due: "Due today",
        href,
        id: `topic-${topic.id}`,
        lastReviewed: "Scheduled",
        overdue: false,
        strength: topicReviewStrength(topic),
        topic
      }
    ];
  });
}

function navigateTo(href: string) {
  if (typeof window !== "undefined") {
    window.location.href = href;
  }
}

export function Dashboard({
  awsLoginMessage,
  awsLoginStatus,
  awsStatus,
  dashboard,
  loadError,
  onAwsLogin,
  onDeleteTopic,
  settings,
  topicReviewCache,
  topics,
  topicsLoading
}: {
  awsLoginMessage?: string;
  awsLoginStatus: AwsLoginStatus;
  awsStatus?: AwsStatusResponse;
  dashboard?: DashboardResponse;
  loadError?: string;
  onAwsLogin: () => void;
  onDeleteTopic: (topicId: number, slug: string) => Promise<void>;
  settings?: SettingsResponse;
  topicReviewCache: Record<number, TopicReviewResponse>;
  topics?: TopicsResponse;
  topicsLoading: boolean;
}) {
  const allTopics = topics?.topics ?? dashboard?.topics ?? [];
  const ordered = orderedTopics(allTopics);
  const resumeTopic = resumeTopicFor(allTopics, dashboard?.nextAction);

  return (
    <div className="grid w-full min-w-0 max-w-[1400px] gap-6">
      <SectionHeader
        as="h1"
        icon={<BookOpen size={17} />}
        meta={new Intl.DateTimeFormat(undefined, {
          day: "numeric",
          month: "short",
          weekday: "short"
        }).format(new Date())}
        title="Pick up where you left off"
      />

      {loadError ? <InlineNotice tone="error" title="API unavailable" body={loadError} /> : null}
      <AwsBanner
        loginMessage={awsLoginMessage}
        loginStatus={awsLoginStatus}
        onAwsLogin={onAwsLogin}
        settings={settings}
        status={awsStatus}
      />

      {!settings?.workspaceDir ? (
        <InlineNotice
          body="Restart the local server so it can create the installation workspace."
          title="Workspace location is unavailable"
        />
      ) : null}

      {topicsLoading ? (
        <section className={`${card} p-5`} aria-label="Loading topics">
          <ShellSkeleton />
        </section>
      ) : resumeTopic ? (
        <>
          <ResumeHero nextAction={dashboard?.nextAction} topic={resumeTopic} />
          <LessonDeadlineTable deadlines={dashboard?.lessonDeadlines ?? []} />
          <ReviewQueue reviewCache={topicReviewCache} topics={ordered} />
          <TopicGrid
            nextAction={dashboard?.nextAction}
            onDeleteTopic={onDeleteTopic}
            topics={ordered}
          />
        </>
      ) : (
        <EmptyDashboard />
      )}
    </div>
  );
}

function ResumeHero({
  nextAction,
  topic
}: {
  nextAction?: DashboardResponse["nextAction"];
  topic: TopicSummary;
}) {
  const action = topicCta(topic, nextAction);

  return (
    <StatusCard
      className="relative overflow-hidden p-6 sm:p-7"
      style={{
        background:
          "radial-gradient(120% 150% at 0% 0%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 50%), linear-gradient(180deg, color-mix(in oklch, var(--foreground) 5%, transparent), transparent 130px), var(--card)",
        borderColor: "color-mix(in oklch, var(--primary) 34%, transparent)",
        boxShadow:
          "0 20px 52px -28px color-mix(in oklch, var(--primary) 50%, transparent), inset 0 1px 0 color-mix(in oklch, var(--foreground) 7%, transparent)"
      }}
      tone="accent"
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="grid min-w-0 gap-4 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:items-start">
            <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary-soft/75 text-primary-strong shadow-lg">
              <Check size={22} strokeWidth={2.5} />
            </span>

            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex min-h-8 items-center rounded-full border border-primary/30 bg-primary-soft/70 px-3 text-xs font-bold uppercase text-primary-strong shadow-sm">
                  Resume
                </span>
                <StatusPill status={topicStatus(topic)} />
                <DueBadge count={topic.dueReviewCount} compact />
              </div>

              <h2 className="mt-4 max-w-4xl break-words text-[30px] font-bold leading-tight text-foreground sm:text-[34px]">
                {topic.title}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                <span className="font-semibold text-foreground">Next action: </span>
                {topicMissionLine(topic, nextAction)}
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                {topicMetaLine(topic)}
              </p>
            </div>
          </div>
        </div>

        <a
          aria-label={`Open ${topic.title}`}
          className={`${button.ghost} justify-self-start size-9 px-0 text-muted-foreground lg:justify-self-end`}
          href={topicPath(topic)}
        >
          <MoreHorizontal size={16} />
        </a>
      </div>

      <div className="mt-7 flex min-w-0 justify-end border-t border-border pt-5">
        <a className={`${button.primary} w-full sm:w-auto`} href={action.href}>
          <Play size={14} />
          {primaryActionLabel(action)}
        </a>
      </div>
    </StatusCard>
  );
}

function LessonDeadlineTable({ deadlines }: { deadlines: DashboardResponse["lessonDeadlines"] }) {
  if (!deadlines.length) {
    return null;
  }

  return (
    <section className="grid gap-3">
      <SectionHeader
        count={deadlines.length}
        icon={<CalendarClock size={16} />}
        title="Lesson deadlines"
      />
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase text-muted-foreground">
              <th className="px-4 py-3">Lesson</th>
              <th className="px-4 py-3">Topic</th>
              <th className="px-4 py-3">Deadline</th>
              <th className="w-14 px-4 py-3">
                <span className="sr-only">Open lesson</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {deadlines.map((deadline) => {
              const due = lessonDeadlineText(deadline.dueAt);

              return (
                <tr
                  className={[
                    "border-b border-border last:border-b-0",
                    due.overdue ? "bg-gradient-to-r from-danger-soft/35 to-transparent" : ""
                  ].join(" ")}
                  key={deadline.id}
                >
                  <td className="px-4 py-3">
                    <a
                      className="font-semibold text-foreground hover:text-primary hover:underline"
                      href={deadline.href}
                    >
                      {deadline.title}
                    </a>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Lesson {deadline.number}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{deadline.topicTitle}</td>
                  <td className="px-4 py-3">
                    <Badge tone={due.tone}>{due.label}</Badge>
                    <div className="mt-1.5 text-xs text-muted-foreground">{due.dateLabel}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      aria-label={`Open ${deadline.title}`}
                      className={`${button.ghost} size-9 px-0 text-muted-foreground`}
                      href={deadline.href}
                      title="Open lesson"
                    >
                      <ChevronRight size={16} />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReviewQueue({
  reviewCache,
  topics
}: {
  reviewCache: Record<number, TopicReviewResponse>;
  topics: TopicSummary[];
}) {
  const rows = reviewRows(topics, reviewCache);

  if (!rows.length) {
    return null;
  }

  return (
    <section className="grid gap-3">
      <SectionHeader count={rows.length} icon={<RotateCcw size={16} />} title="Review queue" />
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase text-muted-foreground">
              <th className="px-4 py-3">Concept</th>
              <th className="px-4 py-3">Topic</th>
              <th className="px-4 py-3">Last reviewed</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Strength</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className={[
                  "cursor-pointer border-b border-border last:border-b-0 hover:bg-secondary/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                  row.overdue ? "bg-gradient-to-r from-danger-soft/35 to-transparent" : ""
                ].join(" ")}
                key={row.id}
                onClick={() => navigateTo(row.href)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigateTo(row.href);
                  }
                }}
                role="link"
                tabIndex={0}
              >
                <td className="px-4 py-3 font-medium text-foreground">{row.concept}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.topic.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.lastReviewed}</td>
                <td
                  className={`px-4 py-3 font-semibold ${
                    row.overdue ? "danger-readable" : "text-muted-foreground"
                  }`}
                >
                  {row.due}
                </td>
                <td className="px-4 py-3">
                  <StrengthMeter level={row.strength} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TopicGrid({
  nextAction,
  onDeleteTopic,
  topics
}: {
  nextAction?: DashboardResponse["nextAction"];
  onDeleteTopic: (topicId: number, slug: string) => Promise<void>;
  topics: TopicSummary[];
}) {
  return (
    <section className="grid gap-3">
      <SectionHeader
        count={topics.length}
        icon={<LayoutGrid size={16} />}
        title="All topics"
        tone="neutral"
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {topics.map((topic) => (
          <TopicCard
            key={topic.id}
            nextAction={nextAction}
            onDeleteTopic={onDeleteTopic}
            topic={topic}
          />
        ))}
        <a
          className={`${card} grid min-h-44 content-center justify-items-center gap-2 border-dashed p-5 text-center hover:border-primary/35 hover:bg-card/90 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 active:translate-y-px`}
          href="/topics/new"
        >
          <Plus className="text-primary" size={20} />
          <span className="font-semibold text-foreground">New topic</span>
          <span className="max-w-[24ch] text-sm leading-6 text-muted-foreground">
            Start with what you want to learn and why.
          </span>
        </a>
      </div>
    </section>
  );
}

function TopicCard({
  nextAction,
  onDeleteTopic,
  topic
}: {
  nextAction?: DashboardResponse["nextAction"];
  onDeleteTopic: (topicId: number, slug: string) => Promise<void>;
  topic: TopicSummary;
}) {
  const [deleting, setDeleting] = useState(false);
  const action = topicCta(topic, nextAction);
  const tone = topicTone(topic);
  const studied = formatStudiedAt(topic.lastActiveAt);

  const handleDelete = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Delete "${topic.title}" and all of its lessons, learning records, and files?`
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      await onDeleteTopic(topic.id, topic.slug);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <StatusCard
      className="group flex min-h-60 flex-col gap-4 p-4 transition-transform duration-150 hover:-translate-y-0.5"
      tone={tone}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-foreground">
          {topic.title}
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Topic actions for ${topic.title}`}
              className={`${button.ghost} size-9 px-0 text-muted-foreground`}
              disabled={deleting}
              title="Topic actions"
              type="button"
            >
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={topicPath(topic)}>Open topic</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={deleting}
              onSelect={() => {
                void handleDelete();
              }}
              variant="destructive"
            >
              <Trash2 size={14} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <StatusPill status={topicStatus(topic)} />
        <DueBadge count={topic.dueReviewCount} compact />
        {topic.dueLessonCount ? (
          <Badge className="rounded-full normal-case" tone="warning">
            <Clock3 size={12} />
            {plural(topic.dueLessonCount, "lesson")} due
          </Badge>
        ) : null}
      </div>

      <p className="text-sm leading-6 text-muted-foreground">
        <span className="font-medium text-muted-foreground/90">Mission: </span>
        {topicMissionLine(topic, nextAction)}
      </p>

      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{topicMetaLine(topic)}</span>
        {topic.completedLessonCount > 0 ? <span>{topicLessonSummary(topic)}</span> : null}
        {studied ? (
          <span className="tnum inline-flex min-h-6 min-w-0 items-center gap-1 rounded-full border border-border bg-secondary/45 px-2 text-[11px] font-medium text-muted-foreground">
            <Clock3 size={11} />
            <span className="truncate">{studied}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-auto">
        <GradientCardCta
          detail={topic.dueReviewCount > 0 ? actionDetailLabel(action) : undefined}
          href={action.href}
          icon={topic.dueReviewCount ? <RotateCcw size={13} /> : undefined}
          tone={tone}
        >
          {primaryActionLabel(action)}
        </GradientCardCta>
      </div>
    </StatusCard>
  );
}

function EmptyDashboard() {
  return (
    <StatusCard className="grid justify-items-center gap-3 px-6 py-12 text-center" tone="neutral">
      <Plus className="text-primary" size={22} />
      <h2 className="text-base font-bold text-foreground">No topics yet</h2>
      <p className="max-w-md text-sm leading-6 text-muted-foreground">
        Start with what you want to learn. The tutor will shape a mission, then generate the first
        lesson.
      </p>
      <a className={button.primary} href="/topics/new">
        <Plus size={14} />
        New topic
      </a>
    </StatusCard>
  );
}
