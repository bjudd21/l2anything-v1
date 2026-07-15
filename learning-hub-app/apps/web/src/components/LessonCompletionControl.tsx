import type { LessonStatus, LessonSummary } from "@learning-hub/shared";
import { CheckCircle2, CircleDashed } from "lucide-react";

export function LessonCompletionControl({
  className = "",
  lesson,
  onStatusChange,
  topicId
}: {
  className?: string;
  lesson: Pick<LessonSummary, "number" | "status" | "title">;
  onStatusChange: (topicId: number, lessonNumber: number, status: LessonStatus) => void;
  topicId: number;
}) {
  if (lesson.status === "completed") {
    return (
      <button
        aria-label={`Mark ${lesson.title} in progress`}
        aria-pressed="true"
        className={`inline-flex h-8 min-h-8 items-center justify-center gap-1.5 rounded-md border border-success/35 bg-success-soft/55 px-2.5 text-xs font-semibold text-success shadow-sm transition-colors hover:bg-success-soft/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px ${className}`}
        onClick={() => onStatusChange(topicId, lesson.number, "in_progress")}
        title="Mark in progress"
        type="button"
      >
        <CheckCircle2 aria-hidden="true" size={13} />
        Completed
      </button>
    );
  }

  return (
    <button
      aria-label={`Mark ${lesson.title} complete`}
      aria-pressed="false"
      className={`inline-flex h-8 min-h-8 items-center justify-center gap-1.5 rounded-md border border-dashed border-border/90 bg-secondary/35 px-2.5 text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:border-primary/45 hover:bg-primary-soft/35 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px ${className}`}
      onClick={() => onStatusChange(topicId, lesson.number, "completed")}
      title="Click to mark complete"
      type="button"
    >
      <CircleDashed aria-hidden="true" size={13} />
      Not done
    </button>
  );
}
