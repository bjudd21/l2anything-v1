import type { LessonSummary, TopicSummary } from "@learning-hub/shared";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { ChatSurface } from "./ChatSurface.js";
import { button } from "./ui.js";
import type { ArtifactCreatedEvent } from "../lib.js";

export function LessonTutorSheet({
  lesson,
  onArtifactCreated,
  topic
}: {
  lesson: LessonSummary;
  onArtifactCreated: (event: ArtifactCreatedEvent) => void;
  topic: TopicSummary;
}) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <Sheet
      modal={false}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setHasOpened(true);
        }
      }}
      open={open}
    >
      <SheetTrigger asChild>
        <button
          className={`${button.secondary} fixed bottom-5 right-5 z-40 min-h-11 border-border bg-card/95 px-4 shadow-xl backdrop-blur-xl`}
          type="button"
        >
          <MessageCircle size={16} />
          Ask Tutor
        </button>
      </SheetTrigger>
      <SheetContent
        className="w-[min(100vw,34rem)] max-w-full gap-0 border-border bg-background/96 p-0 sm:max-w-[34rem]"
        forceMount
        showOverlay={false}
        side="right"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Lesson tutor</SheetTitle>
          <SheetDescription>Ask for help with the current lesson.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 p-4 pt-12">
          {hasOpened ? (
            <ChatSurface
              active={open}
              compact
              lesson={lesson}
              onArtifactCreated={onArtifactCreated}
              topic={topic}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
