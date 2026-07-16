import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatStreamEvent } from "@learning-hub/shared";
import { eq } from "drizzle-orm";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { createSqliteConnection } from "../db/client.js";
import { lessonsIndex, quizzes, reviewItems, topics } from "../db/schema.js";
import type { ChatProvider, ChatProviderRequest } from "../llm/types.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "learning-hub-fixture"
);
const tempDirs: string[] = [];

function testConfig(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({
    AWS_REGION: "us-east-2",
    LEARNING_HUB_DIR: "",
    AWS_PROFILE: "",
    DEFAULT_PROVIDER: undefined,
    CONVERSE_MODEL_ID: "",
    MANTLE_MODEL_ID: "",
    MANTLE_BASE_URL: "",
    TAVILY_API_KEY: "",
    PORT: "",
    ...overrides
  });
}

function makeFixtureCopy() {
  const root = mkdtempSync(join(tmpdir(), "learning-hub-generation-"));
  tempDirs.push(root);
  cpSync(fixtureRoot, root, { recursive: true });
  return root;
}

function parseSse(text: string): ChatStreamEvent[] {
  return text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((packet) => {
      const dataLine = packet.split(/\n/).find((line) => line.startsWith("data: "));

      if (!dataLine) {
        throw new Error(`SSE packet did not include data: ${packet}`);
      }

      return JSON.parse(dataLine.slice("data: ".length)) as ChatStreamEvent;
    });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function hashDirectory(directory: string) {
  const hash = createHash("sha256");

  function visit(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const path = join(current, entry.name);
      hash.update(path.slice(directory.length));

      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        hash.update(readFileSync(path));
      }
    }
  }

  visit(directory);
  return hash.digest("hex");
}

async function indexedTopicId(app: ReturnType<typeof createApp>, slug = "typescript-basics") {
  const response = await app.request("/api/topics");
  const body = (await response.json()) as {
    topics: Array<{ id: number; slug: string }>;
  };
  const topic = body.topics.find((item) => item.slug === slug);

  if (!topic) {
    throw new Error(`Topic ${slug} was not indexed.`);
  }

  return topic.id;
}

describe("topics routes", () => {
  it("lists indexed fixture topics for the shell", async () => {
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }));
    const response = await app.request("/api/topics");

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      workspaceConfigured: boolean;
      topics: Array<{ slug: string; lessonCount: number; recordCount: number }>;
    };

    expect(body.workspaceConfigured).toBe(true);
    expect(body.topics.map((topic) => topic.slug)).toEqual([
      "half-scaffolded",
      "typescript-basics"
    ]);
    expect(body.topics.find((topic) => topic.slug === "typescript-basics")).toMatchObject({
      lessonCount: 2,
      recordCount: 1,
      reviewItemCount: 0,
      dueReviewCount: 0
    });
  });

  it("returns an empty configured state when LEARNING_HUB_DIR is missing", async () => {
    const app = createApp(testConfig());
    const response = await app.request("/api/topics");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workspaceConfigured: false,
      workspaceDir: null,
      topics: []
    });
  });

  it("creates a teach-skill-compatible topic scaffold through the API", async () => {
    const root = mkdtempSync(join(tmpdir(), "learning-hub-topic-create-"));
    tempDirs.push(root);
    const app = createApp(testConfig({ LEARNING_HUB_DIR: root }));

    const response = await app.request("/api/topics", {
      method: "POST",
      body: JSON.stringify({
        slug: "rust-cli",
        title: "Rust CLI"
      }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      topics: [
        {
          slug: "rust-cli",
          title: "Rust CLI"
        }
      ]
    });
    expect(existsSync(join(root, "rust-cli", "MISSION.md"))).toBe(true);
    expect(readFileSync(join(root, "rust-cli", "MISSION.md"), "utf8")).toContain(
      "# Mission: Rust CLI"
    );
    expect(existsSync(join(root, "rust-cli", "lessons"))).toBe(true);
    expect(existsSync(join(root, "rust-cli", "learning-records"))).toBe(true);
    expect(existsSync(join(root, "rust-cli", "reference"))).toBe(true);
  });

  it("streams the new-topic mission interview through the configured chat provider", async () => {
    const capturedRequests: ChatProviderRequest[] = [];
    const provider: ChatProvider = {
      id: "bedrock-converse",
      async *streamChat(request) {
        await Promise.resolve();
        capturedRequests.push(request);
        yield { type: "text_delta", text: "What deadline or first project should shape this?" };
        yield { type: "done", stopReason: "end_turn" };
      }
    };
    const app = createApp(testConfig(), { chatProvider: provider });

    const response = await app.request("/api/topics/interview", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "I want to learn Japanese so I can read manga."
          }
        ]
      }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(response.status).toBe(200);
    const events = parseSse(await response.text());
    expect(events).toEqual([
      {
        type: "text_delta",
        text: "What deadline or first project should shape this?"
      },
      {
        type: "done",
        stopReason: "end_turn"
      }
    ]);
    expect(capturedRequests[0]).toMatchObject({
      messages: [
        {
          role: "user",
          content: "I want to learn Japanese so I can read manga."
        }
      ],
      tools: []
    });
    expect(capturedRequests[0]?.system).toContain("L2Anything mission interviewer");
    expect(capturedRequests[0]?.system).toContain("MISSION.md");
    expect(capturedRequests[0]?.system).toContain("<TOPIC_TITLE>Clean topic title</TOPIC_TITLE>");
  });

  it("creates a topic from a mission interview and stores the transcript", async () => {
    const root = mkdtempSync(join(tmpdir(), "learning-hub-topic-interview-"));
    tempDirs.push(root);
    const app = createApp(testConfig({ LEARNING_HUB_DIR: root }));

    const response = await app.request("/api/topics", {
      method: "POST",
      body: JSON.stringify({
        slug: "read-japanese",
        title: "Read Japanese",
        interviewMessages: [
          {
            role: "user",
            content: "I want to learn Japanese so I can read manga without translations."
          },
          {
            role: "assistant",
            content: "What would count as a useful first win?"
          },
          {
            role: "user",
            content: "Reading one short slice-of-life page with a dictionary would be a win."
          }
        ]
      }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      topics: [
        {
          slug: "read-japanese",
          title: "Read Japanese"
        }
      ]
    });

    const mission = readFileSync(join(root, "read-japanese", "MISSION.md"), "utf8");
    const notes = readFileSync(join(root, "read-japanese", "NOTES.md"), "utf8");

    expect(mission).toContain("# Mission: Read Japanese");
    expect(mission).toContain("read manga without translations");
    expect(mission).toContain("Success looks like");
    expect(notes).toContain("Mission interview transcript");
    expect(notes).toContain("Reading one short slice-of-life page");
  });

  it("returns topic detail with mission, counts, recent records, and next action", async () => {
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }));
    const topicId = await indexedTopicId(app);
    const response = await app.request(`/api/topics/${topicId}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      topic: {
        slug: "typescript-basics",
        title: "TypeScript Basics",
        lessonCount: 2,
        recordCount: 1
      },
      counts: {
        lessons: 2,
        completedLessons: 0,
        records: 1,
        resources: 1,
        references: 1
      },
      nextAction: {
        label: "Open lesson 0001",
        href: "/t/typescript-basics/lessons/1"
      }
    });
  });

  it("returns clean responses for topic workspace files and missing files", async () => {
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }));
    const typeScriptTopicId = await indexedTopicId(app);
    const mission = await app.request(`/api/topics/${typeScriptTopicId}/files/mission`);

    expect(mission.status).toBe(200);
    await expect(mission.json()).resolves.toMatchObject({
      ok: true,
      kind: "mission",
      fileName: "MISSION.md"
    });

    const halfScaffoldedTopicId = await indexedTopicId(app, "half-scaffolded");
    const missing = await app.request(`/api/topics/${halfScaffoldedTopicId}/files/resources`);

    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      ok: false,
      error: "not_found"
    });
  });

  it("lists lessons and serves lesson HTML with a CSP sandbox", async () => {
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }));
    const topicId = await indexedTopicId(app);
    const lessons = await app.request(`/api/topics/${topicId}/lessons`);

    expect(lessons.status).toBe(200);
    const lessonsBody = (await lessons.json()) as {
      lessons: Array<{ number: number; fileName: string; status: string; title: string }>;
    };

    expect(lessonsBody.lessons.map((lesson) => [lesson.number, lesson.status])).toEqual([
      [1, "unread"],
      [2, "unread"]
    ]);

    const lessonHtml = await app.request(
      `/api/topics/${topicId}/lessons/${lessonsBody.lessons[0]?.fileName}`
    );

    expect(lessonHtml.status).toBe(200);
    expect(lessonHtml.headers.get("content-type")).toContain("text/html");
    expect(lessonHtml.headers.get("content-security-policy")).toContain("sandbox");
    expect(lessonHtml.headers.get("content-security-policy")).not.toContain("allow-same-origin");
    const lessonHtmlText = await lessonHtml.text();
    expect(lessonHtmlText).toContain("<title>Values Before Types</title>");
    expect(lessonHtmlText).toContain('name="viewport"');
    expect(lessonHtmlText).toContain("learning-hub-lesson-theme");
    expect(lessonHtmlText).toContain("min-width: 0 !important;");
  });

  it("renames, groups, and deletes lesson files", async () => {
    const root = makeFixtureCopy();
    const app = createApp(testConfig({ LEARNING_HUB_DIR: root }));
    const topicId = await indexedTopicId(app);

    const groupResponse = await app.request(`/api/topics/${topicId}/lesson-groups`, {
      method: "POST",
      body: JSON.stringify({ name: "Project Alpha" }),
      headers: {
        "content-type": "application/json"
      }
    });
    const groupBody = (await groupResponse.json()) as { group: { id: number; name: string } };

    expect(groupResponse.status).toBe(201);
    expect(groupBody.group.name).toBe("Project Alpha");

    const groupedResponse = await app.request(`/api/topics/${topicId}/lessons/1/group`, {
      method: "PUT",
      body: JSON.stringify({ groupId: groupBody.group.id }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(groupedResponse.status).toBe(200);
    await expect(groupedResponse.json()).resolves.toMatchObject({
      ok: true,
      lesson: {
        number: 1,
        groupId: groupBody.group.id
      }
    });

    const renameResponse = await app.request(`/api/topics/${topicId}/lessons/1/title`, {
      method: "PUT",
      body: JSON.stringify({ title: "Runtime Values" }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(renameResponse.status).toBe(200);
    await expect(renameResponse.json()).resolves.toMatchObject({
      ok: true,
      lesson: {
        number: 1,
        title: "Runtime Values"
      }
    });

    const renamedHtmlPath = join(root, "typescript-basics", "lessons", "0001-values.html");
    const renamedHtml = readFileSync(renamedHtmlPath, "utf8");
    expect(renamedHtml).toContain("<title>Runtime Values</title>");
    expect(renamedHtml).toContain("<h1>Runtime Values</h1>");

    const lessons = await app.request(`/api/topics/${topicId}/lessons`);
    const lessonsBody = (await lessons.json()) as {
      groups: Array<{ name: string }>;
      lessons: Array<{ groupId: number | null; number: number; title: string }>;
    };

    expect(lessonsBody.groups.map((group) => group.name)).toEqual(["Project Alpha"]);
    expect(lessonsBody.lessons.find((lesson) => lesson.number === 1)).toMatchObject({
      groupId: groupBody.group.id,
      title: "Runtime Values"
    });

    const deleteResponse = await app.request(`/api/topics/${topicId}/lessons/1`, {
      method: "DELETE"
    });

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      ok: true,
      lessonNumber: 1
    });
    expect(existsSync(renamedHtmlPath)).toBe(false);

    const afterDelete = await app.request(`/api/topics/${topicId}/lessons`);
    const afterDeleteBody = (await afterDelete.json()) as {
      lessons: Array<{ number: number }>;
    };
    expect(afterDeleteBody.lessons.map((lesson) => lesson.number)).toEqual([2]);
  });

  it("creates sidebar topic groups and display-only topic titles", async () => {
    const root = makeFixtureCopy();
    const app = createApp(testConfig({ LEARNING_HUB_DIR: root }));
    const topicId = await indexedTopicId(app);
    const beforeHash = hashDirectory(root);

    const groupResponse = await app.request("/api/topics/groups", {
      method: "POST",
      body: JSON.stringify({ name: "Work" }),
      headers: {
        "content-type": "application/json"
      }
    });
    const groupBody = (await groupResponse.json()) as { group: { id: number; name: string } };

    expect(groupResponse.status).toBe(201);
    expect(groupBody.group.name).toBe("Work");

    const moveResponse = await app.request(`/api/topics/${topicId}/group`, {
      method: "PUT",
      body: JSON.stringify({ groupId: groupBody.group.id }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(moveResponse.status).toBe(200);
    await expect(moveResponse.json()).resolves.toMatchObject({
      ok: true,
      topic: {
        id: topicId,
        groupId: groupBody.group.id
      }
    });

    const renameResponse = await app.request(`/api/topics/${topicId}/title`, {
      method: "PUT",
      body: JSON.stringify({ title: "TS Runtime Basics" }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(renameResponse.status).toBe(200);
    await expect(renameResponse.json()).resolves.toMatchObject({
      ok: true,
      topic: {
        id: topicId,
        title: "TS Runtime Basics",
        groupId: groupBody.group.id
      }
    });

    const groupRenameResponse = await app.request(`/api/topics/groups/${groupBody.group.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "Projects" }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(groupRenameResponse.status).toBe(200);
    await expect(groupRenameResponse.json()).resolves.toMatchObject({
      ok: true,
      group: {
        id: groupBody.group.id,
        name: "Projects"
      }
    });

    const collapseResponse = await app.request(`/api/topics/groups/${groupBody.group.id}`, {
      method: "PUT",
      body: JSON.stringify({ collapsed: true }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(collapseResponse.status).toBe(200);
    await expect(collapseResponse.json()).resolves.toMatchObject({
      ok: true,
      group: {
        id: groupBody.group.id,
        collapsed: true
      }
    });

    const topicsResponse = await app.request("/api/topics");
    const topicsBody = (await topicsResponse.json()) as {
      groups: Array<{ collapsed: boolean; id: number; name: string }>;
      topics: Array<{ groupId: number | null; id: number; title: string }>;
    };

    expect(topicsBody.groups).toEqual([
      {
        id: groupBody.group.id,
        name: "Projects",
        collapsed: true
      }
    ]);
    expect(topicsBody.topics.find((topic) => topic.id === topicId)).toMatchObject({
      title: "TS Runtime Basics",
      groupId: groupBody.group.id
    });

    const detail = await app.request(`/api/topics/${topicId}`);
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      topic: {
        title: "TS Runtime Basics",
        groupId: groupBody.group.id
      }
    });

    const deleteGroupResponse = await app.request(`/api/topics/groups/${groupBody.group.id}`, {
      method: "DELETE"
    });

    expect(deleteGroupResponse.status).toBe(200);
    await expect(deleteGroupResponse.json()).resolves.toEqual({
      ok: true,
      groupId: groupBody.group.id
    });

    const afterDeleteResponse = await app.request("/api/topics");
    const afterDeleteBody = (await afterDeleteResponse.json()) as {
      groups: Array<{ id: number }>;
      topics: Array<{ groupId: number | null; id: number }>;
    };

    expect(afterDeleteBody.groups).toEqual([]);
    expect(afterDeleteBody.topics.find((topic) => topic.id === topicId)?.groupId).toBeNull();
    expect(hashDirectory(root)).toBe(beforeHash);
  });

  it("deletes a topic folder and removes it from indexed topics", async () => {
    const root = makeFixtureCopy();
    const app = createApp(testConfig({ LEARNING_HUB_DIR: root }));
    const topicId = await indexedTopicId(app, "half-scaffolded");
    const topicDir = join(root, "half-scaffolded");

    expect(existsSync(topicDir)).toBe(true);

    const deleteResponse = await app.request(`/api/topics/${topicId}`, {
      method: "DELETE"
    });

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      ok: true,
      topicId,
      slug: "half-scaffolded"
    });
    expect(existsSync(topicDir)).toBe(false);

    const topicsResponse = await app.request("/api/topics");
    const topicsBody = (await topicsResponse.json()) as {
      topics: Array<{ slug: string }>;
    };

    expect(topicsBody.topics.map((topic) => topic.slug)).toEqual(["typescript-basics"]);

    const missingResponse = await app.request(`/api/topics/${topicId}`, {
      method: "DELETE"
    });

    expect(missingResponse.status).toBe(404);
  });

  it("tracks lesson finish dates separately from review due dates", async () => {
    const root = makeFixtureCopy();
    const app = createApp(testConfig({ LEARNING_HUB_DIR: root }));
    const topicId = await indexedTopicId(app);
    const beforeHash = hashDirectory(root);

    const dueResponse = await app.request(`/api/topics/${topicId}/lessons/1/due-date`, {
      method: "PUT",
      body: JSON.stringify({ dueAt: "2026-01-01" }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(dueResponse.status).toBe(200);
    await expect(dueResponse.json()).resolves.toMatchObject({
      ok: true,
      lesson: {
        number: 1,
        dueAt: "2026-01-01"
      }
    });

    const topicsResponse = await app.request("/api/topics");
    await expect(topicsResponse.json()).resolves.toMatchObject({
      topics: [
        {},
        {
          slug: "typescript-basics",
          dueLessonCount: 1,
          dueReviewCount: 0
        }
      ]
    });

    const dashboardResponse = await app.request("/api/dashboard");
    await expect(dashboardResponse.json()).resolves.toMatchObject({
      dueLessonCount: 1,
      dueReviewCount: 0,
      nextAction: {
        label: "Finish lesson 0001",
        href: "/t/typescript-basics/lessons/1"
      }
    });

    const completeResponse = await app.request(`/api/topics/${topicId}/lessons/1/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "completed" }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(completeResponse.status).toBe(200);

    const afterComplete = await app.request("/api/topics");
    const afterCompleteBody = (await afterComplete.json()) as {
      topics: Array<{ dueLessonCount: number; slug: string }>;
    };
    expect(
      afterCompleteBody.topics.find((topic) => topic.slug === "typescript-basics")?.dueLessonCount
    ).toBe(0);
    expect(hashDirectory(root)).toBe(beforeHash);
  });

  it("streams lesson generation artifacts and indexes newly written files", async () => {
    const root = makeFixtureCopy();
    const requests: ChatProviderRequest[] = [];
    const provider: ChatProvider = {
      id: "bedrock-converse",
      async *streamChat(request) {
        await Promise.resolve();
        requests.push(request);

        if (requests.length === 1) {
          yield {
            type: "tool_call",
            id: "tool-lesson",
            name: "write_lesson",
            input: {
              title: "Values in Practice",
              html: [
                "<!doctype html><html><head><title>Values in Practice</title>",
                "<style>body{font-family:sans-serif}</style></head><body>",
                '<main><a href="https://www.typescriptlang.org/docs/">TypeScript Handbook</a>',
                '<pre><code class="language-ts">const value: string = "runtime";\nconsole.log(value);</code></pre>',
                "<button id=\"check\">Check</button><script>document.getElementById('check')</script>",
                "<p>Explain it back in one sentence.</p></main></body></html>"
              ].join("")
            },
            rawInput: "{}"
          };
          yield {
            type: "tool_call",
            id: "tool-record",
            name: "write_learning_record",
            input: {
              title: "Generated Understanding",
              markdown: "The learner is ready for value-level examples."
            },
            rawInput: "{}"
          };
          yield { type: "done", stopReason: "tool_use" };
          return;
        }

        yield { type: "text_delta", text: "Generated the next lesson." };
        yield { type: "done", stopReason: "end_turn" };
      }
    };
    const app = createApp(testConfig({ LEARNING_HUB_DIR: root }), { chatProvider: provider });
    const topicId = await indexedTopicId(app);

    for (const lessonNumber of [1, 2]) {
      const completeResponse = await app.request(
        `/api/topics/${topicId}/lessons/${lessonNumber}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ status: "completed" }),
          headers: {
            "content-type": "application/json"
          }
        }
      );

      expect(completeResponse.status).toBe(200);
    }

    const response = await app.request(`/api/topics/${topicId}/lessons/generate`, {
      method: "POST"
    });
    const events = parseSse(await response.text());

    expect(response.status).toBe(200);
    expect(events.map((event) => event.type)).toEqual([
      "tool_started",
      "tool_finished",
      "artifact_created",
      "done"
    ]);
    expect(events[2]).toMatchObject({
      type: "artifact_created",
      kind: "lesson",
      ref: "0003-values-in-practice.html"
    });
    expect(events[3]).toMatchObject({
      type: "done",
      stopReason: "lesson_written"
    });
    expect(requests[0]?.messages[0]?.content).toContain("self-contained HTML");
    expect(requests[0]?.messages[0]?.content).toContain("web_search is unavailable");
    expect(
      existsSync(join(root, "typescript-basics", "lessons", "0003-values-in-practice.html"))
    ).toBe(true);
    expect(
      existsSync(
        join(root, "typescript-basics", "learning-records", "0002-generated-understanding.md")
      )
    ).toBe(false);

    const lessons = await app.request(`/api/topics/${topicId}/lessons`);
    expect(lessons.status).toBe(200);
    const lessonsBody = (await lessons.json()) as {
      lessons: Array<{ fileName: string; number: number; title: string }>;
    };
    expect(lessonsBody.lessons.map((lesson) => lesson.number)).toEqual([1, 2, 3]);

    const generatedLesson = lessonsBody.lessons.find((lesson) => lesson.number === 3);
    const generatedLessonHtml = await app.request(
      `/api/topics/${topicId}/lessons/${generatedLesson?.fileName}`
    );
    const generatedLessonText = await generatedLessonHtml.text();

    expect(generatedLessonHtml.status).toBe(200);
    expect(generatedLessonText).toContain('data-learning-hub-highlight="shiki"');
    expect(generatedLessonText).toContain('class="shiki');
    expect(generatedLessonText).toContain("const");
    expect(generatedLessonText).not.toContain("cdnjs.cloudflare.com");
  });

  it("blocks next lesson generation until current lessons are completed", async () => {
    const root = makeFixtureCopy();
    const requests: ChatProviderRequest[] = [];
    const provider: ChatProvider = {
      id: "bedrock-converse",
      async *streamChat(request) {
        await Promise.resolve();
        requests.push(request);
        yield { type: "done", stopReason: "end_turn" };
      }
    };
    const app = createApp(testConfig({ LEARNING_HUB_DIR: root }), { chatProvider: provider });
    const topicId = await indexedTopicId(app);

    const response = await app.request(`/api/topics/${topicId}/lessons/generate`, {
      method: "POST"
    });
    const events = parseSse(await response.text());

    expect(response.status).toBe(200);
    expect(events).toEqual([
      {
        type: "error",
        code: "provider_error",
        message: "Finish lesson 0001 before generating the next lesson.",
        recoverable: true
      }
    ]);
    expect(requests).toEqual([]);
  });

  it("generates active-recall quizzes and returns due review items", async () => {
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }));
    const topicId = await indexedTopicId(app);

    const quizResponse = await app.request(`/api/topics/${topicId}/quizzes/generate`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(quizResponse.status).toBe(201);
    await expect(quizResponse.json()).resolves.toMatchObject({
      ok: true,
      quiz: {
        topicId,
        questions: [
          {
            type: "mcq"
          },
          {
            type: "explain_back"
          }
        ]
      }
    });

    const review = await app.request(`/api/topics/${topicId}/review`);
    expect(review.status).toBe(200);
    await expect(review.json()).resolves.toMatchObject({
      ok: true,
      topicId,
      items: []
    });
  });

  it("returns answer guidance and source lessons for quiz-created review items", async () => {
    const connection = createSqliteConnection();
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }), {
      database: connection
    });

    try {
      await app.request("/api/topics");
      const topic = connection.db
        .select()
        .from(topics)
        .where(eq(topics.slug, "typescript-basics"))
        .get();
      if (!topic) {
        throw new Error("Fixture topic was not indexed.");
      }

      const lesson = connection.db
        .select()
        .from(lessonsIndex)
        .where(eq(lessonsIndex.topicId, topic.id))
        .all()
        .sort((left, right) => left.number - right.number)[0];
      if (!lesson) {
        throw new Error("Fixture lesson was not indexed.");
      }

      const quiz = connection.db
        .insert(quizzes)
        .values({
          topicId: topic.id,
          sourceLessonId: lesson.id,
          questionsJson: JSON.stringify([
            {
              id: "recall",
              type: "mcq",
              prompt: "Which move checks understanding?",
              options: [
                { id: "read", label: "Read it again" },
                { id: "explain", label: "Explain it back" }
              ],
              answer: "explain",
              rubric: "Active recall is stronger than passive rereading."
            }
          ])
        })
        .returning()
        .get();

      connection.db
        .insert(reviewItems)
        .values([
          {
            topicId: topic.id,
            concept: "Which move checks understanding?",
            sourceQuizId: quiz.id,
            dueAt: "2026-01-01T00:00:00.000Z"
          },
          {
            topicId: topic.id,
            concept: "Legacy concept without provenance",
            dueAt: "2026-01-02T00:00:00.000Z"
          }
        ])
        .run();

      const response = await app.request(`/api/topics/${topic.id}/review`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        topicId: topic.id,
        items: [
          {
            concept: "Which move checks understanding?",
            answerGuide:
              "Correct answer: Explain it back. Active recall is stronger than passive rereading.",
            sourceLesson: {
              id: lesson.id,
              number: lesson.number,
              title: lesson.title
            }
          },
          {
            concept: "Legacy concept without provenance",
            answerGuide: null,
            sourceLesson: null
          }
        ]
      });
    } finally {
      connection.sqlite.close();
    }
  });

  it("persists practice ratings and advances rated concepts out of the due queue", async () => {
    const connection = createSqliteConnection();
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }), {
      database: connection
    });

    try {
      await app.request("/api/topics");
      const topic = connection.db
        .select()
        .from(topics)
        .where(eq(topics.slug, "typescript-basics"))
        .get();
      if (!topic) {
        throw new Error("Fixture topic was not indexed.");
      }

      const remembered = connection.db
        .insert(reviewItems)
        .values({
          topicId: topic.id,
          concept: "Narrow before casting",
          ease: 2.5,
          intervalDays: 1,
          dueAt: "2026-01-01T00:00:00.000Z"
        })
        .returning()
        .get();
      const again = connection.db
        .insert(reviewItems)
        .values({
          topicId: topic.id,
          concept: "Values exist at runtime",
          ease: 2.5,
          intervalDays: 7,
          dueAt: "2026-01-02T00:00:00.000Z"
        })
        .returning()
        .get();

      const rememberedResponse = await app.request(
        `/api/topics/${topic.id}/review/${remembered.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ rating: "remembered" }),
          headers: {
            "content-type": "application/json"
          }
        }
      );
      const rememberedBody = (await rememberedResponse.json()) as {
        item: { dueAt: string; ease: number; intervalDays: number };
      };

      expect(rememberedResponse.status).toBe(200);
      expect(rememberedBody.item).toMatchObject({
        ease: 2.6,
        intervalDays: 3
      });
      expect(Date.parse(rememberedBody.item.dueAt)).toBeGreaterThan(Date.now());

      const againResponse = await app.request(`/api/topics/${topic.id}/review/${again.id}`, {
        method: "PUT",
        body: JSON.stringify({ rating: "again" }),
        headers: {
          "content-type": "application/json"
        }
      });
      const againBody = (await againResponse.json()) as {
        item: { dueAt: string; ease: number; intervalDays: number };
      };

      expect(againResponse.status).toBe(200);
      expect(againBody.item).toMatchObject({
        ease: 2.3,
        intervalDays: 1
      });
      expect(Date.parse(againBody.item.dueAt)).toBeGreaterThan(Date.now());

      const review = await app.request(`/api/topics/${topic.id}/review`);
      await expect(review.json()).resolves.toMatchObject({
        ok: true,
        topicId: topic.id,
        items: []
      });
    } finally {
      connection.sqlite.close();
    }
  });

  it("updates lesson status in SQLite only and preserves it across browsing reads", async () => {
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }));
    const topicId = await indexedTopicId(app);
    const beforeHash = hashDirectory(fixtureRoot);

    const response = await app.request(`/api/topics/${topicId}/lessons/1/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "completed" }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      lesson: {
        number: 1,
        status: "completed"
      }
    });

    const detail = await app.request(`/api/topics/${topicId}`);
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      counts: {
        completedLessons: 1
      }
    });

    const lessons = await app.request(`/api/topics/${topicId}/lessons`);
    const lessonsBody = (await lessons.json()) as {
      lessons: Array<{ number: number; status: string }>;
    };

    expect(lessonsBody.lessons.find((lesson) => lesson.number === 1)?.status).toBe("completed");
    expect(hashDirectory(fixtureRoot)).toBe(beforeHash);
  });

  it("rejects invalid lesson status without touching workspace files", async () => {
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }));
    const topicId = await indexedTopicId(app);
    const beforeHash = hashDirectory(fixtureRoot);

    const response = await app.request(`/api/topics/${topicId}/lessons/1/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "done" }),
      headers: {
        "content-type": "application/json"
      }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "invalid_lesson_status"
    });
    expect(hashDirectory(fixtureRoot)).toBe(beforeHash);
  });

  it("renders records, resources, and reference metadata", async () => {
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }));
    const topicId = await indexedTopicId(app);
    const records = await app.request(`/api/topics/${topicId}/records`);

    expect(records.status).toBe(200);
    await expect(records.json()).resolves.toMatchObject({
      ok: true,
      records: [
        {
          number: 1,
          title: "Values are the runtime floor",
          content:
            "# Values are the runtime floor\n\nThe learner can explain that TypeScript checks values that still have to exist at runtime.\n"
        }
      ]
    });

    const reference = await app.request(`/api/topics/${topicId}/reference`);

    expect(reference.status).toBe(200);
    const referenceBody = (await reference.json()) as {
      ok: boolean;
      resources: string | null;
      references: Array<{ fileName: string; title: string }>;
    };

    expect(referenceBody.ok).toBe(true);
    expect(referenceBody.resources).toContain("TypeScript Handbook");
    expect(referenceBody.references).toEqual([
      {
        fileName: "glossary.html",
        title: "TypeScript Glossary"
      }
    ]);
  });

  it("serves reference HTML through the same sandbox policy", async () => {
    const app = createApp(testConfig({ LEARNING_HUB_DIR: fixtureRoot }));
    const topicId = await indexedTopicId(app);
    const reference = await app.request(`/api/topics/${topicId}/reference/glossary.html`);

    expect(reference.status).toBe(200);
    expect(reference.headers.get("content-security-policy")).toContain("sandbox");
    expect(reference.headers.get("content-security-policy")).not.toContain("allow-same-origin");
    const referenceText = await reference.text();
    expect(referenceText).toContain("TypeScript Glossary");
    expect(referenceText).toContain("learning-hub-lesson-theme");
  });
});
