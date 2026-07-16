import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import type {
  AwsStatusResponse,
  DashboardResponse,
  SettingsResponse,
  TopicDetailResponse,
  TopicLessonsResponse,
  TopicRecordsResponse,
  TopicReferenceResponse,
  TopicsResponse
} from "@learning-hub/shared";
import { SettingsPage } from "./pages/Settings.js";
import { PracticeFeedback } from "./pages/Review.js";
import { TopicHome } from "./pages/TopicHome.js";

const topics: TopicsResponse = {
  ok: true,
  workspaceConfigured: true,
  workspaceDir: "C:/learning",
  groups: [
    {
      id: 1,
      name: "Work",
      collapsed: false
    }
  ],
  topics: [
    {
      id: 1,
      slug: "typescript-basics",
      title: "TypeScript Basics",
      groupId: 1,
      lessonCount: 2,
      completedLessonCount: 0,
      dueLessonCount: 0,
      recordCount: 1,
      resourceCount: 1,
      referenceCount: 1,
      reviewItemCount: 0,
      dueReviewCount: 0
    },
    {
      id: 2,
      slug: "half-scaffolded",
      title: "Half Scaffolded",
      groupId: null,
      lessonCount: 0,
      completedLessonCount: 0,
      dueLessonCount: 0,
      recordCount: 0,
      resourceCount: 0,
      referenceCount: 0,
      reviewItemCount: 0,
      dueReviewCount: 0
    }
  ]
};

const settings: SettingsResponse = {
  ok: true,
  setupComplete: true,
  workspaceDir: "C:/learning",
  awsProfile: "learning-dev",
  awsRegion: "us-east-2",
  awsLoginCommand: "bedrock-login",
  defaultProvider: "bedrock-converse",
  converseModelId: "us.anthropic.claude-sonnet-5",
  mantleModelId: "openai.gpt-5.6-sol",
  mantleBaseUrl: "https://bedrock-mantle.us-east-2.api.aws/openai/v1"
};

const awsOk: AwsStatusResponse = {
  ok: true,
  account: "123456789012",
  arn: "arn:aws:sts::123456789012:assumed-role/Test/User",
  region: "us-east-2",
  profile: "learning-dev"
};

const awsMissing: AwsStatusResponse = {
  ok: false,
  reason: "no_credentials",
  region: "us-east-2",
  profile: "learning-dev",
  message: "AWS credentials were not found for the configured profile."
};

const dashboard: DashboardResponse = {
  ok: true,
  dueLessonCount: 0,
  dueReviewCount: 0,
  lessonDeadlines: [
    {
      id: 1,
      topicId: 1,
      topicSlug: "typescript-basics",
      topicTitle: "TypeScript Basics",
      number: 1,
      title: "Values Before Types",
      dueAt: "2030-07-17",
      href: "/t/typescript-basics/lessons/1"
    }
  ],
  recentRecords: [],
  topics: topics.topics,
  nextAction: {
    label: "Open lesson 0001",
    description: "TypeScript Basics: Values Before Types",
    href: "/t/typescript-basics/lessons/1"
  }
};

const topicDetail: TopicDetailResponse = {
  ok: true,
  topic: topics.topics[0]!,
  mission: "# Mission: TypeScript Basics\n\n## Why\nShip a small typed local app.",
  counts: {
    lessons: 2,
    completedLessons: 0,
    records: 1,
    resources: 1,
    references: 1
  },
  recentRecords: [
    {
      id: 1,
      topicId: 1,
      number: 1,
      fileName: "0001-values.md",
      title: "Values are the runtime floor"
    }
  ],
  nextAction: {
    label: "Open lesson 0001",
    description: "Values Before Types",
    href: "/t/typescript-basics/lessons/1"
  }
};

const topicLessons: TopicLessonsResponse = {
  ok: true,
  topicId: 1,
  groups: [
    {
      id: 1,
      topicId: 1,
      name: "Core concepts"
    }
  ],
  lessons: [
    {
      id: 1,
      topicId: 1,
      number: 1,
      fileName: "0001-values.html",
      title: "Values Before Types",
      status: "unread",
      groupId: 1,
      dueAt: null
    },
    {
      id: 2,
      topicId: 1,
      number: 2,
      fileName: "0002-functions.html",
      title: "Function Inputs",
      status: "in_progress",
      groupId: null,
      dueAt: "2026-07-15"
    }
  ]
};

const topicRecords: TopicRecordsResponse = {
  ok: true,
  topicId: 1,
  records: [
    {
      id: 1,
      topicId: 1,
      number: 1,
      fileName: "0001-values.md",
      title: "Values are the runtime floor",
      content:
        "# Values are the runtime floor\n\nThe learner can explain that TypeScript checks runtime values."
    }
  ]
};

const topicReference: TopicReferenceResponse = {
  ok: true,
  topicId: 1,
  resources:
    "# TypeScript Basics Resources\n\n## Knowledge\n\n- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)",
  references: [
    {
      fileName: "glossary.html",
      title: "TypeScript Glossary"
    }
  ]
};

describe("App", () => {
  it("renders the dashboard shell with indexed topics", () => {
    const html = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/"
        initialSettings={settings}
        initialTopics={topics}
      />
    );

    expect(html).toContain("L2Anything");
    expect(html).toContain("Pick up where you left off");
    expect(html).toContain("TypeScript Basics");
    expect(html).toContain("AWS connected");
  });

  it("renders topic overflow actions on dashboard cards and sidebar rows", () => {
    const html = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/"
        initialSettings={settings}
        initialTopics={topics}
      />
    );

    expect(html).toContain('aria-label="Topic actions for TypeScript Basics"');
    expect(html).toContain('aria-label="Topic actions for Half Scaffolded"');
    expect(html).toContain('title="Topic actions"');
    expect(html).not.toContain('aria-label="Delete TypeScript Basics"');
  });

  it("shows lesson deadlines without exposing an inactive review queue", () => {
    const html = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialDashboard={dashboard}
        initialPath="/"
        initialSettings={settings}
        initialTopics={topics}
      />
    );

    expect(html).toContain("Lesson deadlines");
    expect(html).toContain("Values Before Types");
    expect(html).not.toContain("Review queue");
    expect(html).not.toContain("No recall reviews scheduled");
    expect(html).not.toContain("Due for review");
  });

  it("shows the review queue when a recall prompt is due", () => {
    const reviewTopics: TopicsResponse = {
      ...topics,
      topics: topics.topics.map((topic) =>
        topic.id === 1
          ? {
              ...topic,
              reviewItemCount: 1,
              dueReviewCount: 1
            }
          : topic
      )
    };
    const reviewDashboard: DashboardResponse = {
      ...dashboard,
      dueReviewCount: 1,
      lessonDeadlines: [],
      topics: reviewTopics.topics,
      nextAction: {
        label: "Review due items",
        description: "TypeScript Basics has 1 due review item.",
        href: "/t/typescript-basics/review"
      }
    };

    const html = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialDashboard={reviewDashboard}
        initialPath="/"
        initialSettings={settings}
        initialTopicReview={{
          1: {
            ok: true,
            topicId: 1,
            items: [
              {
                id: 1,
                topicId: 1,
                concept: "Narrow before casting",
                answerGuide: null,
                sourceLesson: null,
                ease: 2.3,
                intervalDays: 1,
                dueAt: "2026-01-01T00:00:00.000Z"
              }
            ]
          }
        }}
        initialTopics={reviewTopics}
      />
    );

    expect(html).toContain("Review queue");
    expect(html).toContain("Narrow before casting");
  });

  it("marks the mobile navigation trigger expanded when opened", () => {
    const html = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialMobileNavigationOpen
        initialPath="/"
        initialSettings={settings}
        initialTopics={topics}
      />
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="mobile-sidebar-sheet"');
  });

  it("renders active topic selection", () => {
    const html = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/t/typescript-basics"
        initialSettings={settings}
        initialTopicDetails={{ 1: topicDetail }}
        initialTopics={topics}
      />
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Mission");
    expect(html).toContain("Start lesson");
    expect(html).not.toContain("Current lesson");
    expect(html).not.toContain("0001-values.html");
    expect(html).not.toContain("Lessons completed");
    expect(html).not.toContain("of 2 generated");
  });

  it("keeps empty secondary topic sections out of the primary workflow", () => {
    const freshTopic = topics.topics[1]!;
    const html = renderToString(
      <TopicHome
        awsStatus={awsOk}
        detail={{
          ...topicDetail,
          topic: freshTopic,
          mission: "# Mission\n\nLearn by building something useful.",
          counts: {
            lessons: 0,
            completedLessons: 0,
            records: 0,
            resources: 0,
            references: 0
          },
          recentRecords: [],
          nextAction: {
            label: "Generate the first lesson",
            description: "No lesson files are indexed for this topic yet.",
            href: null
          }
        }}
        lessonGeneration={{
          activities: [],
          needsModelSettings: false,
          status: "idle"
        }}
        lessons={{ ok: true, topicId: freshTopic.id, groups: [], lessons: [] }}
        loading={false}
        onGenerateLesson={() => undefined}
        onTopicTitleChange={() => Promise.resolve()}
        route={{ name: "topic", slug: freshTopic.slug }}
        topic={freshTopic}
      />
    );

    expect(html).toContain("Generate first lesson");
    expect(html).not.toContain("Recent tutor memory");
    expect(html).not.toContain("Current lesson");
    expect(html).not.toContain("Check understanding");
  });

  it("renders topic lesson generation progress from external topic state", () => {
    const html = renderToString(
      <TopicHome
        awsStatus={awsOk}
        detail={topicDetail}
        lessonGeneration={{
          activities: [
            {
              id: "fetch-url-1",
              label: "Fetch Url",
              name: "fetch_url",
              status: "running"
            }
          ],
          needsModelSettings: false,
          status: "streaming"
        }}
        lessons={topicLessons}
        loading={false}
        onGenerateLesson={() => undefined}
        onTopicTitleChange={() => Promise.resolve()}
        route={{ name: "topic", slug: "typescript-basics" }}
        topic={topics.topics[0]}
      />
    );

    expect(html).toContain("Lesson under construction");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Researching sources");
  });

  it("keeps sidebar group movement inside topic overflow menus", () => {
    const html = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/"
        initialSettings={settings}
        initialTopics={topics}
      />
    );

    expect(html).toContain('aria-label="Topic actions for TypeScript Basics"');
    expect(html).toContain('aria-label="Add topic to Work"');
    expect(html).toContain('aria-label="Group actions for Work"');
    expect(html).toContain("Ungrouped");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<option");

    const emptyGroupHtml = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/"
        initialSettings={settings}
        initialTopics={{
          ...topics,
          groups: [...topics.groups, { id: 2, name: "Personal", collapsed: false }]
        }}
      />
    );

    expect(emptyGroupHtml).toContain("Personal");
    expect(emptyGroupHtml).toContain("No topics in this group yet.");
    expect(emptyGroupHtml).toContain('aria-label="Add topic to Personal"');
  });

  it("progressively discloses topic tabs as content exists", () => {
    const freshHtml = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/t/half-scaffolded"
        initialSettings={settings}
        initialTopics={topics}
      />
    );

    expect(freshHtml).toContain('href="/t/half-scaffolded/lessons"');
    expect(freshHtml).not.toContain('href="/t/half-scaffolded/chat"');
    expect(freshHtml).not.toContain('href="/t/half-scaffolded/resources"');
    expect(freshHtml).not.toContain('href="/t/half-scaffolded/review"');
    expect(freshHtml).not.toContain('href="/t/half-scaffolded/records"');

    const startedHtml = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/t/typescript-basics"
        initialSettings={settings}
        initialTopicDetails={{ 1: topicDetail }}
        initialTopics={topics}
      />
    );

    expect(startedHtml).toContain('href="/t/typescript-basics/lessons"');
    expect(startedHtml).toContain('href="/t/typescript-basics/records"');
    expect(startedHtml).toContain('href="/t/typescript-basics/resources"');
    expect(startedHtml).not.toContain('href="/t/typescript-basics/chat"');
    expect(startedHtml).not.toContain('href="/t/typescript-basics/review"');
  });

  it("keeps a hidden tab reachable through a deep link", () => {
    const html = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/t/half-scaffolded/review"
        initialSettings={settings}
        initialTopics={topics}
      />
    );

    expect(html).toContain('href="/t/half-scaffolded/review"');
    expect(html).toContain('aria-current="page"');
  });

  it("keeps review scheduling details behind the learner-facing recall task", () => {
    const reviewTopic = {
      ...topics.topics[0]!,
      reviewItemCount: 2,
      dueReviewCount: 2
    };
    const html = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/t/typescript-basics/review"
        initialSettings={settings}
        initialTopicReview={{
          1: {
            ok: true,
            topicId: 1,
            items: [
              {
                id: 1,
                topicId: 1,
                concept: "Narrow before casting",
                answerGuide: "Narrow the unknown value before using a type assertion.",
                sourceLesson: {
                  id: 10,
                  number: 1,
                  title: "Values Before Types"
                },
                ease: 2.3,
                intervalDays: 1,
                dueAt: "2026-01-01T00:00:00.000Z"
              },
              {
                id: 2,
                topicId: 1,
                concept: "Values exist at runtime",
                answerGuide: null,
                sourceLesson: null,
                ease: 2.7,
                intervalDays: 7,
                dueAt: "2026-01-02T00:00:00.000Z"
              }
            ]
          }
        }}
        initialTopics={{ ...topics, topics: [reviewTopic, topics.topics[1]!] }}
      />
    );

    expect(html.replaceAll("<!-- -->", "")).toContain("Concept 1 of 2");
    expect(html).toContain("Check answer");
    expect(html).toContain("View queue");
    expect(html).not.toContain("Next concept");
    expect(html).not.toContain("Narrow the unknown value");
    expect(html).not.toContain("Ease");
    expect(html).not.toContain("interval");
    expect(html).not.toContain("Strength");
  });

  it("renders grounded Practice feedback and a legacy fallback", () => {
    const groundedHtml = renderToString(
      <PracticeFeedback
        item={{
          id: 1,
          topicId: 1,
          concept: "Narrow before casting",
          answerGuide: "Narrow the unknown value before using a type assertion.",
          sourceLesson: {
            id: 10,
            number: 1,
            title: "Values Before Types"
          },
          ease: 2.3,
          intervalDays: 1,
          dueAt: "2026-01-01T00:00:00.000Z"
        }}
        topic={topics.topics[0]!}
      />
    );
    const fallbackHtml = renderToString(
      <PracticeFeedback
        item={{
          id: 2,
          topicId: 1,
          concept: "Legacy concept",
          answerGuide: null,
          sourceLesson: null,
          ease: 2.5,
          intervalDays: 1,
          dueAt: "2026-01-01T00:00:00.000Z"
        }}
        topic={topics.topics[0]!}
      />
    );

    expect(groundedHtml).toContain("What to look for");
    expect(groundedHtml).toContain("Narrow the unknown value");
    expect(groundedHtml).toContain('href="/t/typescript-basics/lessons/1"');
    expect(groundedHtml).toContain("Open lesson");
    expect(fallbackHtml).toContain("Compare your explanation with the lesson");
    expect(fallbackHtml).not.toContain("Open lesson");
  });

  it("shows a loading shell instead of topic-not-found while topic routes load", () => {
    const html = renderToString(<App initialPath="/t/typescript-basics" />);

    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Topic not found");
  });

  it("renders lesson list and sandboxed lesson iframe route", () => {
    const listHtml = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/t/typescript-basics/lessons"
        initialSettings={settings}
        initialTopicDetails={{ 1: topicDetail }}
        initialTopicLessons={{ 1: topicLessons }}
        initialTopics={topics}
      />
    );

    expect(listHtml).toContain("Values Before Types");
    expect(listHtml).not.toContain("Mark complete");
    expect(listHtml).not.toContain("Lesson 1 of");
    expect(listHtml).not.toContain("0 of 2 complete");
    expect(listHtml).not.toContain("generated");
    expect(listHtml).not.toContain("Status");
    expect(listHtml).not.toContain("0001-values.html");
    expect(listHtml).toContain("Start lesson");
    expect(listHtml).toContain("Continue lesson");
    expect(listHtml).toContain('aria-label="Lesson actions for Values Before Types"');
    expect(listHtml).toContain('aria-label="Lesson actions for Function Inputs"');

    const lessonHtml = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/t/typescript-basics/lessons/1"
        initialSettings={settings}
        initialTopicDetails={{ 1: topicDetail }}
        initialTopicLessons={{ 1: topicLessons }}
        initialTopics={topics}
      />
    );

    expect(lessonHtml).toContain('sandbox="allow-scripts"');
    expect(lessonHtml).not.toContain("allow-same-origin");
    expect(lessonHtml).toContain("/api/topics/1/lessons/0001-values.html");
    expect(lessonHtml).toContain("Ask Tutor");
    expect(lessonHtml).not.toContain("Ask the tutor anything about this topic.");
    expect(lessonHtml).toContain("Start knowledge check");
    expect(lessonHtml).toContain('aria-label="Lesson actions"');
    expect(lessonHtml).not.toContain("Check understanding");
    expect(lessonHtml).not.toContain(">Complete<");
    expect(lessonHtml).not.toContain("Finish this lesson");
    expect(lessonHtml).not.toContain("Try the exercise");
    expect(lessonHtml).not.toContain("Mark complete");
  });

  it("renders records, resources, and references", () => {
    const recordsHtml = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/t/typescript-basics/records"
        initialSettings={settings}
        initialTopicDetails={{ 1: topicDetail }}
        initialTopicRecords={{ 1: topicRecords }}
        initialTopics={topics}
      />
    );

    expect(recordsHtml).toContain("Tutor memory");
    expect(recordsHtml).toContain("Used for future lessons");
    expect(recordsHtml).toContain("Values are the runtime floor");
    expect(recordsHtml).not.toContain("0001-values.md");

    const resourcesHtml = renderToString(
      <App
        initialAwsStatus={awsOk}
        initialPath="/t/typescript-basics/resources"
        initialSettings={settings}
        initialTopicDetails={{ 1: topicDetail }}
        initialTopicReference={{ 1: topicReference }}
        initialTopics={topics}
      />
    );

    expect(resourcesHtml).toContain("TypeScript Glossary");
    expect(resourcesHtml).toContain("Study library");
    expect(resourcesHtml).toContain("View sources");
    expect(resourcesHtml).not.toContain(">Preview<");
    expect(resourcesHtml).toContain('sandbox="allow-scripts"');
  });

  it("shows settings and disables provider actions when AWS is unavailable", () => {
    const html = renderToString(
      <App
        initialAwsStatus={awsMissing}
        initialPath="/settings"
        initialSettings={settings}
        initialTopics={topics}
      />
    );

    expect(html).toContain("AWS connection and model routing");
    expect(html).toContain("AWS credentials missing");
    expect(html).toContain("Run login");
    expect(html).toContain("Change profile");
    expect(html).toContain("Advanced model routing");
    expect(html).not.toContain("Refresh models");
    expect(html).not.toContain("Bedrock model list");
    expect(html).toContain("us.anthropic.claude-sonnet-5");
    expect(html).toContain("Sonnet 5 is used automatically");
    expect(html).not.toContain("Bedrock Mantle model");
    expect(html).toContain("Save advanced settings");
  });

  it("shows first-run setup before the application shell", () => {
    const html = renderToString(
      <App
        initialPath="/"
        initialSettings={{
          ...settings,
          setupComplete: false,
          workspaceDir: "C:/L2Anything/local-learning-hub"
        }}
      />
    );

    expect(html).toContain("Connect your AWS account");
    expect(html).toContain("Create a new SSO profile");
    expect(html).toContain("Setup verifies identity and Bedrock Converse access");
    expect(html).toContain("Verify and open L2Anything");
    expect(html).not.toContain("C:/L2Anything/local-learning-hub");
    expect(html).not.toContain("Claude Sonnet 5");
    expect(html).not.toContain("Sign in with AWS");
    expect(html).not.toContain("Dashboard");
  });

  it("shows the Bedrock Mantle model field only for the Mantle provider", () => {
    const html = renderToString(
      <SettingsPage
        awsLoginStatus="idle"
        awsStatus={awsOk}
        onAwsLogin={() => undefined}
        onSaveSettings={() => undefined}
        settings={{
          ...settings,
          defaultProvider: "bedrock-mantle"
        }}
      />
    );

    expect(html).toContain("Bedrock Mantle model");
    expect(html).not.toContain("Bedrock Converse model");
    expect(html).toContain("openai.gpt-5.6-sol");
  });

  it("shows the fixed Bedrock Converse Sonnet 5 default without a model picker", () => {
    const html = renderToString(
      <SettingsPage
        awsLoginStatus="idle"
        awsStatus={awsOk}
        onAwsLogin={() => undefined}
        onSaveSettings={() => undefined}
        settings={{
          ...settings,
          defaultProvider: "bedrock-converse"
        }}
      />
    );

    expect(html).not.toContain("Refresh models");
    expect(html).not.toContain("Bedrock model list");
    expect(html).not.toContain("Model dropdown");
    expect(html).not.toContain("ListFoundationModels");
    expect(html).not.toContain("Login command");
    expect(html).not.toContain("Run AWS login");
    expect(html).toContain("us.anthropic.claude-sonnet-5");
    expect(html).toContain("Sonnet 5 is used automatically");
  });
});
