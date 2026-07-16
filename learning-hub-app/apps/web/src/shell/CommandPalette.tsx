import type { TopicLessonsResponse, TopicsResponse } from "@learning-hub/shared";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { lessonRoute, statusLabel, topicPath } from "../lib.js";

interface PaletteCommand {
  href: string;
  label: string;
  meta: string;
}

function CommandRow({ command, onPick }: { command: PaletteCommand; onPick: (href: string) => void }) {
  return (
    <CommandItem
      className="grid min-h-11 gap-0.5"
      onSelect={() => onPick(command.href)}
      value={`${command.label} ${command.meta} ${command.href}`}
    >
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{command.label}</span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">{command.meta}</span>
    </CommandItem>
  );
}

export function CommandPalette({
  onClose,
  onNavigate,
  open,
  topicLessons,
  topics
}: {
  onClose: () => void;
  onNavigate: (path: string) => void;
  open: boolean;
  topicLessons: Record<number, TopicLessonsResponse>;
  topics?: TopicsResponse;
}) {
  const topicCommands: PaletteCommand[] =
    topics?.topics.map((topic) => ({
      href: topicPath(topic),
      label: topic.title,
      meta: "Topic"
    })) ?? [];
  const lessonCommands: PaletteCommand[] =
    topics?.topics.flatMap((topic) =>
      (topicLessons[topic.id]?.lessons ?? []).map((lesson) => ({
        href: lessonRoute(topic, lesson),
        label: lesson.title,
        meta: `${topic.title} / ${statusLabel(lesson.status)}`
      }))
    ) ?? [];

  const pick = (href: string) => {
    onNavigate(href);
    onClose();
  };

  return (
    <CommandDialog
      description="Search your topics and lessons, then press Enter to jump there."
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
      showCloseButton={false}
      title="Jump to a topic or lesson"
    >
      <CommandInput aria-label="Jump to a topic or lesson" placeholder="Jump to a topic or lesson" />
      <CommandList>
        <CommandEmpty>No topics or lessons match that search.</CommandEmpty>
        {topicCommands.length ? (
          <CommandGroup heading="Topics">
            {topicCommands.map((command) => (
              <CommandRow command={command} key={command.href} onPick={pick} />
            ))}
          </CommandGroup>
        ) : null}
        {lessonCommands.length ? (
          <CommandGroup heading="Lessons">
            {lessonCommands.map((command) => (
              <CommandRow command={command} key={command.href} onPick={pick} />
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
