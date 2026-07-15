import type {
  AwsStatusResponse,
  TopicGroup,
  TopicSummary,
  TopicsResponse
} from "@learning-hub/shared";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Save,
  Trash2,
  X
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  GraduationCapIcon,
  HomeIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  XIcon
} from "../components/icons.js";
import {
  DueBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "../components/ui.js";
import { awsStatusText, formatStudiedAt, routeSlug, topicPath, type Route } from "../lib.js";

export function StatusDot({ status }: { status: AwsStatusResponse | undefined }) {
  const tone = status?.ok
    ? "bg-success shadow-sm shadow-success/60"
    : status
      ? "bg-warning shadow-sm shadow-warning/45"
      : "bg-sidebar-muted";

  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${tone}`} />;
}

export interface SidebarProps {
  awsStatus?: AwsStatusResponse;
  onCommandOpen: () => void;
  onCreateTopicGroup: (name: string) => Promise<void>;
  onDeleteTopic: (topicId: number, slug: string) => Promise<void>;
  onTopicGroupChange: (topicId: number, groupId: number | null) => Promise<void>;
  onTopicGroupCollapseChange: (groupId: number, collapsed: boolean) => Promise<void>;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  route: Route;
  topics?: TopicsResponse;
  topicsLoading: boolean;
}

const sidebarFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const sidebarField =
  "min-h-9 w-full min-w-0 rounded-md border border-sidebar-border bg-sidebar-accent/35 px-2.5 text-[13px] text-sidebar-foreground outline-none placeholder:text-sidebar-muted disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function iconButtonClass(active = false) {
  return [
    `grid size-7 shrink-0 place-items-center rounded-md border active:translate-y-px ${sidebarFocus}`,
    active
      ? "border-sidebar-border bg-sidebar-accent/70 text-sidebar-foreground"
      : "border-transparent text-sidebar-muted hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
  ].join(" ");
}

function navClass(active: boolean) {
  return [
    `flex min-h-9 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border px-2.5 text-[13px] font-medium active:translate-y-px ${sidebarFocus}`,
    active
      ? "border-primary/30 bg-primary-soft/45 text-sidebar-foreground shadow-lg shadow-primary/15"
      : "border-primary/20 bg-primary-soft/25 text-sidebar-foreground shadow-lg shadow-primary/10 hover:border-primary/35 hover:bg-primary-soft/45"
  ].join(" ");
}

function utilityNavClass(active: boolean) {
  return [
    `flex min-h-10 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border px-2.5 text-[13px] font-semibold active:translate-y-px ${sidebarFocus}`,
    active
      ? "border-primary/45 bg-primary-soft/65 text-sidebar-foreground shadow-lg shadow-primary/20"
      : "border-primary/30 bg-primary-soft/42 text-sidebar-foreground shadow-lg shadow-primary/10 hover:border-primary/45 hover:bg-primary-soft/60"
  ].join(" ");
}

function SidebarSkeleton() {
  return (
    <div className="grid gap-2" aria-hidden="true">
      <div className="h-3 w-3/4 rounded-sm bg-sidebar-accent/70" />
      <div className="h-3 w-1/2 rounded-sm bg-sidebar-accent/70" />
    </div>
  );
}

function TopicGroupForm({
  onCancel,
  onCreateTopicGroup
}: {
  onCancel: () => void;
  onCreateTopicGroup: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextName = name.trim();
    if (!nextName || saving) {
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      await onCreateTopicGroup(nextName);
      setName("");
      onCancel();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Topic group could not be created."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/25 p-2"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <label>
        <span className="sr-only">Topic group name</span>
        <input
          autoFocus
          className={sidebarField}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder="Group name"
          value={name}
        />
      </label>
      <div className="flex items-center justify-end gap-1.5">
        <button
          aria-label="Save topic group"
          className={iconButtonClass(true)}
          disabled={saving || !name.trim()}
          type="submit"
        >
          <Save size={13} />
        </button>
        <button
          aria-label="Cancel topic group"
          className={iconButtonClass()}
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          <X size={13} />
        </button>
      </div>
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
    </form>
  );
}

function TopicRow({
  active,
  groups,
  onDeleteTopic,
  onTopicGroupChange,
  onTopicTitleChange,
  topic
}: {
  active: boolean;
  groups: TopicGroup[];
  onDeleteTopic: (topicId: number, slug: string) => Promise<void>;
  onTopicGroupChange: (topicId: number, groupId: number | null) => Promise<void>;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  topic: TopicSummary;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(topic.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const complete = topic.lessonCount > 0 && topic.completedLessonCount >= topic.lessonCount;
  const studied = formatStudiedAt(topic.lastActiveAt);
  const lessonMeta = topic.lessonCount
    ? `${topic.completedLessonCount} of ${topic.lessonCount} lessons done`
    : "Mission ready";

  useEffect(() => {
    if (!editing) {
      setDraftTitle(topic.title);
    }
  }, [editing, topic.title]);

  const handleTitleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextTitle = draftTitle.trim();
    if (!nextTitle || saving) {
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      await onTopicTitleChange(topic.id, nextTitle);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Topic title could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleGroupChange = async (value: string) => {
    const nextGroupId = value ? Number(value) : null;
    if (nextGroupId === topic.groupId || saving) {
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      await onTopicGroupChange(topic.id, nextGroupId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Topic group could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${topic.title}" and all of its lessons, learning records, and files?`)
    ) {
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      await onDeleteTopic(topic.id, topic.slug);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Topic could not be deleted.");
      setSaving(false);
    }
  };

  return (
    <article
      className={[
        "grid min-w-0 gap-1.5 rounded-lg border px-2.5 py-2 transition-colors duration-150",
        active
          ? "border-primary/35 bg-primary/10 text-sidebar-foreground shadow-sm shadow-primary/10"
          : complete
            ? "sidebar-tile border-sidebar-border/45 bg-sidebar-accent/15 text-sidebar-muted/80 hover:border-sidebar-border hover:bg-sidebar-accent/45 hover:text-sidebar-foreground"
            : "sidebar-tile border-sidebar-border/55 bg-sidebar-accent/25 text-sidebar-muted hover:border-sidebar-border hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      ].join(" ")}
    >
      {editing ? (
        <form
          className="grid min-w-0 gap-1.5"
          onSubmit={(event) => {
            void handleTitleSubmit(event);
          }}
        >
          <label className="min-w-0">
            <span className="sr-only">Topic title</span>
            <input
              autoFocus
              className={`${sidebarField} min-h-8 px-2 text-[12px]`}
              onChange={(event) => setDraftTitle(event.currentTarget.value)}
              value={draftTitle}
            />
          </label>
          <div className="flex items-center justify-end gap-1.5 rounded-md border border-sidebar-border/60 bg-sidebar/30 px-1.5 py-1">
            <button
              aria-label="Save topic title"
              className={iconButtonClass(true)}
              disabled={saving || !draftTitle.trim()}
              type="submit"
            >
              <Save size={13} />
            </button>
            <button
              aria-label="Cancel topic title edit"
              className={iconButtonClass()}
              disabled={saving}
              onClick={() => {
                setDraftTitle(topic.title);
                setEditing(false);
              }}
              type="button"
            >
              <X size={13} />
            </button>
          </div>
        </form>
      ) : (
        <div className="grid min-w-0 gap-1.5">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <a
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 items-start gap-1.5 rounded-sm text-[14px] font-bold leading-5 text-foreground ${complete && !active ? "opacity-70" : ""} ${sidebarFocus}`}
              href={topicPath(topic)}
              title={topic.title}
            >
              {complete ? (
                <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={13} />
              ) : null}
              <span className="min-w-0 truncate">{topic.title}</span>
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Topic actions for ${topic.title}`}
                  className={iconButtonClass()}
                  disabled={saving}
                  title="Topic actions"
                  type="button"
                >
                  <MoreHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil size={14} />
                  Rename
                </DropdownMenuItem>
                {groups.length ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <span>Move to group</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuLabel>Topic group</DropdownMenuLabel>
                      <DropdownMenuItem
                        disabled={saving || topic.groupId === null}
                        onSelect={() => {
                          void handleGroupChange("");
                        }}
                      >
                        No group
                      </DropdownMenuItem>
                      {groups.map((group) => (
                        <DropdownMenuItem
                          disabled={saving || topic.groupId === group.id}
                          key={group.id}
                          onSelect={() => {
                            void handleGroupChange(String(group.id));
                          }}
                        >
                          {group.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={saving}
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
          {topic.dueReviewCount || studied || topic.completedLessonCount > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {topic.dueReviewCount ? (
                <DueBadge className="max-w-full" count={topic.dueReviewCount} />
              ) : null}
              {studied || topic.completedLessonCount > 0 ? (
                <span className="tnum inline-flex min-h-6 min-w-0 items-center gap-1 rounded-full border border-sidebar-border/60 bg-sidebar/30 px-2 text-[11px] font-medium text-sidebar-muted">
                  {studied ? <Clock3 className="shrink-0" size={11} /> : null}
                  <span className="truncate">{studied ?? lessonMeta}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
    </article>
  );
}

function TopicGroupSection({
  activeSlug,
  group,
  groups,
  onDeleteTopic,
  onTopicGroupChange,
  onTopicGroupCollapseChange,
  onTopicTitleChange,
  topics
}: {
  activeSlug: string | null;
  group: TopicGroup;
  groups: TopicGroup[];
  onDeleteTopic: (topicId: number, slug: string) => Promise<void>;
  onTopicGroupChange: (topicId: number, groupId: number | null) => Promise<void>;
  onTopicGroupCollapseChange: (groupId: number, collapsed: boolean) => Promise<void>;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  topics: TopicSummary[];
}) {
  return (
    <section className="grid gap-1">
      <button
        aria-expanded={!group.collapsed}
        className={`flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-[12px] font-semibold text-sidebar-muted hover:bg-sidebar-accent/40 hover:text-sidebar-foreground active:translate-y-px ${sidebarFocus}`}
        onClick={() => {
          void onTopicGroupCollapseChange(group.id, !group.collapsed).catch(() => undefined);
        }}
        type="button"
      >
        {group.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <span className="min-w-0 flex-1 truncate">{group.name}</span>
        <span className="tnum shrink-0 text-[11px] font-medium opacity-70">{topics.length}</span>
      </button>
      {!group.collapsed ? (
        <div className="grid gap-1">
          {topics.length ? (
            topics.map((topic) => (
              <TopicRow
                active={activeSlug === topic.slug}
                groups={groups}
                key={topic.slug}
                onDeleteTopic={onDeleteTopic}
                onTopicGroupChange={onTopicGroupChange}
                onTopicTitleChange={onTopicTitleChange}
                topic={topic}
              />
            ))
          ) : (
            <p className="rounded-md border border-dashed border-sidebar-border bg-sidebar-accent/20 px-2.5 py-2 text-xs leading-5 text-sidebar-muted">
              Empty group.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
export function SidebarContent({
  awsStatus,
  onCommandOpen,
  onCreateTopicGroup,
  onDeleteTopic,
  onTopicGroupChange,
  onTopicGroupCollapseChange,
  onTopicTitleChange,
  route,
  topics,
  topicsLoading
}: SidebarProps) {
  const [creatingGroup, setCreatingGroup] = useState(false);
  const activeSlug = routeSlug(route);
  const allTopics = topics?.topics ?? [];
  const groups = topics?.groups ?? [];
  const groupIds = new Set(groups.map((group) => group.id));
  const ungroupedTopics = allTopics.filter(
    (topic) => topic.groupId === null || !groupIds.has(topic.groupId)
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-4 overflow-hidden p-3">
      <a className={`flex min-w-0 items-center gap-2.5 rounded-lg ${sidebarFocus}`} href="/">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/90 text-primary-foreground shadow-sm shadow-primary/20">
          <GraduationCapIcon size={17} />
        </span>
        <span className="truncate text-[15px] font-bold text-sidebar-foreground">Learning Hub</span>
      </a>

      <button
        className={`flex min-h-9 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border border-sidebar-border bg-sidebar-accent/45 px-2.5 text-[13px] text-sidebar-muted backdrop-blur-xl hover:bg-sidebar-accent/70 hover:text-sidebar-foreground active:translate-y-px lg:hidden ${sidebarFocus}`}
        onClick={onCommandOpen}
        type="button"
      >
        <SearchIcon className="shrink-0" size={14} />
        <span className="min-w-0 flex-1 truncate text-left">Jump to anything</span>
        <kbd className="shrink-0 rounded-sm border border-sidebar-border bg-sidebar/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sidebar-muted">
          Ctrl K
        </kbd>
      </button>

      <nav aria-label="Primary" className="grid min-w-0 gap-1">
        <a
          aria-current={route.name === "dashboard" ? "page" : undefined}
          className={navClass(route.name === "dashboard")}
          href="/"
        >
          <HomeIcon className="shrink-0" size={16} />
          <span className="min-w-0 truncate">Dashboard</span>
        </a>
      </nav>

      <section aria-label="Topics" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase text-sidebar-muted">Topics</span>
          <span className="flex shrink-0 items-center gap-1">
            <button
              aria-label="Create topic group"
              className={iconButtonClass(creatingGroup)}
              onClick={() => setCreatingGroup((open) => !open)}
              title="Create topic group"
              type="button"
            >
              <FolderPlus size={15} />
            </button>
            <a
              aria-label="New topic"
              className={iconButtonClass()}
              href="/topics/new"
              title="New topic"
            >
              <PlusIcon size={15} />
            </a>
          </span>
        </div>

        {creatingGroup ? (
          <TopicGroupForm
            onCancel={() => setCreatingGroup(false)}
            onCreateTopicGroup={onCreateTopicGroup}
          />
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {topicsLoading ? (
            <SidebarSkeleton />
          ) : allTopics.length || groups.length ? (
            <div className="grid min-w-0 gap-2">
              {groups.map((group) => {
                const groupTopics = allTopics.filter((topic) => topic.groupId === group.id);

                return groupTopics.length ? (
                  <TopicGroupSection
                    activeSlug={activeSlug}
                    group={group}
                    groups={groups}
                    key={group.id}
                    onDeleteTopic={onDeleteTopic}
                    onTopicGroupChange={onTopicGroupChange}
                    onTopicGroupCollapseChange={onTopicGroupCollapseChange}
                    onTopicTitleChange={onTopicTitleChange}
                    topics={groupTopics}
                  />
                ) : null;
              })}
              {ungroupedTopics.length || !groups.length ? (
                <section className="grid gap-1">
                  {ungroupedTopics.map((topic) => (
                    <TopicRow
                      active={activeSlug === topic.slug}
                      groups={groups}
                      key={topic.slug}
                      onDeleteTopic={onDeleteTopic}
                      onTopicGroupChange={onTopicGroupChange}
                      onTopicTitleChange={onTopicTitleChange}
                      topic={topic}
                    />
                  ))}
                </section>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-2 rounded-md border border-dashed border-sidebar-border bg-sidebar-accent/25 px-3 py-3">
              <p className="text-sm leading-5 text-sidebar-muted">
                No topics yet. Start with what you want to learn.
              </p>
              <a
                className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-primary/25 bg-primary/90 px-3 text-[13px] font-semibold text-primary-foreground hover:bg-primary-strong active:translate-y-px ${sidebarFocus}`}
                href="/topics/new"
              >
                <PlusIcon size={14} />
                New topic
              </a>
            </div>
          )}
        </div>
      </section>

      <nav aria-label="Utility" className="grid min-w-0 gap-1 border-t border-sidebar-border pt-2">
        <a
          aria-current={route.name === "settings" ? "page" : undefined}
          className={utilityNavClass(route.name === "settings")}
          href="/settings"
        >
          <SettingsIcon className="shrink-0" size={16} />
          <span className="min-w-0 truncate">Settings</span>
        </a>
      </nav>

      <a
        className={`flex min-w-0 items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/25 px-2.5 py-2 text-xs text-sidebar-muted hover:bg-sidebar-accent/55 hover:text-sidebar-foreground ${sidebarFocus}`}
        href="/settings"
        title="AWS connection details in settings"
      >
        <StatusDot status={awsStatus} />
        <span className="min-w-0 truncate">
          {awsStatus?.ok ? "AWS connected" : awsStatusText(awsStatus)}
        </span>
      </a>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="h-full w-full min-w-0 max-w-full border-r border-sidebar-border bg-sidebar/80 text-sidebar-foreground shadow-xl backdrop-blur-2xl">
      <SidebarContent {...props} />
    </aside>
  );
}

export function MobileTopBar({
  awsStatus,
  onMenuOpen,
  open
}: {
  awsStatus?: AwsStatusResponse;
  onMenuOpen: () => void;
  open: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar/85 px-4 py-3 text-sidebar-foreground backdrop-blur-2xl lg:hidden">
      <div className="flex w-full min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden">
        <a className={`flex min-w-0 items-center gap-2.5 rounded-lg ${sidebarFocus}`} href="/">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/90 text-primary-foreground">
            <GraduationCapIcon size={18} />
          </span>
          <span className="truncate text-[15px] font-bold">Learning Hub</span>
        </a>
        <div className="flex shrink-0 items-center gap-2">
          <StatusDot status={awsStatus} />
          <button
            aria-controls="mobile-sidebar-sheet"
            aria-expanded={open}
            aria-label="Open navigation menu"
            className={`grid size-10 shrink-0 place-items-center rounded-md border border-sidebar-border bg-sidebar-accent/35 hover:bg-sidebar-accent/65 active:translate-y-px ${sidebarFocus}`}
            onClick={onMenuOpen}
            type="button"
          >
            <MenuIcon size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

export function MobileSidebarSheet({
  awsStatus,
  onClose,
  onCommandOpen,
  onCreateTopicGroup,
  onDeleteTopic,
  onTopicGroupChange,
  onTopicGroupCollapseChange,
  onTopicTitleChange,
  open,
  route,
  topics,
  topicsLoading
}: SidebarProps & {
  onClose: () => void;
  open: boolean;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden"
      onClick={onClose}
      role="dialog"
    >
      <aside
        aria-label="Mobile navigation"
        className="flex h-full w-[min(21rem,calc(100vw-2rem))] max-w-full flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar/90 text-sidebar-foreground shadow-2xl backdrop-blur-2xl"
        id="mobile-sidebar-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-sidebar-border px-4">
          <span className="truncate text-sm font-semibold">Navigation</span>
          <button
            aria-label="Close navigation"
            autoFocus
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-sidebar-border px-3 text-[13px] font-medium hover:bg-sidebar-accent active:translate-y-px ${sidebarFocus}`}
            onClick={onClose}
            type="button"
          >
            <XIcon size={15} />
            Close
          </button>
        </div>
        <SidebarContent
          awsStatus={awsStatus}
          onCommandOpen={onCommandOpen}
          onCreateTopicGroup={onCreateTopicGroup}
          onDeleteTopic={onDeleteTopic}
          onTopicGroupChange={onTopicGroupChange}
          onTopicGroupCollapseChange={onTopicGroupCollapseChange}
          onTopicTitleChange={onTopicTitleChange}
          route={route}
          topics={topics}
          topicsLoading={topicsLoading}
        />
      </aside>
    </div>
  );
}
