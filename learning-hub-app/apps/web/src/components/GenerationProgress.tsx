import type { LessonGenerationStatus, ToolActivity } from "../lib.js";

interface GenerationPhase {
  fraction: number;
  label: string;
  names: readonly string[];
}

// Generation is agentic, so exact step counts are unknowable up front. The bar
// advances through the tutor's known phases instead, driven by which tools run.
const phases: readonly GenerationPhase[] = [
  {
    fraction: 0.15,
    label: "Reading your mission and workspace",
    names: ["list_workspace", "read_workspace_file"]
  },
  { fraction: 0.45, label: "Researching sources", names: ["fetch_url", "web_search"] },
  { fraction: 0.75, label: "Writing the lesson", names: ["write_lesson"] },
  { fraction: 0.85, label: "Saving the lesson file", names: ["lesson"] },
  {
    fraction: 0.95,
    label: "Saving learning records and references",
    names: [
      "write_learning_record",
      "record",
      "write_reference",
      "reference",
      "update_notes",
      "append_resource"
    ]
  }
];

function progressFor(activities: ToolActivity[], status: LessonGenerationStatus) {
  if (status === "done") {
    return { fraction: 1, label: "Lesson ready." };
  }

  let fraction = 0.05;
  let label = "Starting the tutor";

  for (const activity of activities) {
    const phase = phases.find((candidate) => candidate.names.includes(activity.name));
    if (phase && phase.fraction >= fraction) {
      fraction = phase.fraction;
      label = phase.label;
    }
  }

  return { fraction, label };
}

export function GenerationProgress({
  activities,
  status
}: {
  activities: ToolActivity[];
  status: LessonGenerationStatus;
}) {
  if (status === "idle") {
    return null;
  }

  const { fraction, label } = progressFor(activities, status);
  const percent = Math.round(fraction * 100);
  const running = [...activities].reverse().find((activity) => activity.status === "running");
  const detail =
    status === "done"
      ? label
      : running && running.label !== label
        ? `${label} / ${running.label}`
        : label;
  const streaming = status === "streaming";

  return (
    <div className="grid gap-1.5">
      <div
        aria-label="Lesson generation progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-secondary/70"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex min-h-5 items-center gap-2">
        {streaming ? (
          <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
        ) : null}
        <p aria-live="polite" className="text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}
