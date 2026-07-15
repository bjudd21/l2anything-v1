import type { AwsStatusResponse, TopicsResponse, TopicSummary } from "@learning-hub/shared";
import { SearchIcon } from "../components/icons.js";
import { awsStatusText, type Route } from "../lib.js";
import { StatusDot } from "./Sidebar.js";

const sectionLabels: Record<Route["name"], string> = {
  dashboard: "Dashboard",
  settings: "Settings",
  "new-topic": "New topic",
  topic: "Overview",
  "topic-lessons": "Lessons",
  "topic-lesson": "Lesson",
  "topic-records": "Progress",
  "topic-resources": "Reference",
  "topic-review": "Practice",
  "not-found": "Not found"
};

function NavMetric({
  label,
  tone = "neutral",
  value
}: {
  label: string;
  tone?: "danger" | "neutral" | "warning";
  value: string | number;
}) {
  const toneClass =
    tone === "danger"
      ? "border-danger/30 bg-danger-soft/45"
      : tone === "warning"
        ? "border-warning/30 bg-warning-soft/40"
        : "border-border bg-card/45";

  return (
    <div
      className={`hidden min-h-9 min-w-0 items-center gap-2 rounded-full border px-3 text-left shadow-sm md:inline-flex ${toneClass}`}
    >
      <div
        className={`tnum font-mono text-sm font-semibold leading-tight ${
          tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

export function TopBar({
  awsStatus,
  onCommandOpen,
  route,
  topic,
  topics
}: {
  awsStatus?: AwsStatusResponse;
  onCommandOpen: () => void;
  route: Route;
  topic?: TopicSummary;
  topics?: TopicsResponse;
}) {
  const allTopics = topics?.topics ?? [];
  const completedLessons = allTopics.reduce((sum, item) => sum + item.completedLessonCount, 0);
  const dueLessons = allTopics.reduce((sum, item) => sum + item.dueLessonCount, 0);
  const dueReviews = allTopics.reduce((sum, item) => sum + item.dueReviewCount, 0);

  return (
    <div className="sticky top-0 z-20 hidden min-h-14 items-center justify-between gap-4 border-b border-border bg-background/78 px-5 shadow-sm shadow-black/10 backdrop-blur-2xl lg:flex lg:px-7">
      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
        {topic ? (
          <>
            <span className="max-w-56 truncate text-foreground">{topic.title}</span>
            <span aria-hidden="true" className="text-border">
              /
            </span>
            <span className="shrink-0">{sectionLabels[route.name]}</span>
          </>
        ) : (
          <span>{sectionLabels[route.name]}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {completedLessons > 0 ? (
          <NavMetric label="lessons done" value={completedLessons} />
        ) : null}
        {dueLessons > 0 ? (
          <NavMetric label="lessons due" tone="warning" value={dueLessons} />
        ) : null}
        {dueReviews > 0 ? (
          <NavMetric label="reviews due" tone="danger" value={dueReviews} />
        ) : null}
        <button
          aria-label="Open command palette"
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-card/45 px-2.5 text-xs font-medium text-muted-foreground backdrop-blur-xl hover:bg-secondary/75 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
          onClick={onCommandOpen}
          type="button"
        >
          <SearchIcon size={13} />
          <span className="sr-only md:not-sr-only">Search</span>
          <kbd className="font-mono text-[10px]">Ctrl K</kbd>
        </button>
        <span className="flex items-center gap-1.5" title={awsStatusText(awsStatus)}>
          <StatusDot status={awsStatus} />
          <span className="sr-only">{awsStatusText(awsStatus)}</span>
        </span>
      </div>
    </div>
  );
}
