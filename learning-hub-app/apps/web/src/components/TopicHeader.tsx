import type { TopicSummary } from "@learning-hub/shared";
import { Pencil, Save, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { BookOpenIcon, FileTextIcon, HomeIcon, LibraryIcon, ZapIcon } from "./icons.js";
import { button, DueBadge, field, Input, StatusPill } from "./ui.js";
import { topicPath, type Route } from "../lib.js";

function topicStatus(topic: TopicSummary) {
  return topic.lessonCount > 0 && topic.completedLessonCount < topic.lessonCount
    ? "in-progress"
    : "up-next";
}

export function TopicHeader({
  onTopicTitleChange,
  route,
  topic
}: {
  onTopicTitleChange?: (topicId: number, title: string) => Promise<void>;
  route: Route;
  topic: TopicSummary;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(topic.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | undefined>();

  useEffect(() => {
    setEditingTitle(false);
    setDraftTitle(topic.title);
    setSavingTitle(false);
    setTitleError(undefined);
  }, [topic.id, topic.title]);

  const handleTitleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextTitle = draftTitle.trim();
    if (!onTopicTitleChange || !nextTitle || savingTitle) {
      return;
    }

    setSavingTitle(true);
    setTitleError(undefined);

    try {
      await onTopicTitleChange(topic.id, nextTitle);
      setEditingTitle(false);
    } catch (error) {
      setTitleError(error instanceof Error ? error.message : "Topic title could not be saved.");
    } finally {
      setSavingTitle(false);
    }
  };

  return (
    <header className="grid min-w-0 max-w-full gap-3">
      <div className="flex min-w-0 items-center gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Topic</p>
          {editingTitle ? (
            <form
              className="mt-1 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(event) => {
                void handleTitleSubmit(event);
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">Topic title</span>
                <Input
                  className={`${field} min-h-11 text-base font-semibold`}
                  onChange={(event) => setDraftTitle(event.currentTarget.value)}
                  value={draftTitle}
                />
              </label>
              <div className="flex gap-2">
                <button
                  aria-label="Save topic title"
                  className={`${button.secondary} min-h-10 px-3`}
                  disabled={savingTitle || !draftTitle.trim()}
                  type="submit"
                >
                  <Save size={14} />
                </button>
                <button
                  aria-label="Cancel topic title edit"
                  className={`${button.ghost} min-h-10 px-3`}
                  disabled={savingTitle}
                  onClick={() => {
                    setDraftTitle(topic.title);
                    setEditingTitle(false);
                  }}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 break-words text-2xl font-bold leading-tight">
                {topic.title}
              </h1>
              {onTopicTitleChange ? (
                <button
                  aria-label={`Rename ${topic.title}`}
                  className={`${button.ghost} size-8 shrink-0 px-0`}
                  onClick={() => {
                    setDraftTitle(topic.title);
                    setEditingTitle(true);
                  }}
                  title="Rename topic"
                  type="button"
                >
                  <Pencil size={14} />
                </button>
              ) : null}
            </div>
          )}
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <StatusPill status={topicStatus(topic)} />
            <DueBadge count={topic.dueReviewCount} />
          </div>
          {titleError ? <p className="mt-2 text-sm font-medium text-danger">{titleError}</p> : null}
        </div>
      </div>
      <TopicNav route={route} topic={topic} />
    </header>
  );
}

function isTabActive(route: Route, name: string) {
  return route.name === name || (name === "topic-lessons" && route.name === "topic-lesson");
}

export function TopicNav({ route, topic }: { route: Route; topic: TopicSummary }) {
  // Progressive disclosure, ordered by the teach-skill learning flow:
  // mission (Overview) -> lessons -> practice -> tutor memory -> resources.
  // Tutor chat lives beside lesson content so questions stay tied to the active lesson.
  const items = [
    { label: "Overview", name: "topic", href: topicPath(topic), icon: HomeIcon, show: true },
    {
      label: "Lessons",
      name: "topic-lessons",
      href: topicPath(topic, "lessons"),
      icon: BookOpenIcon,
      show: true
    },
    {
      label: "Practice",
      name: "topic-review",
      href: topicPath(topic, "review"),
      icon: ZapIcon,
      show: topic.reviewItemCount > 0
    },
    {
      label: "Tutor memory",
      name: "topic-records",
      href: topicPath(topic, "records"),
      icon: FileTextIcon,
      show: topic.recordCount > 0
    },
    {
      label: "Library",
      name: "topic-resources",
      href: topicPath(topic, "resources"),
      icon: LibraryIcon,
      show: topic.resourceCount > 0 || topic.referenceCount > 0
    }
  ] as const;
  // Keep a hidden tab visible while its route is active so deep links never strand the user.
  const visibleItems = items.filter((item) => item.show || isTabActive(route, item.name));

  return (
    <nav
      aria-label="Topic"
      className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-border bg-card/35 p-1.5 backdrop-blur-xl"
    >
      <div className="flex w-max min-w-full gap-1.5">
        {visibleItems.map((item) => {
          const active = isTabActive(route, item.name);
          const ItemIcon = item.icon;

          return (
            <a
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3.5 text-[13px] font-bold uppercase transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
                active
                  ? "border-primary/35 bg-primary-soft/60 text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary/55 hover:text-foreground"
              }`}
              href={item.href}
              key={item.href}
            >
              <ItemIcon className={active ? "text-primary" : undefined} size={16} />
              {item.label}
              {item.name === "topic-review" && topic.dueReviewCount ? (
                <DueBadge className="ml-0.5" compact count={topic.dueReviewCount} />
              ) : null}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
