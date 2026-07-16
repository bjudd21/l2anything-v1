import {
  awsLoginRequestSchema,
  awsStatusResponseSchema,
  lessonDeleteResponseSchema,
  lessonGroupAssignSchema,
  lessonGroupCreateSchema,
  lessonGroupResponseSchema,
  awsLoginResponseSchema,
  awsModelsResponseSchema,
  awsProfileCreateResponseSchema,
  awsProfileCreateSchema,
  awsProfilesResponseSchema,
  chatHistoryResponseSchema,
  chatRequestSchema,
  chatStreamEventSchema,
  dashboardResponseSchema,
  lessonDueDateUpdateSchema,
  lessonStatusResponseSchema,
  lessonTitleUpdateSchema,
  quizGenerateRequestSchema,
  quizGenerateResponseSchema,
  settingsResponseSchema,
  settingsUpdateSchema,
  setupUpdateSchema,
  topicCreateRequestSchema,
  topicDeleteResponseSchema,
  topicReviewResponseSchema,
  topicGroupAssignSchema,
  topicGroupCreateSchema,
  topicGroupResponseSchema,
  topicGroupUpdateSchema,
  topicDetailResponseSchema,
  topicLessonsResponseSchema,
  topicRecordsResponseSchema,
  topicReferenceResponseSchema,
  topicStatusResponseSchema,
  topicTitleUpdateSchema,
  topicInterviewRequestSchema,
  topicsResponseSchema,
  type AwsStatusResponse,
  type LessonDeleteResponse,
  type LessonGroupAssign,
  type LessonGroupCreate,
  type LessonGroupResponse,
  type AwsLoginResponse,
  type AwsModelsResponse,
  type AwsProfileCreate,
  type AwsProfileCreateResponse,
  type AwsProfilesResponse,
  type ChatHistoryResponse,
  type ChatRequest,
  type ChatStreamEvent,
  type DashboardResponse,
  type LessonDueDateUpdate,
  type LessonStatus,
  type LessonStatusResponse,
  type LessonTitleUpdate,
  type QuizGenerateRequest,
  type QuizGenerateResponse,
  type SettingsResponse,
  type SettingsUpdate,
  type SetupUpdate,
  type TopicDetailResponse,
  type TopicCreateRequest,
  type TopicDeleteResponse,
  type TopicGroupAssign,
  type TopicGroupCreate,
  type TopicGroupResponse,
  type TopicGroupUpdate,
  type TopicLessonsResponse,
  type TopicRecordsResponse,
  type TopicReferenceResponse,
  type TopicReviewResponse,
  type TopicStatusResponse,
  type TopicTitleUpdate,
  type TopicInterviewRequest,
  type TopicsResponse
} from "@learning-hub/shared";

interface JsonSchema<T> {
  parse(value: unknown): T;
}

async function responseError(response: Response, path: string) {
  let message = `Request failed: ${path}`;

  try {
    const payload = (await response.json()) as {
      issues?: Array<{ message?: unknown }>;
      message?: unknown;
    };
    if (typeof payload.message === "string") {
      message = payload.message;
    } else if (typeof payload.issues?.[0]?.message === "string") {
      message = payload.issues[0].message;
    }
  } catch {
    // Keep the request path when the server did not return a JSON error.
  }

  return new Error(message);
}

async function readJson<T>(path: string, schema: JsonSchema<T>) {
  const response = await fetch(path, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw await responseError(response, path);
  }

  return schema.parse(await response.json());
}

async function writeJson<T>(path: string, body: unknown, schema: JsonSchema<T>) {
  return writeJsonWithMethod(path, "PUT", body, schema);
}

async function postJson<T>(path: string, body: unknown, schema: JsonSchema<T>) {
  return writeJsonWithMethod(path, "POST", body, schema);
}

async function writeJsonWithMethod<T>(
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  schema: JsonSchema<T>
) {
  const response = await fetch(path, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw await responseError(response, path);
  }

  return schema.parse(await response.json());
}

function parseSsePacket(packet: string) {
  const data = packet
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");

  if (!data) {
    return null;
  }

  return chatStreamEventSchema.parse(JSON.parse(data));
}

export function parseChatSseEvents(text: string): ChatStreamEvent[] {
  return text
    .split(/\r?\n\r?\n/)
    .map((packet) => packet.trim())
    .filter(Boolean)
    .map(parseSsePacket)
    .filter((event): event is ChatStreamEvent => Boolean(event));
}

export function fetchTopics(): Promise<TopicsResponse> {
  return readJson("/api/topics", topicsResponseSchema);
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return readJson("/api/dashboard", dashboardResponseSchema);
}

export function createTopic(request: TopicCreateRequest): Promise<TopicsResponse> {
  return postJson("/api/topics", topicCreateRequestSchema.parse(request), topicsResponseSchema);
}

export function createTopicGroup(request: TopicGroupCreate): Promise<TopicGroupResponse> {
  return postJson(
    "/api/topics/groups",
    topicGroupCreateSchema.parse(request),
    topicGroupResponseSchema
  );
}

export function updateTopicGroup(
  groupId: number,
  request: TopicGroupUpdate
): Promise<TopicGroupResponse> {
  return writeJson(
    `/api/topics/groups/${groupId}`,
    topicGroupUpdateSchema.parse(request),
    topicGroupResponseSchema
  );
}

export function updateTopicTitle(
  topicId: number,
  request: TopicTitleUpdate
): Promise<TopicStatusResponse> {
  return writeJson(
    `/api/topics/${topicId}/title`,
    topicTitleUpdateSchema.parse(request),
    topicStatusResponseSchema
  );
}

export function updateTopicGroupAssignment(
  topicId: number,
  request: TopicGroupAssign
): Promise<TopicStatusResponse> {
  return writeJson(
    `/api/topics/${topicId}/group`,
    topicGroupAssignSchema.parse(request),
    topicStatusResponseSchema
  );
}

export function fetchSettings(): Promise<SettingsResponse> {
  return readJson("/api/settings", settingsResponseSchema);
}

export function fetchAwsStatus(): Promise<AwsStatusResponse> {
  return readJson("/api/aws/status", awsStatusResponseSchema);
}

export function fetchAwsModels(): Promise<AwsModelsResponse> {
  return readJson("/api/aws/models", awsModelsResponseSchema);
}

export function fetchAwsProfiles(): Promise<AwsProfilesResponse> {
  return readJson("/api/aws/profiles", awsProfilesResponseSchema);
}

export async function createAwsProfile(
  request: AwsProfileCreate
): Promise<AwsProfileCreateResponse> {
  const response = await fetch("/api/aws/profiles", {
    method: "PUT",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-learning-hub-action": "write-aws-profile"
    },
    body: JSON.stringify(awsProfileCreateSchema.parse(request))
  });

  if (!response.ok) {
    throw await responseError(response, "/api/aws/profiles");
  }

  return awsProfileCreateResponseSchema.parse(await response.json());
}

export function runAwsLogin(profile?: string): Promise<AwsLoginResponse> {
  return fetch("/api/aws/login", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-learning-hub-action": "aws-login"
    },
    body: JSON.stringify(awsLoginRequestSchema.parse(profile === undefined ? {} : { profile }))
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("AWS login command could not be started.");
    }

    return awsLoginResponseSchema.parse(await response.json());
  });
}

export function saveSettings(update: SettingsUpdate): Promise<SettingsResponse> {
  return writeJson("/api/settings", settingsUpdateSchema.parse(update), settingsResponseSchema);
}

export function saveSetup(update: SetupUpdate): Promise<SettingsResponse> {
  return writeJson("/api/settings/setup", setupUpdateSchema.parse(update), settingsResponseSchema);
}

export function fetchTopicChatHistory(
  topicId: number,
  sessionId: number
): Promise<ChatHistoryResponse> {
  return readJson(`/api/topics/${topicId}/chat/${sessionId}`, chatHistoryResponseSchema);
}

export async function streamTopicChat(
  topicId: number,
  request: ChatRequest,
  onEvent: (event: ChatStreamEvent) => void
) {
  const response = await fetch(`/api/topics/${topicId}/chat`, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json"
    },
    body: JSON.stringify(chatRequestSchema.parse(request))
  });

  if (!response.ok) {
    let message = "";

    try {
      const payload = (await response.json()) as { error?: unknown; message?: unknown };
      message =
        typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
            ? payload.error
            : "";
    } catch {
      message = "";
    }

    throw new Error(message || `Request failed: /api/topics/${topicId}/chat`);
  }

  if (!response.body) {
    throw new Error("Chat stream did not include a response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });
    const parts = buffered.split(/\r?\n\r?\n/);
    buffered = parts.pop() ?? "";

    for (const part of parts) {
      for (const event of parseChatSseEvents(part)) {
        onEvent(event);
      }
    }
  }

  buffered += decoder.decode();
  for (const event of parseChatSseEvents(buffered)) {
    onEvent(event);
  }
}

export async function streamTopicInterview(
  request: TopicInterviewRequest,
  onEvent: (event: ChatStreamEvent) => void
) {
  const response = await fetch("/api/topics/interview", {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json"
    },
    body: JSON.stringify(topicInterviewRequestSchema.parse(request))
  });

  if (!response.ok) {
    let message = "";

    try {
      const payload = (await response.json()) as { error?: unknown; message?: unknown };
      message =
        typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
            ? payload.error
            : "";
    } catch {
      message = "";
    }

    throw new Error(message || "Mission interview could not be reached.");
  }

  if (!response.body) {
    throw new Error("Mission interview stream did not include a response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });
    const parts = buffered.split(/\r?\n\r?\n/);
    buffered = parts.pop() ?? "";

    for (const part of parts) {
      for (const event of parseChatSseEvents(part)) {
        onEvent(event);
      }
    }
  }

  buffered += decoder.decode();
  for (const event of parseChatSseEvents(buffered)) {
    onEvent(event);
  }
}

export async function streamTopicLessonGeneration(
  topicId: number,
  onEvent: (event: ChatStreamEvent) => void,
  options: { signal?: AbortSignal } = {}
) {
  const response = await fetch(`/api/topics/${topicId}/lessons/generate`, {
    method: "POST",
    headers: {
      accept: "text/event-stream"
    },
    signal: options.signal
  });

  if (!response.ok) {
    throw new Error(`Request failed: /api/topics/${topicId}/lessons/generate`);
  }

  if (!response.body) {
    throw new Error("Lesson generation stream did not include a response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });
    const parts = buffered.split(/\r?\n\r?\n/);
    buffered = parts.pop() ?? "";

    for (const part of parts) {
      for (const event of parseChatSseEvents(part)) {
        onEvent(event);
      }
    }
  }

  buffered += decoder.decode();
  for (const event of parseChatSseEvents(buffered)) {
    onEvent(event);
  }
}

export function fetchTopicDetail(topicId: number): Promise<TopicDetailResponse> {
  return readJson(`/api/topics/${topicId}`, topicDetailResponseSchema);
}

export function fetchTopicLessons(topicId: number): Promise<TopicLessonsResponse> {
  return readJson(`/api/topics/${topicId}/lessons`, topicLessonsResponseSchema);
}

export function createLessonGroup(
  topicId: number,
  request: LessonGroupCreate
): Promise<LessonGroupResponse> {
  return postJson(
    `/api/topics/${topicId}/lesson-groups`,
    lessonGroupCreateSchema.parse(request),
    lessonGroupResponseSchema
  );
}

export function fetchTopicRecords(topicId: number): Promise<TopicRecordsResponse> {
  return readJson(`/api/topics/${topicId}/records`, topicRecordsResponseSchema);
}

export function fetchTopicReference(topicId: number): Promise<TopicReferenceResponse> {
  return readJson(`/api/topics/${topicId}/reference`, topicReferenceResponseSchema);
}

export function fetchTopicReview(topicId: number): Promise<TopicReviewResponse> {
  return readJson(`/api/topics/${topicId}/review`, topicReviewResponseSchema);
}

export function generateTopicQuiz(
  topicId: number,
  request: QuizGenerateRequest
): Promise<QuizGenerateResponse> {
  return postJson(
    `/api/topics/${topicId}/quizzes/generate`,
    quizGenerateRequestSchema.parse(request),
    quizGenerateResponseSchema
  );
}

export function updateLessonStatus(
  topicId: number,
  lessonNumber: number,
  status: LessonStatus
): Promise<LessonStatusResponse> {
  return writeJson(
    `/api/topics/${topicId}/lessons/${lessonNumber}/status`,
    { status },
    lessonStatusResponseSchema
  );
}

export function updateLessonTitle(
  topicId: number,
  lessonNumber: number,
  request: LessonTitleUpdate
): Promise<LessonStatusResponse> {
  return writeJson(
    `/api/topics/${topicId}/lessons/${lessonNumber}/title`,
    lessonTitleUpdateSchema.parse(request),
    lessonStatusResponseSchema
  );
}

export function updateLessonDueDate(
  topicId: number,
  lessonNumber: number,
  request: LessonDueDateUpdate
): Promise<LessonStatusResponse> {
  return writeJson(
    `/api/topics/${topicId}/lessons/${lessonNumber}/due-date`,
    lessonDueDateUpdateSchema.parse(request),
    lessonStatusResponseSchema
  );
}

export function updateLessonGroup(
  topicId: number,
  lessonNumber: number,
  request: LessonGroupAssign
): Promise<LessonStatusResponse> {
  return writeJsonWithMethod(
    `/api/topics/${topicId}/lessons/${lessonNumber}/group`,
    "PUT",
    lessonGroupAssignSchema.parse(request),
    lessonStatusResponseSchema
  );
}

export function deleteLesson(topicId: number, lessonNumber: number): Promise<LessonDeleteResponse> {
  return fetch(`/api/topics/${topicId}/lessons/${lessonNumber}`, {
    method: "DELETE",
    headers: {
      accept: "application/json"
    }
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Request failed: /api/topics/${topicId}/lessons/${lessonNumber}`);
    }

    return lessonDeleteResponseSchema.parse(await response.json());
  });
}

export function deleteTopic(topicId: number): Promise<TopicDeleteResponse> {
  return fetch(`/api/topics/${topicId}`, {
    method: "DELETE",
    headers: {
      accept: "application/json"
    }
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Request failed: /api/topics/${topicId}`);
    }

    return topicDeleteResponseSchema.parse(await response.json());
  });
}
