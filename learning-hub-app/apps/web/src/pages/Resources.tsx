import type { TopicReferenceResponse, TopicSummary } from "@learning-hub/shared";
import { BookMarked, BookOpen, Library } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { ExternalLinkIcon } from "../components/icons.js";
import { MarkdownView } from "../components/markdown.js";
import { TopicHeader } from "../components/TopicHeader.js";
import {
  Button,
  card,
  InlineNotice,
  PageSkeleton,
  Select,
  SectionHeader,
  StatusCard
} from "../components/ui.js";
import { referenceFileUrl, topicPath, type Route } from "../lib.js";

function trimBlankEdges(lines: string[]) {
  const next = [...lines];

  while (next[0]?.trim() === "") {
    next.shift();
  }

  while (next.at(-1)?.trim() === "") {
    next.pop();
  }

  return next;
}

function compactResourceMarkdown(markdown: string | null | undefined) {
  if (!markdown) {
    return undefined;
  }

  const sections: Array<{ heading: string | null; lines: string[] }> = [];
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] };

  for (const line of markdown.split(/\r?\n/)) {
    if (line.trim().startsWith("# ")) {
      continue;
    }

    if (/^##\s+/.test(line)) {
      sections.push(current);
      current = { heading: line, lines: [] };
      continue;
    }

    if (/trusted resources have not been curated yet\./i.test(line)) {
      continue;
    }

    current.lines.push(line);
  }

  sections.push(current);

  return sections
    .map((section) => ({
      ...section,
      lines: trimBlankEdges(section.lines)
    }))
    .filter((section) => section.heading || section.lines.length)
    .filter((section) => section.lines.some((line) => line.trim()))
    .map((section) => [section.heading, ...section.lines].filter(Boolean).join("\n"))
    .join("\n\n")
    .trim();
}

export function ResourcesPage({
  loading,
  onTopicTitleChange,
  reference,
  route,
  topic
}: {
  loading: boolean;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  reference?: TopicReferenceResponse;
  route: Route;
  topic?: TopicSummary;
}) {
  const [selectedFileName, setSelectedFileName] = useState<string>();

  if (!topic) {
    return (
      <InlineNotice tone="error" title="Topic not found" body="The requested topic is not indexed." />
    );
  }

  const referenceDocs = reference?.references ?? [];
  const selectedReference =
    referenceDocs.find((doc) => doc.fileName === selectedFileName) ?? referenceDocs[0];
  const curatedResourceCount = topic.resourceCount;
  const referenceCount = referenceDocs.length || topic.referenceCount;
  const hasCuratedResources = curatedResourceCount > 0;
  const hasReferenceDocs = referenceCount > 0;
  const resourceMarkdown = compactResourceMarkdown(reference?.resources);

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-5">
      <TopicHeader onTopicTitleChange={onTopicTitleChange} route={route} topic={topic} />
      {loading && !reference ? <PageSkeleton /> : null}

      {!loading || reference ? (
        !hasCuratedResources && !hasReferenceDocs ? (
          <StatusCard className="grid justify-items-center gap-3 px-6 py-10 text-center" tone="neutral">
            <div className="grid size-10 place-items-center rounded-md border border-primary/25 bg-primary-soft/55 text-primary">
              <Library size={18} />
            </div>
            <h2 className="text-base font-bold text-foreground">No study materials yet</h2>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Reusable guides and trusted sources will collect here as you complete lessons.
            </p>
            <Button asChild>
              <a href={topicPath(topic, "lessons")}>
                <BookOpen size={14} />
                Open lessons
              </a>
            </Button>
          </StatusCard>
        ) : (
          <section className="grid gap-4">
            <header className="flex min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <SectionHeader
                  icon={<Library size={16} />}
                  title="Study library"
                  tone="neutral"
                />
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Reusable guides for reviewing the ideas and vocabulary from your lessons.
                </p>
              </div>

              {hasCuratedResources ? (
                <Sheet>
                  <SheetTrigger asChild>
                    <Button className="w-full sm:w-auto" variant="secondary">
                      <BookMarked size={14} />
                      View sources
                      <span className="tnum text-xs text-muted-foreground">
                        {curatedResourceCount}
                      </span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    className="w-[min(100vw,38rem)] max-w-full gap-0 border-border bg-background/96 p-0 sm:max-w-[38rem]"
                    side="right"
                  >
                    <SheetHeader className="border-b border-border px-5 py-4 pr-12">
                      <SheetTitle>Lesson sources</SheetTitle>
                      <SheetDescription>
                        Trusted material used to ground this topic&apos;s lessons and study guides.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto p-5">
                      <MarkdownView content={resourceMarkdown} empty="No sources saved yet." />
                    </div>
                  </SheetContent>
                </Sheet>
              ) : null}
            </header>

            {selectedReference ? (
              <article className={`${card} min-w-0 overflow-hidden`}>
                <div className="flex min-w-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Study guide
                    </p>
                    <h2 className="truncate text-base font-bold text-foreground">
                      {selectedReference.title}
                    </h2>
                  </div>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                    {referenceDocs.length > 1 ? (
                      <Select
                        aria-label="Choose a study guide"
                        className="sm:w-72"
                        onChange={(event) => setSelectedFileName(event.currentTarget.value)}
                        value={selectedReference.fileName}
                      >
                        {referenceDocs.map((doc) => (
                          <option key={doc.fileName} value={doc.fileName}>
                            {doc.title}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                    <Button asChild size="sm" variant="secondary">
                      <a
                        href={referenceFileUrl(topic.id, selectedReference.fileName)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLinkIcon size={13} />
                        Open separately
                      </a>
                    </Button>
                  </div>
                </div>
                <iframe
                  className="h-[min(72dvh,56rem)] min-h-[36rem] w-full border-t border-border bg-background"
                  loading="lazy"
                  sandbox="allow-scripts"
                  src={referenceFileUrl(topic.id, selectedReference.fileName)}
                  title={selectedReference.title}
                />
              </article>
            ) : (
              <StatusCard className="grid justify-items-center gap-3 px-6 py-10 text-center" tone="neutral">
                <div className="grid size-10 place-items-center rounded-md border border-border bg-secondary/55 text-muted-foreground">
                  <Library size={18} />
                </div>
                <h2 className="text-base font-bold text-foreground">No study guides yet</h2>
                <p className="max-w-md text-sm leading-6 text-muted-foreground">
                  Trusted sources are available now. A reusable guide will appear when a lesson
                  creates one.
                </p>
              </StatusCard>
            )}
          </section>
        )
      ) : null}
    </div>
  );
}
