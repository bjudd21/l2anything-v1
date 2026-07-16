import type { TopicReviewResponse, TopicSummary } from "@learning-hub/shared";
import { BookOpen, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ZapIcon } from "../components/icons.js";
import { TopicHeader } from "../components/TopicHeader.js";
import {
  Badge,
  button,
  card,
  DueBadge,
  InlineNotice,
  PageSkeleton,
  SectionHeader,
  StatusCard,
  StrengthMeter,
  Textarea,
  type StrengthLevel
} from "../components/ui.js";
import { topicPath, type Route } from "../lib.js";

const dayMs = 24 * 60 * 60 * 1000;

function strengthFromItem(item: TopicReviewResponse["items"][number]): StrengthLevel {
  if (item.ease >= 2.7 && item.intervalDays >= 7) {
    return "strong";
  }

  return item.intervalDays >= 2 ? "learning" : "new";
}

function dayStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function dueState(value: string) {
  const dueAt = Date.parse(value);
  if (Number.isNaN(dueAt)) {
    return { label: "Due", overdue: false };
  }

  const diffDays = Math.round((dayStart(new Date()) - dayStart(new Date(dueAt))) / dayMs);
  if (diffDays > 0) {
    return { label: `Overdue ${diffDays}d`, overdue: true };
  }

  if (diffDays === 0) {
    return { label: "Due today", overdue: false };
  }

  return {
    label: `Due ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(
      new Date(dueAt)
    )}`,
    overdue: false
  };
}

export function ReviewPage({
  loading,
  onTopicTitleChange,
  review,
  route,
  topic
}: {
  loading: boolean;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  review?: TopicReviewResponse;
  route: Route;
  topic?: TopicSummary;
}) {
  const [answer, setAnswer] = useState("");
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setAnswer("");
    setIndex(0);
    setRevealed(false);
  }, [topic?.id, review?.items.length]);

  if (!topic) {
    return (
      <InlineNotice
        tone="error"
        title="Topic not found"
        body="The requested topic is not indexed."
      />
    );
  }

  const firstItem = review?.items[index];
  const dueCount = review?.items.length ?? topic.dueReviewCount;
  const activeDue = firstItem ? dueState(firstItem.dueAt) : null;

  return (
    <div className="grid w-full min-w-0 max-w-4xl gap-5">
      <TopicHeader onTopicTitleChange={onTopicTitleChange} route={route} topic={topic} />
      <section className="grid gap-4">
        <SectionHeader
          count={dueCount || undefined}
          icon={<ZapIcon size={16} />}
          title="Active recall"
        />
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Explain each concept from memory before checking your confidence and moving on.
        </p>

        {loading && !review ? <PageSkeleton /> : null}
        {firstItem ? (
          <StatusCard className="grid gap-4 p-6" tone={activeDue?.overdue ? "danger" : "accent"}>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Concept {index + 1}</Badge>
                <DueBadge count={dueCount} compact />
                {activeDue ? (
                  <Badge tone={activeDue.overdue ? "danger" : "warning"}>
                    {activeDue.label}
                  </Badge>
                ) : null}
              </div>
              <h3 className="text-xl font-bold text-foreground">{firstItem.concept}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>
                  Ease <span className="tnum">{firstItem.ease.toFixed(1)}</span>
                </Badge>
                <Badge>
                  <span className="tnum">
                    {firstItem.intervalDays} day{firstItem.intervalDays === 1 ? "" : "s"}
                  </span>
                  &nbsp;interval
                </Badge>
                <StrengthMeter level={strengthFromItem(firstItem)} />
              </div>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">Your answer</span>
              <Textarea
                className="min-h-32 resize-y"
                disabled={revealed}
                onChange={(event) => setAnswer(event.currentTarget.value)}
                placeholder="Explain it in your own words first."
                value={answer}
              />
            </label>
            {revealed ? (
              <InlineNotice
                title="Check your answer"
                body="Compare your explanation against the lesson or resource that introduced this concept, then move to the next due item."
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {revealed ? (
                <button
                  className={button.primary}
                  onClick={() => {
                    const nextIndex = index + 1;
                    setIndex(nextIndex >= (review?.items.length ?? 0) ? 0 : nextIndex);
                    setAnswer("");
                    setRevealed(false);
                  }}
                  type="button"
                >
                  Next concept
                </button>
              ) : (
                <button
                  className={button.primary}
                  disabled={!answer.trim()}
                  onClick={() => setRevealed(true)}
                  type="button"
                >
                  Check answer
                </button>
              )}
              <span className="text-sm text-muted-foreground">
                {index + 1} of {dueCount}
              </span>
            </div>
          </StatusCard>
        ) : !loading ? (
          <div className={`${card} grid justify-items-center gap-3 px-6 py-10 text-center`}>
            <span className="grid size-10 place-items-center rounded-full bg-success-soft text-success">
              <ZapIcon size={18} />
            </span>
            <h3 className="text-base font-bold">All caught up</h3>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              Nothing is due right now. Finish a lesson and take its quiz to schedule future
              practice.
            </p>
            <a className={button.primary} href={topicPath(topic, "lessons")}>
              <BookOpen size={14} />
              Open lessons
            </a>
          </div>
        ) : null}

        {review?.items.length ? (
          <ReviewQueue
            activeIndex={index}
            items={review.items}
            onSelect={(nextIndex) => {
              setIndex(nextIndex);
              setAnswer("");
              setRevealed(false);
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function ReviewQueue({
  activeIndex,
  items,
  onSelect
}: {
  activeIndex: number;
  items: TopicReviewResponse["items"];
  onSelect: (index: number) => void;
}) {
  return (
    <section className="grid gap-3">
      <SectionHeader
        count={items.length}
        icon={<RotateCcw size={16} />}
        title="Due queue"
        tone="neutral"
      />
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase text-muted-foreground">
              <th className="px-4 py-3">Concept</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Strength</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, itemIndex) => {
              const due = dueState(item.dueAt);
              const active = itemIndex === activeIndex;

              return (
                <tr
                  aria-current={active ? "step" : undefined}
                  className={[
                    "cursor-pointer border-b border-border last:border-b-0 hover:bg-secondary/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    active ? "bg-primary-soft/30" : "",
                    due.overdue ? "bg-gradient-to-r from-danger-soft/35 to-transparent" : ""
                  ].join(" ")}
                  key={item.id}
                  onClick={() => onSelect(itemIndex)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(itemIndex);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{item.concept}</td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      due.overdue ? "danger-readable" : "text-muted-foreground"
                    }`}
                  >
                    {due.label}
                  </td>
                  <td className="px-4 py-3">
                    <StrengthMeter level={strengthFromItem(item)} />
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
