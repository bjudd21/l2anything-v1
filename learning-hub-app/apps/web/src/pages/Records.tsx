import type { TopicRecordsResponse, TopicSummary } from "@learning-hub/shared";
import { BookOpen, Brain } from "lucide-react";
import { MarkdownView } from "../components/markdown.js";
import { TopicHeader } from "../components/TopicHeader.js";
import {
  Badge,
  button,
  card,
  InlineNotice,
  PageSkeleton,
  SectionHeader,
  StatusCard
} from "../components/ui.js";
import { topicPath, type Route } from "../lib.js";

export function RecordsPage({
  loading,
  onTopicTitleChange,
  records,
  route,
  topic
}: {
  loading: boolean;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  records?: TopicRecordsResponse;
  route: Route;
  topic?: TopicSummary;
}) {
  if (!topic) {
    return (
      <InlineNotice
        tone="error"
        title="Topic not found"
        body="The requested topic is not indexed."
      />
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <TopicHeader onTopicTitleChange={onTopicTitleChange} route={route} topic={topic} />
      <section className="grid gap-4">
        <SectionHeader
          icon={<Brain size={16} />}
          title="Tutor memory"
          tone="neutral"
        />
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          What you already know, where you got stuck, and what should shape your next lesson.
        </p>
        {loading && !records ? <PageSkeleton /> : null}
        {records?.records.length ? (
          <div className="grid gap-4">
            {records.records.map((record) => (
              <article className={`${card} p-5`} key={record.id}>
                <div className="mb-4 border-b border-border pb-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge className="rounded-full normal-case">Used for future lessons</Badge>
                    </div>
                    <h2 className="mt-2 text-lg font-bold text-foreground">
                      {record.title}
                    </h2>
                  </div>
                </div>
                <MarkdownView
                  content={record.content}
                  empty="This memory is empty."
                  omitFirstHeading
                />
              </article>
            ))}
          </div>
        ) : !loading ? (
          <StatusCard className="grid justify-items-center gap-3 px-6 py-10 text-center" tone="neutral">
            <div className="grid size-10 place-items-center rounded-md border border-primary/25 bg-primary-soft/55 text-primary">
              <Brain size={18} />
            </div>
            <h2 className="text-base font-bold text-foreground">No tutor memory yet</h2>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Demonstrated strengths, gaps, and learning preferences will appear here as they
              emerge.
            </p>
            <a className={button.primary} href={topicPath(topic, "lessons")}>
              <BookOpen size={14} />
              Open lessons
            </a>
          </StatusCard>
        ) : null}
      </section>
    </div>
  );
}
