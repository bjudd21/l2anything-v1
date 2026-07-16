import type { ReviewRating, TopicReviewResponse, TopicSummary } from "@learning-hub/shared";
import { BookOpen, CheckCircle2, ChevronDown, List, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ZapIcon } from "../components/icons.js";
import { TopicHeader } from "../components/TopicHeader.js";
import {
  Badge,
  button,
  Button,
  card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  InlineNotice,
  PageSkeleton,
  SectionHeader,
  StatusCard,
  Textarea
} from "../components/ui.js";
import { topicPath, type Route } from "../lib.js";

const dayMs = 24 * 60 * 60 * 1000;

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
  onRateReview,
  onTopicTitleChange,
  review,
  route,
  topic
}: {
  loading: boolean;
  onRateReview: (topicId: number, reviewItemId: number, rating: ReviewRating) => Promise<void>;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  review?: TopicReviewResponse;
  route: Route;
  topic?: TopicSummary;
}) {
  const [answer, setAnswer] = useState("");
  const [index, setIndex] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [ratingError, setRatingError] = useState<string>();
  const [savingRating, setSavingRating] = useState<ReviewRating>();

  useEffect(() => {
    setAnswer("");
    setIndex(0);
    setQueueOpen(false);
    setRatingError(undefined);
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
  const saveRating = async (rating: ReviewRating) => {
    if (!firstItem || savingRating) {
      return;
    }

    setRatingError(undefined);
    setSavingRating(rating);

    try {
      await onRateReview(topic.id, firstItem.id, rating);
      setAnswer("");
      setIndex(0);
      setRevealed(false);
    } catch (error) {
      setRatingError(error instanceof Error ? error.message : "This review could not be saved.");
    } finally {
      setSavingRating(undefined);
    }
  };

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
                <Badge>
                  Concept {index + 1} of {dueCount}
                </Badge>
                {activeDue ? (
                  <Badge tone={activeDue.overdue ? "danger" : "warning"}>{activeDue.label}</Badge>
                ) : null}
              </div>
              <h3 className="text-xl font-bold text-foreground">{firstItem.concept}</h3>
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
                body="Compare your explanation with the lesson or resource that introduced this concept, then rate what you remembered."
              />
            ) : null}
            {ratingError ? (
              <InlineNotice body={ratingError} title="Practice wasn't saved" tone="error" />
            ) : null}
            {revealed ? (
              <div className="grid gap-2">
                <span className="text-sm font-medium text-foreground">How did recall feel?</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={Boolean(savingRating)}
                    onClick={() => void saveRating("again")}
                    type="button"
                    variant="outline"
                  >
                    {savingRating === "again" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                    {savingRating === "again" ? "Saving..." : "Needs work"}
                  </Button>
                  <Button
                    disabled={Boolean(savingRating)}
                    onClick={() => void saveRating("remembered")}
                    type="button"
                  >
                    {savingRating === "remembered" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <CheckCircle2 />
                    )}
                    {savingRating === "remembered" ? "Saving..." : "Remembered it"}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {index + 1} of {dueCount}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={!answer.trim()} onClick={() => setRevealed(true)} type="button">
                  Check answer
                </Button>
                <span className="text-sm text-muted-foreground">
                  {index + 1} of {dueCount}
                </span>
              </div>
            )}
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

        {(review?.items.length ?? 0) > 1 ? (
          <Collapsible onOpenChange={setQueueOpen} open={queueOpen}>
            <CollapsibleTrigger asChild>
              <Button className="w-full sm:w-auto" type="button" variant="secondary">
                <List size={14} />
                {queueOpen ? "Hide queue" : "View queue"}
                <Badge className="rounded-full">{review?.items.length}</Badge>
                <ChevronDown
                  className={queueOpen ? "rotate-180 transition-transform" : "transition-transform"}
                  size={14}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <ReviewQueue
                activeIndex={index}
                items={review?.items ?? []}
                onSelect={(nextIndex) => {
                  setIndex(nextIndex);
                  setAnswer("");
                  setRevealed(false);
                }}
              />
            </CollapsibleContent>
          </Collapsible>
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
    <section aria-label="Due concepts" className="grid gap-3">
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase text-muted-foreground">
              <th className="px-4 py-3">Concept</th>
              <th className="px-4 py-3">Due</th>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
