import type { LessonSummary } from "@learning-hub/shared";
import { CalendarDays, X } from "lucide-react";
import { useRef, useState } from "react";
import { formatDueDate, lessonDueText, todayDateValue } from "../lib.js";
import { button, field } from "./ui.js";

export function openDatePicker(input: HTMLInputElement | null) {
  if (!input) {
    return;
  }

  if (typeof input.showPicker === "function") {
    try {
      input.showPicker();
      return;
    } catch {
      // Fall back for browsers that expose showPicker but reject the call.
    }
  }

  input.focus();
  input.click();
}

export function LessonDueDateControl({
  className = "",
  compact = false,
  lesson,
  minimal = false,
  onLessonDueDateChange,
  topicId
}: {
  className?: string;
  compact?: boolean;
  lesson: LessonSummary;
  minimal?: boolean;
  onLessonDueDateChange: (
    topicId: number,
    lessonNumber: number,
    dueAt: string | null
  ) => Promise<void>;
  topicId: number;
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const saveDueDate = async (dueAt: string | null) => {
    if (saving || dueAt === lesson.dueAt) {
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      await onLessonDueDateChange(topicId, lesson.number, dueAt);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Finish date could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (minimal) {
    const dateState =
      lesson.dueAt && lesson.status !== "completed" && lesson.dueAt <= todayDateValue()
        ? "text-warning"
        : lesson.dueAt
          ? "text-foreground"
          : "text-muted-foreground";
    const label = saving ? "Saving" : lesson.dueAt ? formatDueDate(lesson.dueAt) : "Finish date";

    return (
      <div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
        <span className="relative inline-flex min-w-0 max-w-full">
          <button
            aria-label={`Set finish date for ${lesson.title}`}
            className={`inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-card/38 px-2.5 text-xs font-semibold shadow-none transition-colors hover:bg-secondary/65 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 ${
              saving ? "opacity-70" : ""
            }`}
            disabled={saving}
            onClick={() => openDatePicker(dateInputRef.current)}
            title={lessonDueText(lesson)}
            type="button"
          >
            <CalendarDays aria-hidden="true" className={`shrink-0 ${dateState}`} size={13} />
            <span className={`min-w-0 truncate ${dateState}`}>{label}</span>
          </button>
          <input
            aria-label={`Finish ${lesson.title} by`}
            className="pointer-events-none absolute bottom-0 left-1/2 size-px opacity-0"
            disabled={saving}
            onChange={(event) => {
              void saveDueDate(event.currentTarget.value || null);
            }}
            ref={dateInputRef}
            tabIndex={-1}
            type="date"
            value={lesson.dueAt ?? ""}
          />
        </span>
        {lesson.dueAt ? (
          <button
            aria-label={`Clear finish date for ${lesson.title}`}
            className={`${button.ghost} size-8 px-0`}
            disabled={saving}
            onClick={() => {
              void saveDueDate(null);
            }}
            title={`Clear ${formatDueDate(lesson.dueAt)}`}
            type="button"
          >
            <X size={13} />
          </button>
        ) : null}
        {error ? <span className="text-xs font-medium text-danger">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className={`grid min-w-0 gap-1.5 ${className}`}>
      <label className="grid min-w-0 gap-1 text-sm">
        <span className="font-medium text-foreground">Finish by</span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="relative min-w-0 flex-1">
            <CalendarDays
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={14}
            />
            <input
              aria-label={`Finish ${lesson.title} by`}
              className={`${field} ${compact ? "min-h-9 text-xs" : ""} pl-9`}
              disabled={saving}
              onChange={(event) => {
                void saveDueDate(event.currentTarget.value || null);
              }}
              type="date"
              value={lesson.dueAt ?? ""}
            />
          </span>
          {lesson.dueAt ? (
            <button
              aria-label={`Clear finish date for ${lesson.title}`}
              className={`${button.ghost} min-h-9 px-2.5`}
              disabled={saving}
              onClick={() => {
                void saveDueDate(null);
              }}
              title={`Clear ${formatDueDate(lesson.dueAt)}`}
              type="button"
            >
              <X size={14} />
            </button>
          ) : null}
        </span>
      </label>
      <p
        className={`text-xs font-medium ${
          lesson.dueAt && lesson.status !== "completed" && lesson.dueAt <= todayDateValue()
            ? "text-warning"
            : "text-muted-foreground"
        }`}
      >
        {saving ? "Saving finish date" : lessonDueText(lesson)}
      </p>
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}
