import type { TopicReferenceResponse, TopicSummary } from "@learning-hub/shared";
import { BookOpen, Library } from "lucide-react";
import { ExternalLinkIcon } from "../components/icons.js";
import { MarkdownView } from "../components/markdown.js";
import { TopicHeader } from "../components/TopicHeader.js";
import {
  button,
  card,
  InlineNotice,
  PageSkeleton,
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
  if (!topic) {
    return (
      <InlineNotice tone="error" title="Topic not found" body="The requested topic is not indexed." />
    );
  }

  const firstReference = reference?.references[0];
  const curatedResourceCount = topic.resourceCount;
  const referenceCount = reference?.references.length ?? topic.referenceCount;
  const hasCuratedResources = curatedResourceCount > 0;
  const hasReferenceDocs = referenceCount > 0;
  const resourceMarkdown = compactResourceMarkdown(reference?.resources);

  return (
    <div className="grid w-full min-w-0 max-w-[1400px] gap-5">
      <TopicHeader onTopicTitleChange={onTopicTitleChange} route={route} topic={topic} />
      {loading && !reference ? <PageSkeleton /> : null}

      {!loading || reference ? (
        !hasCuratedResources && !hasReferenceDocs ? (
          <StatusCard className="grid justify-items-center gap-3 px-6 py-10 text-center" tone="neutral">
            <div className="grid size-10 place-items-center rounded-md border border-primary/25 bg-primary-soft/55 text-primary">
              <Library size={18} />
            </div>
            <h2 className="text-base font-bold text-foreground">No resources yet</h2>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Glossaries, trusted sources, and quick reference docs appear here as lessons promote
              reusable knowledge.
            </p>
            <a className={button.primary} href={topicPath(topic, "lessons")}>
              <BookOpen size={14} />
              Open lessons
            </a>
          </StatusCard>
        ) : (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <article className={`${card} p-5`}>
              <SectionHeader
                count={referenceCount}
                icon={<Library size={16} />}
                title="Glossary and reference"
                tone="neutral"
              />
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Reusable glossaries, checklists, tables, and quick study pages built up across your lessons.
              </p>
              {reference?.references.length ? (
                <div className="mt-3 grid gap-1.5">
                  {reference.references.map((doc) => (
                    <a
                      className="group grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border border-border/70 bg-secondary/25 px-3 py-2 text-[13px] hover:bg-secondary/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
                      href={referenceFileUrl(topic.id, doc.fileName)}
                      key={doc.fileName}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLinkIcon className="shrink-0 text-muted-foreground" size={14} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-foreground">
                          {doc.title}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                          {doc.fileName}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground group-hover:text-foreground">
                        Open
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <InlineNotice
                  title="No glossary docs yet"
                  body="Glossaries and quick reference docs appear as the tutor turns lessons into reusable study pages."
                />
              )}
            </article>

            <aside className={`${card} grid h-fit content-start gap-3 p-5`}>
              <SectionHeader
                count={curatedResourceCount}
                icon={<Library size={16} />}
                title="Sources"
                tone="neutral"
              />
              <p className="text-sm leading-6 text-muted-foreground">
                The trusted references your lessons cite from.
              </p>
              {hasCuratedResources ? (
                <MarkdownView content={resourceMarkdown} empty="No sources saved yet." />
              ) : (
                <InlineNotice
                  title="No sources saved yet"
                  body="Lesson citations stay inside each lesson until the tutor promotes one here."
                />
              )}
            </aside>

            {firstReference ? (
              <section className={`${card} overflow-hidden lg:col-span-2`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold">Preview</h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {firstReference.title}
                    </p>
                  </div>
                  <a
                    className={`${button.secondary} min-h-8 px-2.5 text-xs`}
                    href={referenceFileUrl(topic.id, firstReference.fileName)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLinkIcon size={13} />
                    Open
                  </a>
                </div>
                <div className="border-t border-border bg-background/45 p-2">
                  <iframe
                    className="h-[min(62dvh,680px)] min-h-[30rem] w-full rounded-md border border-border bg-background"
                    loading="lazy"
                    sandbox="allow-scripts"
                    src={referenceFileUrl(topic.id, firstReference.fileName)}
                    title={firstReference.title}
                  />
                </div>
              </section>
            ) : null}
          </section>
        )
      ) : null}
    </div>
  );
}
