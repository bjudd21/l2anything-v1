import type {
  AwsStatusResponse,
  ChatStreamEvent,
  LessonStatus,
  LessonSummary,
  SettingsResponse,
  TopicSummary
} from "@learning-hub/shared";

export type Route =
  | { name: "dashboard" }
  | { name: "settings" }
  | { name: "new-topic" }
  | { name: "topic"; slug: string }
  | { name: "topic-lessons"; slug: string }
  | { name: "topic-lesson"; slug: string; lessonNumber: number }
  | { name: "topic-records"; slug: string }
  | { name: "topic-resources"; slug: string }
  | { name: "topic-review"; slug: string }
  | { name: "not-found" };

export type ArtifactCreatedEvent = Extract<ChatStreamEvent, { type: "artifact_created" }>;
export type AwsLoginStatus = "idle" | "running" | "succeeded" | "failed";

export interface ChatViewMessage {
  content: string;
  id: string;
  role: "user" | "assistant";
  streaming?: boolean;
}

export interface ToolActivity {
  id: string;
  label: string;
  name: string;
  status: "running" | "finished";
}

export type LessonGenerationStatus = "idle" | "streaming" | "done" | "error";

export interface LessonGenerationState {
  activities: ToolActivity[];
  error?: string;
  generatedLessonRef?: string;
  needsModelSettings: boolean;
  status: LessonGenerationStatus;
}

export const statusOptions: Array<{ label: string; value: LessonStatus }> = [
  { label: "Unread", value: "unread" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" }
];

export function statusLabel(status: LessonStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

export function browserPath() {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.location.pathname;
}

export function browserMobileNavigationOpen() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("nav") === "open";
}

export function parseRoute(path: string): Route {
  if (path === "/") {
    return { name: "dashboard" };
  }

  if (path === "/settings") {
    return { name: "settings" };
  }

  if (path === "/topics/new") {
    return { name: "new-topic" };
  }

  const lessonMatch = /^\/t\/([^/]+)\/lessons\/(\d+)$/.exec(path);
  if (lessonMatch?.[1] && lessonMatch[2]) {
    return {
      name: "topic-lesson",
      slug: decodeURIComponent(lessonMatch[1]),
      lessonNumber: Number(lessonMatch[2])
    };
  }

  const topicChildMatch = /^\/t\/([^/]+)\/([^/]+)$/.exec(path);
  if (topicChildMatch?.[1] && topicChildMatch[2]) {
    const slug = decodeURIComponent(topicChildMatch[1]);

    if (topicChildMatch[2] === "lessons") {
      return { name: "topic-lessons", slug };
    }

    if (topicChildMatch[2] === "records") {
      return { name: "topic-records", slug };
    }

    if (topicChildMatch[2] === "resources") {
      return { name: "topic-resources", slug };
    }

    if (topicChildMatch[2] === "review") {
      return { name: "topic-review", slug };
    }

  }

  const topicMatch = /^\/t\/([^/]+)$/.exec(path);
  if (topicMatch?.[1]) {
    return { name: "topic", slug: decodeURIComponent(topicMatch[1]) };
  }

  return { name: "not-found" };
}

export function routeSlug(route: Route) {
  return "slug" in route ? route.slug : null;
}

export function providerLabel(provider: SettingsResponse["defaultProvider"]) {
  return provider === "bedrock-converse" ? "Bedrock Converse" : "Bedrock Mantle";
}

export function awsStatusText(status: AwsStatusResponse | undefined) {
  if (!status) {
    return "Checking AWS";
  }

  if (status.ok) {
    return "AWS connected";
  }

  if (status.reason === "sso_expired") {
    return "AWS session expired";
  }

  if (status.reason === "no_credentials") {
    return "AWS credentials missing";
  }

  if (status.reason === "access_denied") {
    return "AWS access denied";
  }

  return "AWS status unavailable";
}

export function configuredAwsLoginCommand(
  settings: SettingsResponse | undefined,
  status: AwsStatusResponse | undefined
) {
  if (settings?.awsLoginCommand) {
    return settings.awsLoginCommand;
  }

  const profile = status?.profile ?? settings?.awsProfile;
  return profile ? `aws sso login --profile ${profile}` : "aws sso login";
}

export function topicPath(topic: Pick<TopicSummary, "slug">, child?: string) {
  const base = `/t/${encodeURIComponent(topic.slug)}`;
  return child ? `${base}/${child}` : base;
}

export function lessonRoute(topic: TopicSummary, lesson: LessonSummary) {
  return `/t/${encodeURIComponent(topic.slug)}/lessons/${lesson.number}`;
}

export function lessonFileUrl(topicId: number, fileName: string) {
  return `/api/topics/${topicId}/lessons/${encodeURIComponent(fileName)}`;
}

export function referenceFileUrl(topicId: number, fileName: string) {
  return `/api/topics/${topicId}/reference/${encodeURIComponent(fileName)}`;
}

export function lessonNumberLabel(number: number) {
  return `Lesson ${number}`;
}

export function todayDateValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function formatDueDate(value: string | null) {
  if (!value) {
    return "No finish date";
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatStudiedAt(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThatDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfThatDay.getTime()) / 86_400_000);

  if (dayDiff <= 0) {
    return "studied today";
  }
  if (dayDiff === 1) {
    return "studied yesterday";
  }
  if (dayDiff < 7) {
    return `studied ${dayDiff}d ago`;
  }
  if (dayDiff < 28) {
    return `studied ${Math.floor(dayDiff / 7)}w ago`;
  }

  return `studied ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(parsed)}`;
}

export function lessonDueText(lesson: Pick<LessonSummary, "dueAt" | "status">) {
  if (!lesson.dueAt) {
    return "No finish date";
  }

  if (lesson.status === "completed") {
    return `Finished by ${formatDueDate(lesson.dueAt)}`;
  }

  const today = todayDateValue();
  if (lesson.dueAt < today) {
    return `Overdue since ${formatDueDate(lesson.dueAt)}`;
  }

  if (lesson.dueAt === today) {
    return "Due today";
  }

  return `Due ${formatDueDate(lesson.dueAt)}`;
}

export function localId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function slugFromTitle(title: string) {
  return (
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "new-topic"
  );
}

export function titleFromMissionMessage(message: string) {
  const firstThought =
    message
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "New Topic";
  let cleaned = firstThought
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .replace(/^i\s+(?:want|need|would like|am trying|hope)\s+to\s+/i, "")
    .replace(/^learn\s+about\s+/i, "")
    .replace(/^learn\s+to\s+/i, "")
    .trim();

  const purposeMatch = /^(.+?)\s+so\s+(?:that\s+)?i\s+can\s+(.+)$/i.exec(cleaned);
  if (purposeMatch?.[1] && purposeMatch[2]) {
    const subject = purposeMatch[1].replace(/^learn\s+/i, "").trim();
    const goal = purposeMatch[2].replace(/^to\s+/i, "").trim();
    cleaned =
      /^(?:Japanese|Spanish|French|German|Korean|Chinese|Italian|Portuguese|Arabic|Russian)$/i.test(
        subject
      ) && /^read\s+/i.test(goal)
        ? `${goal} in ${subject}`
        : `${subject} to ${goal}`;
  }

  const constraintStart = cleaned.search(
    /\b(?:total beginner|beginner|starting from|from zero|one piece|\d+\s*(?:-|to)?\s*\d*\s*(?:hrs?|hours?)|depending on|open ended|not sure|we could|try different|nothing off limits|looks good)\b/i
  );
  if (constraintStart > 0) {
    cleaned = cleaned.slice(0, constraintStart).trim();
  }

  cleaned = cleaned
    .replace(/\bmangas\b/gi, "manga")
    .replace(/\bjapanese\b/gi, "Japanese")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(?:read|write|speak|understand|use|build|make|create|practice)\b/i.test(cleaned)) {
    cleaned = `Learning to ${cleaned}`;
  } else if (!/^learning\b/i.test(cleaned)) {
    cleaned = `Learning ${cleaned}`;
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned
    ? `${cleaned.slice(0, 1).toUpperCase()}${cleaned.slice(1, 90)}`
    : "New Topic";
}

export function chatErrorText(event: Extract<ChatStreamEvent, { type: "error" }>) {
  if (event.code === "aws_auth") {
    if (event.reason === "sso_expired") {
      return "AWS session expired. Run aws sso login for the configured profile, then send again.";
    }

    return event.message;
  }

  if (event.code === "provider_config") {
    return event.message;
  }

  // Always surface the provider's actual message; the generic line alone hides
  // actionable causes (model access, throttling) from the user.
  return event.message || "Chat stream failed. Your draft is still here.";
}
