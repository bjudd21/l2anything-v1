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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
  onDeleteTopicGroup: (groupId: number) => Promise<void>;
  onTopicGroupChange: (topicId: number, groupId: number | null) => Promise<void>;
  onTopicGroupCollapseChange: (groupId: number, collapsed: boolean) => Promise<void>;
  onTopicGroupRename: (groupId: number, name: string) => Promise<void>;
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
    `grid size-7 shrink-0 place-items-center rounded-md border active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${sidebarFocus}`,
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

function TopicGroupEditorDialog({
  initialName = "",
  mode,
  onOpenChange,
  onSubmit,
  open
}: {
  initialName?: string;
  mode: "create" | "rename";
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
  open: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(undefined);
    }
  }, [initialName, open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextName = name.trim();
    if (!nextName || saving) {
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      await onSubmit(nextName);
      onOpenChange(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : `Topic group could not be ${mode === "create" ? "created" : "renamed"}.`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!saving) {
          onOpenChange(nextOpen);
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Create topic group" : "Rename group"}</DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Create an optional section for organizing related topics."
                : "Choose a clear name for this group."}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">Group name</span>
            <Input
              autoFocus
              maxLength={80}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="For example, Work"
              value={name}
            />
          </label>
          {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={saving} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={saving || !name.trim()} type="submit">
              {mode === "create" ? <FolderPlus size={14} /> : <Pencil size={14} />}
              {saving
                ? mode === "create"
                  ? "Creating..."
                  : "Saving..."
                : mode === "create"
                  ? "Create group"
                  : "Save name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTopicGroupDialog({
  group,
  onDelete,
  onOpenChange,
  open
}: {
  group: TopicGroup;
  onDelete: (groupId: number) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (open) {
      setError(undefined);
    }
  }, [open]);

  const handleDelete = async () => {
    if (deleting) {
      return;
    }

    setDeleting(true);
    setError(undefined);

    try {
      await onDelete(group.id);
      onOpenChange(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Topic group could not be deleted."
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!deleting) {
          onOpenChange(nextOpen);
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {group.name}?</DialogTitle>
          <DialogDescription>
            Topics in this group will move to Ungrouped. No topics, lessons, or files will be
            deleted.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button disabled={deleting} type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={deleting}
            onClick={() => {
              void handleDelete();
            }}
            type="button"
            variant="destructive"
          >
            <Trash2 size={14} />
            {deleting ? "Deleting..." : "Delete group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
    setSaving(true);
    setError(undefined);

    try {
      await onDeleteTopic(topic.id, topic.slug);
      setConfirmingDelete(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Topic could not be deleted.");
    } finally {
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
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil size={14} />
                  Rename
                </DropdownMenuItem>
                {groups.length ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Move to</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      onValueChange={(value) => {
                        void handleGroupChange(value === "ungrouped" ? "" : value);
                      }}
                      value={topic.groupId === null ? "ungrouped" : String(topic.groupId)}
                    >
                      <DropdownMenuRadioItem disabled={saving} value="ungrouped">
                        Ungrouped
                      </DropdownMenuRadioItem>
                      {groups.map((group) => (
                        <DropdownMenuRadioItem
                          disabled={saving}
                          key={group.id}
                          value={String(group.id)}
                        >
                          <span className="truncate">{group.name}</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={saving}
                  onSelect={() => setConfirmingDelete(true)}
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
      <Dialog
        onOpenChange={(nextOpen) => {
          if (!saving) {
            setConfirmingDelete(nextOpen);
          }
        }}
        open={confirmingDelete}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {topic.title}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the topic and its lessons, tutor memory, resources, and
              local files.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={saving} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={saving}
              onClick={() => {
                void handleDelete();
              }}
              type="button"
              variant="destructive"
            >
              <Trash2 size={14} />
              {saving ? "Deleting..." : "Delete topic"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function TopicGroupSection({
  activeSlug,
  availableTopics,
  group,
  groups,
  onDeleteTopic,
  onDeleteTopicGroup,
  onTopicGroupChange,
  onTopicGroupCollapseChange,
  onTopicGroupRename,
  onTopicTitleChange,
  topics
}: {
  activeSlug: string | null;
  availableTopics: TopicSummary[];
  group: TopicGroup;
  groups: TopicGroup[];
  onDeleteTopic: (topicId: number, slug: string) => Promise<void>;
  onDeleteTopicGroup: (groupId: number) => Promise<void>;
  onTopicGroupChange: (topicId: number, groupId: number | null) => Promise<void>;
  onTopicGroupCollapseChange: (groupId: number, collapsed: boolean) => Promise<void>;
  onTopicGroupRename: (groupId: number, name: string) => Promise<void>;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  topics: TopicSummary[];
}) {
  const [assigningTopicId, setAssigningTopicId] = useState<number>();
  const [error, setError] = useState<string>();
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleAddTopic = async (topic: TopicSummary) => {
    if (assigningTopicId !== undefined) {
      return;
    }

    setAssigningTopicId(topic.id);
    setError(undefined);

    try {
      await onTopicGroupChange(topic.id, group.id);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Topic could not be added.");
    } finally {
      setAssigningTopicId(undefined);
    }
  };

  return (
    <section className="grid gap-1">
      <div className="flex min-w-0 items-center gap-1">
        <button
          aria-expanded={!group.collapsed}
          className={`flex min-h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left text-[12px] font-semibold text-sidebar-muted hover:bg-sidebar-accent/40 hover:text-sidebar-foreground active:translate-y-px ${sidebarFocus}`}
          onClick={() => {
            void onTopicGroupCollapseChange(group.id, !group.collapsed).catch(() => undefined);
          }}
          type="button"
        >
          {group.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span className="min-w-0 flex-1 truncate">{group.name}</span>
          <span className="tnum shrink-0 text-[11px] font-medium opacity-70">{topics.length}</span>
        </button>
        {availableTopics.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Add topic to ${group.name}`}
                className={iconButtonClass()}
                disabled={assigningTopicId !== undefined}
                title={`Add topic to ${group.name}`}
                type="button"
              >
                <PlusIcon size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Add topic</DropdownMenuLabel>
              {availableTopics.map((topic) => (
                <DropdownMenuItem
                  disabled={assigningTopicId !== undefined}
                  key={topic.id}
                  onSelect={() => {
                    void handleAddTopic(topic);
                  }}
                >
                  <span className="max-w-52 truncate">{topic.title}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Group actions for ${group.name}`}
              className={iconButtonClass()}
              title="Group actions"
              type="button"
            >
              <MoreHorizontal size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil size={14} />
              Rename group
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setConfirmingDelete(true)}
              variant="destructive"
            >
              <Trash2 size={14} />
              Delete group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
              No topics in this group yet.
            </p>
          )}
        </div>
      ) : null}
      {error ? <p className="px-1.5 text-xs font-medium text-danger">{error}</p> : null}
      <TopicGroupEditorDialog
        initialName={group.name}
        mode="rename"
        onOpenChange={setRenaming}
        onSubmit={(name) => onTopicGroupRename(group.id, name)}
        open={renaming}
      />
      <DeleteTopicGroupDialog
        group={group}
        onDelete={onDeleteTopicGroup}
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
      />
    </section>
  );
}
export function SidebarContent({
  awsStatus,
  onCommandOpen,
  onCreateTopicGroup,
  onDeleteTopic,
  onDeleteTopicGroup,
  onTopicGroupChange,
  onTopicGroupCollapseChange,
  onTopicGroupRename,
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
        <span className="truncate text-[15px] font-bold text-sidebar-foreground">L2Anything</span>
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
              className={iconButtonClass()}
              disabled={topicsLoading}
              onClick={() => setCreatingGroup(true)}
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
          <TopicGroupEditorDialog
            mode="create"
            onOpenChange={setCreatingGroup}
            onSubmit={onCreateTopicGroup}
            open
          />
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {topicsLoading ? (
            <SidebarSkeleton />
          ) : allTopics.length || groups.length ? (
            <div className="grid min-w-0 gap-2">
              {groups.map((group) => {
                const groupTopics = allTopics.filter((topic) => topic.groupId === group.id);

                return (
                  <TopicGroupSection
                    activeSlug={activeSlug}
                    availableTopics={ungroupedTopics}
                    group={group}
                    groups={groups}
                    key={group.id}
                    onDeleteTopic={onDeleteTopic}
                    onDeleteTopicGroup={onDeleteTopicGroup}
                    onTopicGroupChange={onTopicGroupChange}
                    onTopicGroupCollapseChange={onTopicGroupCollapseChange}
                    onTopicGroupRename={onTopicGroupRename}
                    onTopicTitleChange={onTopicTitleChange}
                    topics={groupTopics}
                  />
                );
              })}
              {ungroupedTopics.length || !groups.length ? (
                <section className="grid gap-1">
                  {groups.length ? (
                    <div className="flex min-h-8 items-center gap-2 px-1.5 text-[11px] font-semibold text-sidebar-muted">
                      <span className="min-w-0 flex-1 truncate">Ungrouped</span>
                      <span className="tnum shrink-0 font-medium opacity-70">
                        {ungroupedTopics.length}
                      </span>
                    </div>
                  ) : null}
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
          <span className="truncate text-[15px] font-bold">L2Anything</span>
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
  onDeleteTopicGroup,
  onTopicGroupChange,
  onTopicGroupCollapseChange,
  onTopicGroupRename,
  onTopicTitleChange,
  open,
  route,
  topics,
  topicsLoading
}: SidebarProps & {
  onClose: () => void;
  open: boolean;
}) {
  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent
        className="w-[min(21rem,calc(100vw-2rem))] max-w-full gap-0 border-sidebar-border bg-sidebar/95 p-0 text-sidebar-foreground"
        id="mobile-sidebar-sheet"
        showCloseButton={false}
        side="left"
      >
        <SheetHeader className="min-h-14 flex-row items-center justify-between gap-3 border-b border-sidebar-border px-4 py-2">
          <div className="min-w-0">
            <SheetTitle className="truncate text-sm">Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Open topics, settings, and learning tools.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <button
              aria-label="Close navigation"
              className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-sidebar-border px-3 text-[13px] font-medium hover:bg-sidebar-accent active:translate-y-px ${sidebarFocus}`}
              type="button"
            >
              <XIcon size={15} />
              Close
            </button>
          </SheetClose>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <SidebarContent
            awsStatus={awsStatus}
            onCommandOpen={onCommandOpen}
            onCreateTopicGroup={onCreateTopicGroup}
            onDeleteTopic={onDeleteTopic}
            onDeleteTopicGroup={onDeleteTopicGroup}
            onTopicGroupChange={onTopicGroupChange}
            onTopicGroupCollapseChange={onTopicGroupCollapseChange}
            onTopicGroupRename={onTopicGroupRename}
            onTopicTitleChange={onTopicTitleChange}
            route={route}
            topics={topics}
            topicsLoading={topicsLoading}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
