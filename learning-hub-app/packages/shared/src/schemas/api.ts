import { z } from "zod";

export const providerSchema = z.enum(["bedrock-converse", "bedrock-mantle"]);

export const topicSummarySchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  title: z.string().min(1),
  groupId: z.number().int().positive().nullable(),
  lessonCount: z.number().int().nonnegative(),
  completedLessonCount: z.number().int().nonnegative(),
  dueLessonCount: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
  resourceCount: z.number().int().nonnegative(),
  referenceCount: z.number().int().nonnegative(),
  reviewItemCount: z.number().int().nonnegative(),
  dueReviewCount: z.number().int().nonnegative(),
  lastActiveAt: z.string().nullable().optional()
});

export const topicGroupSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  collapsed: z.boolean()
});

export const topicsResponseSchema = z.object({
  ok: z.literal(true),
  workspaceConfigured: z.boolean(),
  workspaceDir: z.string().nullable(),
  groups: z.array(topicGroupSchema),
  topics: z.array(topicSummarySchema)
});

export const lessonStatusSchema = z.enum(["unread", "in_progress", "completed"]);

export const lessonGroupSchema = z.object({
  id: z.number().int().positive(),
  topicId: z.number().int().positive(),
  name: z.string().min(1)
});

export const lessonSummarySchema = z.object({
  id: z.number().int().positive(),
  topicId: z.number().int().positive(),
  number: z.number().int().positive(),
  fileName: z.string().min(1),
  title: z.string().min(1),
  status: lessonStatusSchema,
  groupId: z.number().int().positive().nullable(),
  dueAt: z.string().min(1).nullable()
});

export const recordSummarySchema = z.object({
  id: z.number().int().positive(),
  topicId: z.number().int().positive(),
  number: z.number().int().positive(),
  fileName: z.string().min(1),
  title: z.string().min(1)
});

export const recordWithContentSchema = recordSummarySchema.extend({
  content: z.string()
});

export const referenceDocumentSchema = z.object({
  fileName: z.string().min(1),
  title: z.string().min(1)
});

export const topicDetailResponseSchema = z.object({
  ok: z.literal(true),
  topic: topicSummarySchema,
  mission: z.string().nullable(),
  counts: z.object({
    lessons: z.number().int().nonnegative(),
    completedLessons: z.number().int().nonnegative(),
    records: z.number().int().nonnegative(),
    resources: z.number().int().nonnegative(),
    references: z.number().int().nonnegative()
  }),
  recentRecords: z.array(recordSummarySchema),
  nextAction: z.object({
    label: z.string().min(1),
    description: z.string().min(1),
    href: z.string().min(1).nullable()
  })
});

export const topicFileResponseSchema = z.object({
  ok: z.literal(true),
  kind: z.enum(["mission", "notes", "resources"]),
  fileName: z.string().min(1),
  content: z.string()
});

export const topicLessonsResponseSchema = z.object({
  ok: z.literal(true),
  topicId: z.number().int().positive(),
  groups: z.array(lessonGroupSchema),
  lessons: z.array(lessonSummarySchema)
});

export const lessonStatusUpdateSchema = z
  .object({
    status: lessonStatusSchema
  })
  .strict();

export const lessonTitleUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(140)
  })
  .strict();

export const lessonDueDateUpdateSchema = z
  .object({
    dueAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
  })
  .strict();

export const topicTitleUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(140)
  })
  .strict();

export const topicGroupCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80)
  })
  .strict();

export const topicGroupUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    collapsed: z.boolean().optional()
  })
  .strict();

export const topicGroupAssignSchema = z
  .object({
    groupId: z.number().int().positive().nullable()
  })
  .strict();

export const lessonGroupCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80)
  })
  .strict();

export const lessonGroupAssignSchema = z
  .object({
    groupId: z.number().int().positive().nullable()
  })
  .strict();

export const lessonStatusResponseSchema = z.object({
  ok: z.literal(true),
  lesson: lessonSummarySchema
});

export const lessonGroupResponseSchema = z.object({
  ok: z.literal(true),
  group: lessonGroupSchema
});

export const topicGroupResponseSchema = z.object({
  ok: z.literal(true),
  group: topicGroupSchema
});

export const topicStatusResponseSchema = z.object({
  ok: z.literal(true),
  topic: topicSummarySchema
});

export const topicDeleteResponseSchema = z.object({
  ok: z.literal(true),
  topicId: z.number().int().positive(),
  slug: z.string().min(1)
});

export const lessonDeleteResponseSchema = z.object({
  ok: z.literal(true),
  topicId: z.number().int().positive(),
  lessonNumber: z.number().int().positive()
});

export const topicRecordsResponseSchema = z.object({
  ok: z.literal(true),
  topicId: z.number().int().positive(),
  records: z.array(recordWithContentSchema)
});

export const topicReferenceResponseSchema = z.object({
  ok: z.literal(true),
  topicId: z.number().int().positive(),
  resources: z.string().nullable(),
  references: z.array(referenceDocumentSchema)
});

export const awsCredentialReasonSchema = z.enum([
  "sso_expired",
  "no_credentials",
  "access_denied",
  "unknown"
]);

export const chatRequestSchema = z
  .object({
    sessionId: z.number().int().positive().optional(),
    lessonId: z.number().int().positive().optional(),
    message: z.string().trim().min(1).max(12000)
  })
  .strict();

export const chatRoleSchema = z.enum(["user", "assistant"]);

export const topicInterviewMessageSchema = z
  .object({
    role: chatRoleSchema,
    content: z.string().trim().min(1).max(12000)
  })
  .strict();

export const topicInterviewRequestSchema = z
  .object({
    messages: z.array(topicInterviewMessageSchema).min(1).max(24)
  })
  .strict();

export const topicCreateRequestSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(140),
    interviewMessages: z.array(topicInterviewMessageSchema).max(24).optional()
  })
  .strict();

export const chatSessionSchema = z.object({
  id: z.number().int().positive(),
  topicId: z.number().int().positive(),
  lessonId: z.number().int().positive().nullable(),
  createdAt: z.string().min(1)
});

export const chatMessageSchema = z.object({
  id: z.number().int().positive(),
  sessionId: z.number().int().positive(),
  role: chatRoleSchema,
  content: z.string(),
  createdAt: z.string().min(1)
});

export const chatHistoryResponseSchema = z.object({
  ok: z.literal(true),
  session: chatSessionSchema,
  messages: z.array(chatMessageSchema)
});

export const chatUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional()
});

const chatStreamBaseSchema = z.object({
  sessionId: z.number().int().positive().optional()
});

export const chatTextDeltaEventSchema = chatStreamBaseSchema.extend({
  type: z.literal("text_delta"),
  text: z.string()
});

export const chatToolStartedEventSchema = chatStreamBaseSchema.extend({
  type: z.literal("tool_started"),
  name: z.string().min(1),
  label: z.string().min(1)
});

export const chatToolFinishedEventSchema = chatStreamBaseSchema.extend({
  type: z.literal("tool_finished"),
  name: z.string().min(1),
  label: z.string().min(1)
});

export const chatArtifactCreatedEventSchema = chatStreamBaseSchema.extend({
  type: z.literal("artifact_created"),
  kind: z.enum(["lesson", "record", "quiz", "reference"]),
  ref: z.string().min(1)
});

export const chatDoneEventSchema = chatStreamBaseSchema.extend({
  type: z.literal("done"),
  messageId: z.number().int().positive().optional(),
  stopReason: z.string().min(1).optional(),
  usage: chatUsageSchema.optional()
});

export const chatErrorEventSchema = chatStreamBaseSchema.extend({
  type: z.literal("error"),
  code: z.enum(["aws_auth", "provider_config", "provider_error"]),
  message: z.string().min(1),
  recoverable: z.boolean(),
  reason: awsCredentialReasonSchema.optional()
});

export const chatStreamEventSchema = z.discriminatedUnion("type", [
  chatTextDeltaEventSchema,
  chatToolStartedEventSchema,
  chatToolFinishedEventSchema,
  chatArtifactCreatedEventSchema,
  chatDoneEventSchema,
  chatErrorEventSchema
]);

export const quizMcqQuestionSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("mcq"),
    prompt: z.string().min(1),
    options: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1)
      })
    ),
    answer: z.string().min(1),
    rubric: z.string().min(1).optional()
  })
  .strict();

export const quizFreeTextQuestionSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("free_text"),
    prompt: z.string().min(1),
    answer: z.string().min(1).optional(),
    rubric: z.string().min(1)
  })
  .strict();

export const quizExplainBackQuestionSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("explain_back"),
    prompt: z.string().min(1),
    rubric: z.string().min(1)
  })
  .strict();

export const quizQuestionSchema = z.discriminatedUnion("type", [
  quizMcqQuestionSchema,
  quizFreeTextQuestionSchema,
  quizExplainBackQuestionSchema
]);

export const quizSchema = z.object({
  id: z.number().int().positive(),
  topicId: z.number().int().positive(),
  sourceLessonId: z.number().int().positive().nullable(),
  questions: z.array(quizQuestionSchema).min(1),
  createdAt: z.string().min(1)
});

export const quizGenerateRequestSchema = z
  .object({
    lessonId: z.number().int().positive().optional()
  })
  .strict();

export const quizGenerateResponseSchema = z.object({
  ok: z.literal(true),
  quiz: quizSchema
});

export const quizAttemptRequestSchema = z
  .object({
    answers: z.record(z.string().min(1), z.string())
  })
  .strict();

export const quizAttemptFeedbackSchema = z.object({
  correct: z.boolean(),
  feedback: z.string().min(1),
  questionId: z.string().min(1),
  score: z.number().min(0).max(1)
});

export const quizAttemptResponseSchema = z.object({
  ok: z.literal(true),
  attempt: z.object({
    id: z.number().int().positive(),
    quizId: z.number().int().positive(),
    score: z.number().min(0).max(1),
    feedback: z.array(quizAttemptFeedbackSchema),
    createdAt: z.string().min(1)
  })
});

export const reviewItemSchema = z.object({
  id: z.number().int().positive(),
  topicId: z.number().int().positive(),
  concept: z.string().min(1),
  ease: z.number().positive(),
  intervalDays: z.number().int().positive(),
  dueAt: z.string().min(1)
});

export const topicReviewResponseSchema = z.object({
  ok: z.literal(true),
  topicId: z.number().int().positive(),
  items: z.array(reviewItemSchema)
});

export const dashboardResponseSchema = z.object({
  ok: z.literal(true),
  dueLessonCount: z.number().int().nonnegative(),
  dueReviewCount: z.number().int().nonnegative(),
  recentRecords: z.array(recordSummarySchema),
  topics: z.array(topicSummarySchema),
  nextAction: z.object({
    label: z.string().min(1),
    description: z.string().min(1),
    href: z.string().min(1).nullable()
  })
});

export const settingsResponseSchema = z.object({
  ok: z.literal(true),
  setupComplete: z.boolean(),
  workspaceDir: z.string().nullable(),
  awsProfile: z.string().nullable(),
  awsRegion: z.string().min(1),
  awsLoginCommand: z.string().min(1).nullable(),
  defaultProvider: providerSchema,
  converseModelId: z.string().nullable(),
  mantleModelId: z.string().min(1),
  mantleBaseUrl: z.string().url()
});

export const settingsUpdateSchema = z
  .object({
    defaultProvider: providerSchema.optional(),
    converseModelId: z.string().trim().min(1).optional(),
    mantleModelId: z.string().trim().min(1).optional()
  })
  .strict();

export const setupUpdateSchema = z
  .object({
    awsProfile: z
      .string()
      .trim()
      .max(128)
      .regex(/^[A-Za-z0-9_+=,.@-]*$/, "Use a valid AWS profile name."),
    awsRegion: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9-]+$/, "Use a valid AWS region.")
  })
  .strict();

export const awsModelSchema = z.object({
  modelId: z.string().min(1),
  modelName: z.string().min(1).nullable(),
  providerName: z.string().min(1).nullable(),
  inputModalities: z.array(z.string().min(1)),
  outputModalities: z.array(z.string().min(1))
});

export const awsProfileSchema = z.object({
  name: z.string().min(1),
  region: z.string().min(1).nullable()
});

export const awsProfilesResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    profiles: z.array(awsProfileSchema)
  }),
  z.object({
    ok: z.literal(false),
    message: z.string().min(1)
  })
]);

export const awsProfileCreateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_+=,.@-]+$/, "Use a valid AWS profile name."),
    ssoStartUrl: z.string().trim().url().startsWith("https://"),
    ssoRegion: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9-]+$/, "Use a valid SSO region."),
    accountId: z
      .string()
      .trim()
      .regex(/^\d{12}$/, "Use a 12-digit AWS account ID."),
    roleName: z.string().trim().min(1).max(128),
    region: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9-]+$/, "Use a valid AWS region.")
  })
  .strict();

export const awsProfileCreateResponseSchema = z.object({
  ok: z.literal(true),
  profile: awsProfileSchema
});

export const awsStatusOkSchema = z.object({
  ok: z.literal(true),
  account: z.string().min(1),
  arn: z.string().min(1),
  region: z.string().min(1),
  profile: z.string().nullable()
});

export const awsStatusErrorSchema = z.object({
  ok: z.literal(false),
  reason: awsCredentialReasonSchema,
  region: z.string().min(1),
  profile: z.string().nullable(),
  message: z.string().min(1)
});

export const awsStatusResponseSchema = z.discriminatedUnion("ok", [
  awsStatusOkSchema,
  awsStatusErrorSchema
]);

export const awsModelsOkSchema = z.object({
  ok: z.literal(true),
  region: z.string().min(1),
  profile: z.string().nullable(),
  models: z.array(awsModelSchema)
});

export const awsModelsErrorSchema = z.object({
  ok: z.literal(false),
  reason: awsCredentialReasonSchema,
  region: z.string().min(1),
  profile: z.string().nullable(),
  message: z.string().min(1)
});

export const awsModelsResponseSchema = z.discriminatedUnion("ok", [
  awsModelsOkSchema,
  awsModelsErrorSchema
]);

export const awsLoginOkSchema = z.object({
  ok: z.literal(true),
  command: z.string().min(1),
  message: z.string().min(1)
});

export const awsLoginErrorSchema = z.object({
  ok: z.literal(false),
  command: z.string().min(1),
  exitCode: z.number().int().nullable(),
  message: z.string().min(1)
});

export const awsLoginResponseSchema = z.discriminatedUnion("ok", [
  awsLoginOkSchema,
  awsLoginErrorSchema
]);

export const awsLoginRequestSchema = z
  .object({
    profile: z
      .string()
      .trim()
      .max(128)
      .regex(/^[A-Za-z0-9_+=,.@-]*$/, "Use a valid AWS profile name.")
      .optional()
  })
  .strict();

export type ProviderId = z.infer<typeof providerSchema>;
export type TopicSummary = z.infer<typeof topicSummarySchema>;
export type TopicGroup = z.infer<typeof topicGroupSchema>;
export type TopicsResponse = z.infer<typeof topicsResponseSchema>;
export type LessonStatus = z.infer<typeof lessonStatusSchema>;
export type LessonGroup = z.infer<typeof lessonGroupSchema>;
export type LessonSummary = z.infer<typeof lessonSummarySchema>;
export type RecordSummary = z.infer<typeof recordSummarySchema>;
export type RecordWithContent = z.infer<typeof recordWithContentSchema>;
export type ReferenceDocument = z.infer<typeof referenceDocumentSchema>;
export type TopicDetailResponse = z.infer<typeof topicDetailResponseSchema>;
export type TopicFileResponse = z.infer<typeof topicFileResponseSchema>;
export type TopicLessonsResponse = z.infer<typeof topicLessonsResponseSchema>;
export type LessonDeleteResponse = z.infer<typeof lessonDeleteResponseSchema>;
export type LessonGroupAssign = z.infer<typeof lessonGroupAssignSchema>;
export type LessonGroupCreate = z.infer<typeof lessonGroupCreateSchema>;
export type LessonGroupResponse = z.infer<typeof lessonGroupResponseSchema>;
export type LessonDueDateUpdate = z.infer<typeof lessonDueDateUpdateSchema>;
export type LessonStatusUpdate = z.infer<typeof lessonStatusUpdateSchema>;
export type LessonStatusResponse = z.infer<typeof lessonStatusResponseSchema>;
export type LessonTitleUpdate = z.infer<typeof lessonTitleUpdateSchema>;
export type TopicGroupAssign = z.infer<typeof topicGroupAssignSchema>;
export type TopicGroupCreate = z.infer<typeof topicGroupCreateSchema>;
export type TopicGroupResponse = z.infer<typeof topicGroupResponseSchema>;
export type TopicGroupUpdate = z.infer<typeof topicGroupUpdateSchema>;
export type TopicStatusResponse = z.infer<typeof topicStatusResponseSchema>;
export type TopicDeleteResponse = z.infer<typeof topicDeleteResponseSchema>;
export type TopicTitleUpdate = z.infer<typeof topicTitleUpdateSchema>;
export type TopicRecordsResponse = z.infer<typeof topicRecordsResponseSchema>;
export type TopicReferenceResponse = z.infer<typeof topicReferenceResponseSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatRole = z.infer<typeof chatRoleSchema>;
export type ChatSession = z.infer<typeof chatSessionSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatHistoryResponse = z.infer<typeof chatHistoryResponseSchema>;
export type ChatUsage = z.infer<typeof chatUsageSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
export type TopicCreateRequest = z.infer<typeof topicCreateRequestSchema>;
export type TopicInterviewMessage = z.infer<typeof topicInterviewMessageSchema>;
export type TopicInterviewRequest = z.infer<typeof topicInterviewRequestSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type QuizAttemptRequest = z.infer<typeof quizAttemptRequestSchema>;
export type QuizAttemptResponse = z.infer<typeof quizAttemptResponseSchema>;
export type QuizGenerateRequest = z.infer<typeof quizGenerateRequestSchema>;
export type QuizGenerateResponse = z.infer<typeof quizGenerateResponseSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
export type SetupUpdate = z.infer<typeof setupUpdateSchema>;
export type TopicReviewResponse = z.infer<typeof topicReviewResponseSchema>;
export type AwsCredentialReason = z.infer<typeof awsCredentialReasonSchema>;
export type AwsModel = z.infer<typeof awsModelSchema>;
export type AwsStatusResponse = z.infer<typeof awsStatusResponseSchema>;
export type AwsModelsResponse = z.infer<typeof awsModelsResponseSchema>;
export type AwsLoginRequest = z.infer<typeof awsLoginRequestSchema>;
export type AwsLoginResponse = z.infer<typeof awsLoginResponseSchema>;
export type AwsProfile = z.infer<typeof awsProfileSchema>;
export type AwsProfilesResponse = z.infer<typeof awsProfilesResponseSchema>;
export type AwsProfileCreate = z.infer<typeof awsProfileCreateSchema>;
export type AwsProfileCreateResponse = z.infer<typeof awsProfileCreateResponseSchema>;
