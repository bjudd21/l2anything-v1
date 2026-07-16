import type { TopicInterviewMessage, TopicsResponse } from "@learning-hub/shared";
import { ArrowUp, Bot, CheckCircle2, LoaderCircle, Sparkles, UserRound } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { createTopic, streamTopicInterview } from "../api.js";
import {
  Bubble,
  BubbleContent,
  InlineNotice,
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  Textarea,
  Badge,
  Button,
  card,
  field,
  SectionHeader
} from "../components/ui.js";
import {
  chatErrorText,
  localId,
  slugFromTitle,
  titleFromMissionMessage,
  type ChatViewMessage
} from "../lib.js";

const introMessage =
  "What do you want to learn, why now, and what would count as a useful first win?";
const readyMarkerPattern = /<READY_TO_CREATE_TOPIC\s*\/?>/i;
const topicTitleMarkerPattern = /<TOPIC_TITLE>([\s\S]*?)<\/TOPIC_TITLE>/i;
const controlMarkerPattern =
  /<TOPIC_TITLE>[\s\S]*?<\/TOPIC_TITLE>|<READY_TO_CREATE_TOPIC\s*\/?>/gi;
const controlMarkerStartPattern = /<\s*(?:TOPIC_TITLE|READY_TO_CREATE_TOPIC)\b/i;

function cleanTopicTitle(value: string | undefined) {
  const cleaned = value
    ?.replace(/\s+/g, " ")
    .replace(/^["']|["']$/g, "")
    .replace(/^topic\s+title\s*:\s*/i, "")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return undefined;
  }

  return cleaned.slice(0, 90);
}

function stripControlMarkers(content: string) {
  return content.replace(controlMarkerPattern, "").trim();
}

function visibleAssistantContent(content: string) {
  const markerIndex = content.search(controlMarkerStartPattern);
  const visibleContent = markerIndex >= 0 ? content.slice(0, markerIndex) : content;

  return stripControlMarkers(visibleContent);
}

function hasReadyMarker(content: string) {
  return readyMarkerPattern.test(content);
}

function suggestedTitleFromAssistant(content: string) {
  return cleanTopicTitle(topicTitleMarkerPattern.exec(content)?.[1]);
}

function isConfirmation(content: string) {
  return /^(yes|yep|yeah|confirm|confirmed|ready|go|do it|looks good|let'?s go|no more|nothing else)$/i.test(
    content.trim()
  );
}

function shouldAutoCreate(messages: ChatViewMessage[], assistantContent: string) {
  if (hasReadyMarker(assistantContent)) {
    return true;
  }

  const lastUser = [...messages].reverse().find((message) => message.role === "user");

  return Boolean(
    lastUser &&
      isConfirmation(lastUser.content) &&
      /ready to create the topic/i.test(assistantContent)
  );
}

function TypingDots() {
  return (
    <span aria-label="Tutor is thinking" className="inline-flex items-center gap-1 py-1" role="status">
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

function toInterviewMessages(messages: ChatViewMessage[]): TopicInterviewMessage[] {
  return messages
    .filter((message) => message.id !== "assistant-intro" && message.content.trim())
    .map((message) => ({
      content: stripControlMarkers(message.content),
      role: message.role
    }))
    .filter((message) => message.content.trim());
}

function InterviewMessage({ message }: { message: ChatViewMessage }) {
  const sent = message.role === "user";

  return (
    <Message align={sent ? "end" : "start"}>
      {!sent ? <ChatAvatar role={message.role} /> : null}
      <MessageContent>
        <MessageHeader className={sent ? "justify-end" : undefined}>
          <span>{sent ? "You" : "Tutor"}</span>
          {message.streaming ? (
            <span className="inline-flex items-center gap-1 text-primary-strong">
              <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-primary" />
              Thinking
            </span>
          ) : null}
        </MessageHeader>
        <Bubble
          className={sent ? "rounded-br-sm" : "rounded-bl-sm"}
          variant={sent ? "user" : "assistant"}
        >
          <BubbleContent>
            {message.content ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <TypingDots />
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
      {sent ? <ChatAvatar role={message.role} /> : null}
    </Message>
  );
}

export function NewTopicWizard({
  onCreated
}: {
  onCreated: (
    topicsResponse: TopicsResponse,
    slug: string,
    options?: { generateFirstLesson?: boolean }
  ) => void;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatViewMessage[]>([
    {
      id: "assistant-intro",
      role: "assistant",
      content: introMessage
    }
  ]);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const userMessages = messages.filter((message) => message.role === "user" && message.content.trim());
  const hasDraft = draft.trim().length > 0;
  const canCreate = userMessages.length > 0 && !creating && !sending;
  const createButtonPrimary = !hasDraft && (canCreate || creating);
  const interviewStatus: {
    label: string;
    tone: "neutral" | "accent" | "success";
  } = creating
    ? { label: "Creating", tone: "accent" }
    : sending
      ? { label: "Listening", tone: "accent" }
      : canCreate
        ? { label: "Ready to create", tone: "success" }
        : { label: "Ready", tone: "neutral" };

  const updateAssistant = (
    assistantId: string,
    update: (message: ChatViewMessage) => ChatViewMessage
  ) => {
    setMessages((current) =>
      current.map((message) => (message.id === assistantId ? update(message) : message))
    );
  };

  const finishAssistant = (assistantId: string, content?: string) => {
    setMessages((current) =>
      current.flatMap((message) => {
        if (message.id !== assistantId) {
          return [message];
        }

        const nextContent = content ?? message.content;

        return nextContent.trim()
          ? [{ ...message, content: stripControlMarkers(nextContent), streaming: false }]
          : [];
      })
    );
  };

  const createTopicFromMessages = (conversation: ChatViewMessage[], suggestedTitle?: string) => {
    const conversationUserMessages = conversation.filter(
      (message) => message.role === "user" && message.content.trim()
    );

    if (!conversationUserMessages.length || creating) {
      return;
    }

    const titleSeed = conversationUserMessages.map((message) => message.content).join(" ");
    const title = cleanTopicTitle(suggestedTitle) ?? titleFromMissionMessage(titleSeed);
    const slug = slugFromTitle(title);

    setCreating(true);
    setError(undefined);

    void createTopic({
      interviewMessages: toInterviewMessages(conversation),
      slug,
      title
    })
      .then((response) => onCreated(response, slug, { generateFirstLesson: true }))
      .catch((cause) => {
        setCreating(false);
        setError(cause instanceof Error ? cause.message : "Topic could not be created.");
      });
  };

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    scroller.scrollTop = scroller.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (sending || creating) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [creating, messages.length, sending]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [draft]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const message = draft.trim();
    if (!message || sending || creating) {
      return;
    }

    const userMessage: ChatViewMessage = {
      id: localId("user"),
      role: "user",
      content: message
    };
    const assistantId = localId("assistant");
    const assistantMessage: ChatViewMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true
    };
    const nextMessages = [...messages, userMessage];
    let assistantText = "";
    let streamFailed = false;

    setDraft("");
    setError(undefined);
    setSending(true);
    setMessages([...nextMessages, assistantMessage]);

    void streamTopicInterview({ messages: toInterviewMessages(nextMessages) }, (streamEvent) => {
      if (streamEvent.type === "text_delta") {
        assistantText += streamEvent.text;
        updateAssistant(assistantId, (assistant) => ({
          ...assistant,
          content: visibleAssistantContent(assistantText)
        }));
        return;
      }

      if (streamEvent.type === "done") {
        const finalAssistant = visibleAssistantContent(assistantText);
        const suggestedTitle = suggestedTitleFromAssistant(assistantText);
        const completedMessages = finalAssistant
          ? [
              ...nextMessages,
              {
                id: assistantId,
                role: "assistant" as const,
                content: finalAssistant
              }
            ]
          : nextMessages;

        finishAssistant(assistantId, finalAssistant);

        if (shouldAutoCreate(nextMessages, assistantText)) {
          createTopicFromMessages(completedMessages, suggestedTitle);
        }

        return;
      }

      if (streamEvent.type === "error") {
        streamFailed = true;
        setError(chatErrorText(streamEvent));
        setDraft(message);
        finishAssistant(assistantId);
      }
    })
      .catch((cause) => {
        streamFailed = true;
        setDraft(message);
        setError(cause instanceof Error ? cause.message : "Mission interview could not be reached.");
        finishAssistant(assistantId);
      })
      .finally(() => {
        setSending(false);
        if (!streamFailed) {
          setError(undefined);
        }
      });
  };

  const handleCreateTopic = () => {
    if (!canCreate) {
      return;
    }
    createTopicFromMessages(messages);
  };

  return (
    <div className="mx-auto grid h-[calc(100dvh-8.5rem)] min-h-0 w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] gap-5 overflow-hidden">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <SectionHeader as="h1" icon={<Sparkles size={17} />} title="Start a new topic" />
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Shape the mission with the tutor, then create the workspace when it has enough context.
          </p>
        </div>
        <Button
          aria-busy={creating}
          disabled={!canCreate}
          onClick={handleCreateTopic}
          type="button"
          variant={createButtonPrimary ? "default" : "secondary"}
        >
          {creating ? <LoaderCircle className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
          {creating ? "Creating" : "Create topic"}
        </Button>
      </header>

      <section
        aria-label="Mission interview"
        className={`${card} grid min-h-0 min-w-0 max-w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden p-4`}
      >
        <div className="grid min-w-0 gap-2">
          <SectionHeader
            actions={<Badge tone={interviewStatus.tone}>{interviewStatus.label}</Badge>}
            as="h2"
            icon={<Sparkles size={17} />}
            title="Mission interview"
          />
          <p className="break-words text-xs leading-5 text-muted-foreground">
            Uses the same configured model path as Tutor chat.
          </p>
        </div>

        <div
          aria-label="Mission conversation"
          aria-live="polite"
          aria-relevant="additions text"
          className="min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-border bg-background/35 p-3.5 backdrop-blur-xl [scrollbar-gutter:stable]"
          ref={scrollerRef}
          role="log"
        >
          <div className="grid gap-4">
            {messages.map((message) => (
              <InterviewMessage key={message.id} message={message} />
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          {error ? <InlineNotice tone="error" title="Mission interview needs attention" body={error} /> : null}

          <form
            aria-label="Mission interview composer"
            className="grid gap-2"
            onSubmit={handleSubmit}
          >
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="new-topic-message"
            >
              Message
            </label>
            <div className="flex min-w-0 items-end gap-2">
              <Textarea
                aria-describedby="new-topic-message-help"
                className={`${field} max-h-32 min-h-11 resize-none overflow-y-auto py-2.5 text-[14px] leading-5`}
                disabled={sending || creating}
                id="new-topic-message"
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Tell the tutor what you want to learn"
                ref={textareaRef}
                rows={1}
                value={draft}
              />
              <Button
                aria-busy={sending}
                aria-label={sending ? "Sending" : "Send"}
                className="size-11 rounded-full"
                disabled={!hasDraft || sending || creating}
                size="icon-lg"
                type="submit"
                variant={hasDraft ? "default" : "secondary"}
              >
                {sending ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUp size={18} />}
                <span className="sr-only">{sending ? "Sending" : "Send"}</span>
              </Button>
            </div>
            <p id="new-topic-message-help" className="text-xs leading-5 text-muted-foreground">
              Share your goal, starting point, and what a useful first win looks like.
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
