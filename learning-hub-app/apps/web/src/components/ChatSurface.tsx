import type { LessonSummary, TopicSummary } from "@learning-hub/shared";
import {
  ArrowUp,
  Bot,
  CheckCircle2,
  FileText,
  LoaderCircle,
  MessageCircle,
  Sparkles,
  UserRound
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { streamTopicChat } from "../api.js";
import {
  chatErrorText,
  lessonNumberLabel,
  localId,
  type ArtifactCreatedEvent,
  type ChatViewMessage,
  type ToolActivity
} from "../lib.js";
import {
  Bubble,
  BubbleContent,
  Badge,
  Button,
  field,
  InlineNotice,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
  SectionHeader,
  Textarea
} from "./ui.js";

function TypingDots() {
  return (
    <span
      aria-label="Tutor is thinking"
      className="inline-flex items-center gap-1 py-1"
      role="status"
    >
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]" />
    </span>
  );
}

function ChatAvatar({ role }: { role: ChatViewMessage["role"] }) {
  if (role === "user") {
    return (
      <MessageAvatar className="border-primary/30 bg-primary-soft/70 text-primary-strong">
        <UserRound size={15} />
      </MessageAvatar>
    );
  }

  return (
    <MessageAvatar className="border-border bg-card/80 text-primary">
      <Bot size={15} />
    </MessageAvatar>
  );
}

function messageParagraphs(content: string) {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks.length ? blocks : [content];
}

function ChatMessage({ compact, message }: { compact: boolean; message: ChatViewMessage }) {
  const sent = message.role === "user";
  const paragraphs = messageParagraphs(message.content);

  return (
    <Message align={sent ? "end" : "start"}>
      {!sent ? <ChatAvatar role={message.role} /> : null}
      <MessageContent className={compact ? "max-w-[88%]" : undefined}>
        <MessageHeader className={sent ? "justify-end" : undefined}>
          <span>{sent ? "You" : "Tutor"}</span>
          {message.streaming ? (
            <span className="inline-flex items-center gap-1 text-primary-strong">
              <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-primary" />
              Streaming
            </span>
          ) : null}
        </MessageHeader>
        <Bubble
          className={sent ? "rounded-br-sm" : "rounded-bl-sm"}
          variant={sent ? "user" : "assistant"}
        >
          <BubbleContent>
            {message.content ? (
              <div className="typeset-chat">
                {paragraphs.map((paragraph, index) => (
                  <p className="whitespace-pre-wrap" key={`${message.id}-${index}`}>
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <TypingDots />
            )}
          </BubbleContent>
        </Bubble>
        {!sent && message.streaming ? (
          <MessageFooter>
            <span>New text appears as it arrives.</span>
          </MessageFooter>
        ) : null}
      </MessageContent>
      {sent ? <ChatAvatar role={message.role} /> : null}
    </Message>
  );
}

function ActivityMarkers({ activities }: { activities: ToolActivity[] }) {
  if (!activities.length) {
    return null;
  }

  return (
    <div className="grid gap-2" aria-label="Conversation activity">
      {activities.map((activity) => {
        const artifact =
          activity.name === "lesson" || activity.name === "record" || activity.name === "quiz";
        const running = activity.status === "running";
        const statusLabel = running ? "Running" : artifact ? "Attached" : "Complete";

        return (
          <div
            className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card/45 px-3 py-2 text-sm shadow-sm backdrop-blur-xl"
            key={activity.id}
            role={running ? "status" : undefined}
          >
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-md border ${
                running
                  ? "border-primary/30 bg-primary-soft/60 text-primary"
                  : "border-success/30 bg-success-soft/60 text-success"
              }`}
            >
              {running ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : artifact ? (
                <FileText size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {running
                ? activity.label
                : artifact
                  ? `Attached ${activity.label}`
                  : `${activity.label} complete`}
            </span>
            <Badge className="shrink-0" tone={running ? "accent" : "success"}>
              {statusLabel}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function EmptyConversation({ compact, lesson }: { compact: boolean; lesson?: LessonSummary }) {
  return (
    <div
      className={`grid h-full min-h-44 content-center justify-items-center gap-3 rounded-lg border border-border bg-card/35 p-5 text-center ${
        compact ? "min-h-40" : "min-h-[320px]"
      }`}
    >
      <div className="grid size-11 place-items-center rounded-md border border-primary/25 bg-primary-soft/55 text-primary">
        <Sparkles size={18} />
      </div>
      <div className="grid gap-1">
        <p className="font-semibold text-foreground">Ask the tutor anything about this topic.</p>
        <p className="max-w-[28ch] text-sm leading-6 text-muted-foreground">
          {lesson
            ? "It answers from this lesson, your learning records, and resources."
            : "It answers from your lessons, learning records, and resources."}
        </p>
      </div>
    </div>
  );
}

export function ChatSurface({
  active = true,
  compact = false,
  lesson,
  onArtifactCreated,
  topic
}: {
  active?: boolean;
  compact?: boolean;
  lesson?: LessonSummary;
  onArtifactCreated?: (event: ArtifactCreatedEvent) => void;
  topic: TopicSummary;
}) {
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatViewMessage[]>([]);
  const [activities, setActivities] = useState<ToolActivity[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasDraft = draft.trim().length > 0;
  const chatStatus: { label: string; tone: "neutral" | "accent" } = sending
    ? { label: "Streaming", tone: "accent" }
    : { label: sessionId ? `Session ${sessionId}` : "Ready", tone: "neutral" };

  const updateAssistant = (
    assistantId: string,
    update: (message: ChatViewMessage) => ChatViewMessage
  ) => {
    setMessages((current) =>
      current.map((message) => (message.id === assistantId ? update(message) : message))
    );
  };

  const finishAssistant = (assistantId: string) => {
    setMessages((current) =>
      current.flatMap((message) => {
        if (message.id !== assistantId) {
          return [message];
        }

        return message.content.trim() ? [{ ...message, streaming: false }] : [];
      })
    );
  };

  const handleScrollerScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 48;
  };

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !stickToBottomRef.current) {
      return;
    }

    scroller.scrollTop = scroller.scrollHeight;
  }, [activities, messages, sending]);

  useEffect(() => {
    if (!active || sending) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [active, lesson?.id, sending, topic.id]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, compact ? 112 : 128)}px`;
  }, [compact, draft]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const message = draft.trim();
    if (!message || sending) {
      return;
    }

    const userId = localId("user");
    const assistantId = localId("assistant");
    const activeToolIds = new Map<string, string>();
    let streamFailed = false;

    stickToBottomRef.current = true;
    setError(undefined);
    setDraft("");
    setSending(true);
    setActivities([]);
    setMessages((current) => [
      ...current,
      {
        id: userId,
        role: "user",
        content: message
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true
      }
    ]);

    void streamTopicChat(
      topic.id,
      {
        sessionId,
        lessonId: lesson?.id,
        message
      },
      (streamEvent) => {
        if (streamEvent.sessionId) {
          setSessionId(streamEvent.sessionId);
        }

        if (streamEvent.type === "text_delta") {
          updateAssistant(assistantId, (assistant) => ({
            ...assistant,
            content: `${assistant.content}${streamEvent.text}`
          }));
          return;
        }

        if (streamEvent.type === "tool_started") {
          const activityId = localId(streamEvent.name);
          activeToolIds.set(streamEvent.name, activityId);
          setActivities((current) => [
            ...current,
            {
              id: activityId,
              label: streamEvent.label,
              name: streamEvent.name,
              status: "running"
            }
          ]);
          return;
        }

        if (streamEvent.type === "tool_finished") {
          const activityId = activeToolIds.get(streamEvent.name);
          setActivities((current) => {
            if (!activityId) {
              return [
                ...current,
                {
                  id: localId(streamEvent.name),
                  label: streamEvent.label,
                  name: streamEvent.name,
                  status: "finished"
                }
              ];
            }

            return current.map((activity) =>
              activity.id === activityId ? { ...activity, status: "finished" } : activity
            );
          });
          return;
        }

        if (streamEvent.type === "artifact_created") {
          onArtifactCreated?.(streamEvent);
          setActivities((current) => [
            ...current,
            {
              id: localId(streamEvent.kind),
              label: `${streamEvent.kind} ${streamEvent.ref}`,
              name: streamEvent.kind,
              status: "finished"
            }
          ]);
          return;
        }

        if (streamEvent.type === "done") {
          finishAssistant(assistantId);
          return;
        }

        if (streamEvent.type === "error") {
          streamFailed = true;
          setError(chatErrorText(streamEvent));
          setDraft(message);
          finishAssistant(assistantId);
        }
      }
    )
      .catch((cause) => {
        streamFailed = true;
        setDraft(message);
        setError(cause instanceof Error ? cause.message : "Chat stream could not be reached.");
        finishAssistant(assistantId);
      })
      .finally(() => {
        setSending(false);
        if (!streamFailed) {
          setError(undefined);
        }
      });
  };

  const visibleMessages = messages.filter((message) => message.content.trim() || message.streaming);
  const description = lesson
    ? `Knows ${lessonNumberLabel(lesson.number).toLowerCase()} and your topic files.`
    : "Knows your topic files and recent learning records.";

  return (
    <section
      aria-label={lesson ? "Lesson tutor chat" : "Topic tutor chat"}
      className={
        compact
          ? "grid h-full min-h-[28rem] max-h-[calc(100dvh-5rem)] min-w-0 max-w-full grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-3 overflow-hidden"
          : "grid h-[calc(100dvh-10rem)] min-h-[34rem] max-h-[48rem] min-w-0 max-w-full grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-4 overflow-hidden rounded-lg border border-border bg-card/62 p-4 shadow-xl backdrop-blur-xl"
      }
    >
      <div className="grid min-w-0 gap-2">
        <SectionHeader
          actions={<Badge tone={chatStatus.tone}>{chatStatus.label}</Badge>}
          as="h2"
          icon={<MessageCircle size={17} />}
          title="Tutor chat"
        />
        <p className="break-words text-xs leading-5 text-muted-foreground">{description}</p>
      </div>

      <div
        aria-label="Tutor conversation"
        aria-live="polite"
        aria-relevant="additions text"
        className={
          compact
            ? "min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-border bg-background/35 p-2.5 backdrop-blur-xl [scrollbar-gutter:stable]"
            : "min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-border bg-background/35 p-3.5 backdrop-blur-xl [scrollbar-gutter:stable]"
        }
        onScroll={handleScrollerScroll}
        ref={scrollerRef}
        role="log"
      >
        {visibleMessages.length || activities.length ? (
          <div className={compact ? "grid gap-3" : "grid gap-4"}>
            {visibleMessages.map((message) => (
              <ChatMessage compact={compact} key={message.id} message={message} />
            ))}
            <ActivityMarkers activities={activities} />
          </div>
        ) : (
          <EmptyConversation compact={compact} lesson={lesson} />
        )}
      </div>

      {error ? <InlineNotice tone="error" title="Chat needs attention" body={error} /> : null}

      <form
        aria-label="Chat composer"
        className="grid gap-2"
        onSubmit={handleSubmit}
      >
        <label className="text-sm font-medium text-foreground" htmlFor="chat-message">
          Message
        </label>
        <div className="flex min-w-0 items-end gap-2">
          <Textarea
            aria-describedby="chat-message-help"
            className={`${field} max-h-32 min-h-11 resize-none overflow-y-auto py-2.5 text-[14px] leading-5`}
            disabled={sending}
            id="chat-message"
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={lesson ? "Ask about this lesson" : "Ask the tutor"}
            ref={textareaRef}
            rows={1}
            value={draft}
          />
          <Button
            aria-busy={sending}
            aria-label={sending ? "Sending" : "Send"}
            className="size-11 rounded-full"
            disabled={!hasDraft || sending}
            size="icon-lg"
            type="submit"
            variant={hasDraft ? "default" : "secondary"}
          >
            {sending ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUp size={18} />}
            <span className="sr-only">{sending ? "Sending" : "Send"}</span>
          </Button>
        </div>
        <p id="chat-message-help" className="text-xs leading-5 text-muted-foreground">
          Ask for an explanation, example, comparison, or quick knowledge check.
        </p>
      </form>
    </section>
  );
}
