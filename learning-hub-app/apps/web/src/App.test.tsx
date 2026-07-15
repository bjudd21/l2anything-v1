import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import type {
  AwsStatusResponse,
  SettingsResponse,
  TopicDetailResponse,
  TopicLessonsResponse,
  TopicRecordsResponse,
  TopicReferenceResponse,
  TopicsResponse
} from "@learning-hub/shared";
import { SettingsPage } from "./pages/Settings.js";
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
  workspaceDir: "C:/learning",
  awsProfile: "learning-dev",
  awsRegion: "us-east-2",
  awsLoginCommand: "bedrock-login",
  defaultProvider: "bedrock-converse",
  converseModelId: null,
  mantleModelId: "openai.gpt-5.5",
  mantleBaseUrl: "https://bedrock-mantle.us-east-2.api.aws/openai/v1",
  tavilyConfigured: false
};

const awsOk: AwsStatusResponse = {
  ok: true,
  account: "000000000000",
  arn: "arn:aws:sts::000000000000:assumed-role/Test/User",
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

    expect(html).toContain("Learning Hub");
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

  it("renders the mobile navigation sheet when opened", () => {
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
    expect(html).toContain('id="mobile-sidebar-sheet"');
    expect(html).toContain("Navigation");
    expect(html).toContain("Close");
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
    expect(html).toContain("Open lesson 0001");
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
        onStatusChange={() => undefined}
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
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<option");
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
    expect(listHtml).toContain("Not done");
    expect(listHtml).not.toContain("Status");

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
    expect(lessonHtml).toContain("Knows lesson 1 and your topic files.");
    expect(lessonHtml).toContain("Ask the tutor anything about this topic.");
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

    expect(recordsHtml).toContain("Learning records");
    expect(recordsHtml).toContain("Values are the runtime floor");

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

    expect(resourcesHtml).toContain("TypeScript Handbook");
    expect(resourcesHtml).toContain("TypeScript Glossary");
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

    expect(html).toContain("Local setup");
    expect(html).toContain("AWS credentials missing");
    expect(html).toContain("Run AWS login");
    expect(html).toContain("Learning workspace");
    expect(html).toContain("Advanced model routing");
    expect(html).not.toContain("Refresh models");
    expect(html).not.toContain("Bedrock model list");
    expect(html).toContain("Bedrock Converse model");
    expect(html).toContain("us.anthropic.claude-sonnet-5");
    expect(html).not.toContain("Bedrock Mantle model");
    expect(html).toContain("Save advanced settings");
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
    expect(html).toContain("openai.gpt-5.5");
  });

  it("shows the fixed Bedrock Converse Sonnet 5 default without a model picker", () => {
    const html = renderToString(
      <SettingsPage
        awsLoginStatus="idle"
        awsStatus={awsOk}
        onAwsLogin={() => undefined}
        onSaveSettings={() => undefined}
        settings={settings}
      />
    );

    expect(html).not.toContain("Refresh models");
    expect(html).not.toContain("Bedrock model list");
    expect(html).not.toContain("Model dropdown");
    expect(html).not.toContain("ListFoundationModels");
    expect(html).toContain("us.anthropic.claude-sonnet-5");
    expect(html).toContain("Sonnet 5 is used automatically");
  });
});
