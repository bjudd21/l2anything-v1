import type { TopicSummary } from "@learning-hub/shared";
import { MessageCircle } from "lucide-react";
import { ChatSurface } from "../components/ChatSurface.js";
import { TopicHeader } from "../components/TopicHeader.js";
import { InlineNotice, SectionHeader } from "../components/ui.js";
import type { ArtifactCreatedEvent, Route } from "../lib.js";

export function TopicChatPage({
  onArtifactCreated,
  onTopicTitleChange,
  route,
  topic
}: {
  onArtifactCreated: (event: ArtifactCreatedEvent) => void;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  route: Route;
  topic?: TopicSummary;
}) {
  if (!topic) {
    return (
      <InlineNotice tone="error" title="Topic not found" body="The requested topic is not indexed." />
    );
  }

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-5xl gap-6">
      <TopicHeader onTopicTitleChange={onTopicTitleChange} route={route} topic={topic} />
      <SectionHeader icon={<MessageCircle size={16} />} title="Tutor chat" />
      <ChatSurface onArtifactCreated={onArtifactCreated} topic={topic} />
    </div>
  );
}
