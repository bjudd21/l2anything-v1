import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.LEARNING_HUB_APP_URL ?? "http://127.0.0.1:5173";
const edgePath =
  process.env.PLAYWRIGHT_EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const outputDir = fileURLToPath(new URL("../.visual-check/ui-regression/", import.meta.url));

const forbiddenText = ["Topic not found", "Page not found", "Topic API unavailable"];
const visualViewports = [
  { name: "desktop", width: 1440, height: 950 },
  { name: "mobile", width: 390, height: 900 }
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readJson(path) {
  const response = await fetch(new URL(path, baseUrl));
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return response.json();
}

async function fulfillJson(route, body) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

async function fulfillSse(route, events) {
  await route.fulfill({
    contentType: "text/event-stream",
    body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
  });
}

async function loadState() {
  const dashboard = await readJson("/api/dashboard");
  const topics = await readJson("/api/topics");
  const settings = await readJson("/api/settings");
  const lessonTopic = topics.topics.find((topic) => topic.lessonCount > 0) ?? topics.topics[0];
  assert(lessonTopic, "The app needs at least one topic for UI regression.");

  const lessons =
    lessonTopic.lessonCount > 0 ? await readJson(`/api/topics/${lessonTopic.id}/lessons`) : null;

  return {
    createdTopic: null,
    dashboard,
    lessonTopic,
    lessons,
    settings,
    topics
  };
}

function visualRoutes(state) {
  const topicPath = `/t/${encodeURIComponent(state.lessonTopic.slug)}`;
  const lesson = state.lessons?.lessons[0];
  assert(lesson, "The app needs at least one lesson for visual regression.");
  const lessonPath = `${topicPath}/lessons/${lesson.number}`;

  return [
    { name: "dashboard", path: "/" },
    { name: "topic-home", path: topicPath },
    { name: "lessons", path: `${topicPath}/lessons` },
    { name: "lesson-view", path: lessonPath },
    { name: "review", path: `${topicPath}/review` },
    { name: "records", path: `${topicPath}/records` },
    { name: "resources", path: `${topicPath}/resources` },
    {
      name: "chat",
      path: lessonPath,
      selector: "section[aria-label='Lesson tutor chat']"
    },
    { name: "new-topic", path: "/topics/new" },
    { name: "settings", path: "/settings" }
  ];
}

async function installStubs(page, state) {
  await page.route("**/api/aws/login", async (route) => {
    await fulfillJson(route, {
      ok: true,
      command: state.settings.awsLoginCommand ?? "bedrock-login",
      message: "Regression AWS login stub succeeded."
    });
  });

  await page.route("**/api/aws/models", async (route) => {
    await fulfillJson(route, {
      ok: true,
      region: state.settings.awsRegion,
      profile: state.settings.awsProfile,
      models: [
        {
          modelId: "amazon.nova-lite-v1:0",
          modelName: "Nova Lite",
          providerName: "Amazon",
          inputModalities: ["TEXT"],
          outputModalities: ["TEXT"]
        },
        {
          modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
          modelName: "Claude 3.5 Sonnet",
          providerName: "Anthropic",
          inputModalities: ["TEXT"],
          outputModalities: ["TEXT"]
        }
      ]
    });
  });

  await page.route("**/api/topics/interview", async (route) => {
    await fulfillSse(route, [
      { type: "text_delta", sessionId: 9002, text: "Regression stub response." },
      { type: "done", sessionId: 9002, messageId: 9002, stopReason: "end_turn" }
    ]);
  });

  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }

    const update = route.request().postDataJSON();
    state.settings = {
      ...state.settings,
      ...update,
      converseModelId: update.converseModelId ?? state.settings.converseModelId,
      mantleModelId: update.mantleModelId ?? state.settings.mantleModelId
    };
    await fulfillJson(route, state.settings);
  });

  await page.route("**/api/topics/groups", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const requested = route.request().postDataJSON();
    const nextGroupId =
      Math.max(9000, ...state.topics.groups.map((group) => group.id)) + 1;
    const group = {
      id: nextGroupId,
      name: requested.name,
      collapsed: false
    };
    state.topics = {
      ...state.topics,
      groups: [...state.topics.groups, group]
    };

    await fulfillJson(route, { ok: true, group });
  });

  await page.route(/\/api\/topics\/groups\/\d+$/, async (route) => {
    const groupId = Number(new URL(route.request().url()).pathname.split("/").at(-1));
    const method = route.request().method();

    if (method === "DELETE") {
      state.topics = {
        ...state.topics,
        groups: state.topics.groups.filter((group) => group.id !== groupId),
        topics: state.topics.topics.map((topic) =>
          topic.groupId === groupId ? { ...topic, groupId: null } : topic
        )
      };
      await fulfillJson(route, { ok: true, groupId });
      return;
    }

    if (method !== "PUT") {
      await route.continue();
      return;
    }

    const requested = route.request().postDataJSON();
    const currentGroup = state.topics.groups.find((group) => group.id === groupId);
    assert(currentGroup, `Topic group ${groupId} was not found by the regression stub.`);
    const group = { ...currentGroup, ...requested };
    state.topics = {
      ...state.topics,
      groups: state.topics.groups.map((item) => (item.id === groupId ? group : item))
    };
    await fulfillJson(route, { ok: true, group });
  });

  await page.route(/\/api\/topics\/\d+\/group$/, async (route) => {
    const topicId = Number(new URL(route.request().url()).pathname.split("/")[3]);
    const requested = route.request().postDataJSON();
    const currentTopic = state.topics.topics.find((topic) => topic.id === topicId);
    assert(currentTopic, `Topic ${topicId} was not found by the regression stub.`);
    const topic = { ...currentTopic, groupId: requested.groupId };
    state.topics = {
      ...state.topics,
      topics: state.topics.topics.map((item) => (item.id === topicId ? topic : item))
    };
    if (state.lessonTopic.id === topicId) {
      state.lessonTopic = topic;
    }
    await fulfillJson(route, { ok: true, topic });
  });

  await page.route("**/api/topics", async (route) => {
    if (route.request().method() === "GET") {
      await fulfillJson(route, state.topics);
      return;
    }

    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const body = route.request().postDataJSON();
    state.createdTopic = {
      id: 9999,
      slug: body.slug,
      title: body.title,
      groupId: null,
      lessonCount: 0,
      completedLessonCount: 0,
      dueLessonCount: 0,
      recordCount: 0,
      resourceCount: 0,
      referenceCount: 0,
      reviewItemCount: 0,
      dueReviewCount: 0
    };

    await fulfillJson(route, {
      ...state.topics,
      topics: [state.createdTopic, ...state.topics.topics]
    });
  });

  await page.route("**/api/topics/9999", async (route) => {
    if (!state.createdTopic) {
      await route.continue();
      return;
    }

    await fulfillJson(route, {
      ok: true,
      topic: state.createdTopic,
      mission: "# Regression topic\n\nCreated by the UI regression stub.",
      counts: {
        lessons: 0,
        completedLessons: 0,
        records: 0,
        resources: 0,
        references: 0
      },
      recentRecords: [],
      nextAction: {
        label: "Open chat",
        description: "Continue the mission interview.",
        href: `/t/${encodeURIComponent(state.createdTopic.slug)}/chat`
      }
    });
  });

  await page.route(/\/api\/topics\/\d+\/lessons\/\d+\/status$/, async (route) => {
    const url = new URL(route.request().url());
    const [, , , topicIdText, , lessonNumberText] = url.pathname.split("/");
    const topicId = Number(topicIdText);
    const lessonNumber = Number(lessonNumberText);
    const requested = route.request().postDataJSON();
    const lesson = state.lessons?.lessons.find(
      (item) => item.topicId === topicId && item.number === lessonNumber
    );

    await fulfillJson(route, {
      ok: true,
      lesson: {
        ...(lesson ?? {
          id: 1,
          topicId,
          number: lessonNumber,
          fileName: "0001-regression.html",
          title: "Regression lesson"
        }),
        status: requested.status
      }
    });
  });

  await page.route(/\/api\/topics\/\d+\/quizzes\/generate$/, async (route) => {
    const url = new URL(route.request().url());
    const topicId = Number(url.pathname.split("/")[3]);
    const requested = route.request().postDataJSON();

    await fulfillJson(route, {
      ok: true,
      quiz: {
        id: 9001,
        topicId,
        sourceLessonId: requested.lessonId ?? null,
        createdAt: new Date().toISOString(),
        questions: [
          {
            id: "q1",
            type: "free_text",
            prompt: "Explain the core idea.",
            rubric: "Mentions the main guarantee."
          }
        ]
      }
    });
  });

  await page.route(/\/api\/quizzes\/\d+\/attempts$/, async (route) => {
    const url = new URL(route.request().url());
    const quizId = Number(url.pathname.split("/")[3]);

    await fulfillJson(route, {
      ok: true,
      attempt: {
        id: 9002,
        quizId,
        score: 0.8,
        createdAt: new Date().toISOString(),
        feedback: [
          {
            questionId: "q1",
            correct: true,
            score: 0.8,
            feedback: "Clear explanation."
          }
        ]
      }
    });
  });

  await page.route(/\/api\/topics\/\d+\/lessons\/generate$/, async (route) => {
    await fulfillSse(route, [
      { type: "tool_started", name: "regression", label: "Regression tool" },
      { type: "tool_finished", name: "regression", label: "Regression tool" },
      { type: "done", stopReason: "end_turn" }
    ]);
  });

  await page.route(/\/api\/topics\/\d+\/chat$/, async (route) => {
    await fulfillSse(route, [
      { type: "text_delta", sessionId: 9001, text: "Regression stub response." },
      { type: "done", sessionId: 9001, messageId: 9001, stopReason: "end_turn" }
    ]);
  });
}

async function createPage(browser, state, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((texts) => {
    window.__lhBadText = [];
    const scan = () => {
      const bodyText = document.body?.innerText ?? "";
      for (const text of texts) {
        if (bodyText.includes(text)) {
          window.__lhBadText.push({ text, url: window.location.href });
        }
      }
    };

    const observe = () => {
      if (!document.documentElement) {
        return false;
      }

      new MutationObserver(scan).observe(document.documentElement, {
        childList: true,
        characterData: true,
        subtree: true
      });
      return true;
    };

    if (!observe()) {
      window.addEventListener("readystatechange", observe, { once: true });
    }
    window.addEventListener("DOMContentLoaded", scan);
    window.setInterval(scan, 50);
  }, forbiddenText);

  const page = await context.newPage();
  await installStubs(page, state);
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

async function expectNoBadText(page, label) {
  const currentText = await page.locator("body").innerText();
  const currentHits = forbiddenText.filter((text) => currentText.includes(text));
  const watchedHits = await page.evaluate(() => window.__lhBadText ?? []);
  assert(
    currentHits.length === 0 && watchedHits.length === 0,
    `${label}: forbidden text appeared: ${JSON.stringify({ currentHits, watchedHits })}`
  );
}

async function expectLayoutContained(page, label) {
  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const issues = [];

    if (scrollWidth > viewportWidth + 1 || bodyScrollWidth > viewportWidth + 1) {
      issues.push({
        type: "horizontal-overflow",
        viewportWidth,
        scrollWidth,
        bodyScrollWidth
      });
    }

    const sidebar = document.querySelector("aside:not([aria-label='Mobile navigation'])");
    const sidebarRect = sidebar?.getBoundingClientRect();
    if (sidebar && sidebarRect && sidebarRect.width > 0) {
      for (const element of sidebar.querySelectorAll("*")) {
        const rect = element.getBoundingClientRect();
        if (rect.right > sidebarRect.right + 1) {
          issues.push({
            type: "sidebar-overflow",
            tag: element.tagName.toLowerCase(),
            text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
            right: Math.round(rect.right),
            sidebarRight: Math.round(sidebarRect.right)
          });
        }
      }
    }

    for (const element of document.querySelectorAll(
      "[aria-readonly='true'], input, textarea, select"
    )) {
      const container = element.closest("section, details");
      if (!container) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (rect.left < containerRect.left - 1 || rect.right > containerRect.right + 1) {
        issues.push({
          type: "field-container-overflow",
          tag: element.tagName.toLowerCase(),
          label:
            element.getAttribute("aria-label") ??
            element.getAttribute("id") ??
            (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          containerLeft: Math.round(containerRect.left),
          containerRight: Math.round(containerRect.right)
        });
      }
    }

    return issues;
  });

  assert(result.length === 0, `${label}: layout containment failed: ${JSON.stringify(result)}`);
}

async function expectButtonContentContained(page, label) {
  const result = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button")).flatMap((button) => {
      const rect = button.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return [];
      }

      const widthOverflow = button.scrollWidth > button.clientWidth + 1;
      const heightOverflow = button.scrollHeight > button.clientHeight + 1;
      if (!widthOverflow && !heightOverflow) {
        return [];
      }

      return [
        {
          clientHeight: button.clientHeight,
          clientWidth: button.clientWidth,
          label:
            button.getAttribute("aria-label") ??
            (button.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
          scrollHeight: button.scrollHeight,
          scrollWidth: button.scrollWidth
        }
      ];
    })
  );

  assert(result.length === 0, `${label}: button content overflow: ${JSON.stringify(result)}`);
}

async function expectLessonFrameReadable(page, label) {
  const lessonFrame = page
    .frames()
    .find((frame) => /\/api\/topics\/\d+\/lessons\//.test(frame.url()));
  assert(lessonFrame, `${label}: lesson iframe did not load`);

  const layout = await lessonFrame.evaluate(() => {
    const body = document.body;
    const content = document.querySelector("main") ?? body.firstElementChild ?? body;

    return {
      bodyWidth: Math.round(body.getBoundingClientRect().width),
      contentWidth: Math.round(content.getBoundingClientRect().width),
      viewportWidth: document.documentElement.clientWidth
    };
  });
  const minimumReadableWidth = Math.min(540, layout.viewportWidth * 0.65);

  assert(
    layout.bodyWidth >= minimumReadableWidth && layout.contentWidth >= minimumReadableWidth,
    `${label}: lesson iframe content collapsed: ${JSON.stringify(layout)}`
  );
}

async function expectHealthy(page, label) {
  await expectNoBadText(page, label);
  await expectLayoutContained(page, label);
  await expectButtonContentContained(page, label);
}

async function clickSpa(page, locator, label, afterClick) {
  const marker = `marker-${Date.now()}-${Math.random()}`;
  await page.evaluate((value) => {
    window.__lhReloadMarker = value;
    window.__lhBadText = [];
  }, marker);

  await locator.click();
  if (afterClick) {
    await afterClick();
  }
  await settle(page);

  const markerAfter = await page.evaluate(() => window.__lhReloadMarker);
  assert(markerAfter === marker, `${label}: click caused a full page reload`);
  await expectHealthy(page, label);
}

async function waitForAttribute(locator, name, expected, timeoutMs = 5000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if ((await locator.getAttribute(name)) === expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for ${name}="${expected}".`);
}

async function step(results, name, fn, page) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`ok - ${name}`);
  } catch (error) {
    if (page) {
      const safeName = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      await page.screenshot({ path: `${outputDir}/failure-${safeName}.png`, fullPage: true });
    }
    results.push({
      name,
      ok: false,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function runVisualMatrix(browser, state, results) {
  const routes = visualRoutes(state);

  for (const theme of ["dark", "light"]) {
    for (const viewport of visualViewports) {
      const { context, page } = await createPage(browser, state, {
        width: viewport.width,
        height: viewport.height
      });
      const consoleErrors = [];

      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(`${page.url()}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        consoleErrors.push(`${page.url()}: ${error.message}`);
      });

      try {
        for (const route of routes) {
          const label = `${theme}/${viewport.name}/${route.name}`;

          await step(
            results,
            `visual ${label}`,
            async () => {
              consoleErrors.length = 0;
              await page.goto(`${baseUrl}${route.path}?theme=${theme}`);
              await settle(page);
              if (route.name === "chat") {
                await page.getByRole("button", { name: "Ask Tutor" }).click();
                await page.locator(route.selector).first().waitFor();
              }

              const appliedTheme = await page.evaluate(
                () => document.documentElement.dataset.theme
              );
              assert(appliedTheme === theme, `${label}: expected ${theme} theme`);
              await expectHealthy(page, label);
              if (route.name === "lesson-view") {
                await expectLessonFrameReadable(page, label);
              }
              assert(
                consoleErrors.length === 0,
                `${label}: console errors: ${consoleErrors.join("\n")}`
              );

              const screenshotPath = `${outputDir}/${route.name}-${theme}-${viewport.name}.png`;
              if (route.selector) {
                const surface = page.locator(route.selector).first();
                await surface.waitFor();
                await surface.screenshot({ path: screenshotPath });
              } else {
                await page.screenshot({ fullPage: true, path: screenshotPath });
              }
            },
            page
          );
        }
      } finally {
        await context.close();
      }
    }
  }
}

async function runDesktop(browser, state, results) {
  const { context, page } = await createPage(browser, state, { width: 1440, height: 950 });
  const lessonTopic = state.lessonTopic;
  const topicPath = `/t/${encodeURIComponent(lessonTopic.slug)}`;

  try {
    await step(
      results,
      "desktop direct topic route uses loading state, not not-found",
      async () => {
        await page.goto(`${baseUrl}${topicPath}`);
        await page.locator("h1").filter({ hasText: lessonTopic.title }).waitFor();
        await settle(page);
        await expectHealthy(page, "desktop direct topic route");
      },
      page
    );

    await step(
      results,
      "sidebar settings link is SPA navigation",
      async () => {
        await clickSpa(
          page,
          page.getByRole("link", { name: "Settings" }),
          "settings link",
          async () => {
            await page.getByRole("heading", { name: "Settings" }).waitFor();
          }
        );
      },
      page
    );

    await step(
      results,
      "settings AWS login button uses stubbed endpoint",
      async () => {
        await page.getByRole("button", { name: "Run AWS login" }).click();
        await page.getByText("Regression AWS login stub succeeded.").waitFor();
        await expectHealthy(page, "settings AWS login");
      },
      page
    );

    await step(
      results,
      "settings advanced model routing saves",
      async () => {
        await page.getByText("Advanced model routing").click();
        await page.getByLabel("Default provider").selectOption("bedrock-converse");
        const refreshModels = page.getByRole("button", { name: "Refresh models" });
        if ((await refreshModels.count()) > 0) {
          await refreshModels.click();
          await page
            .getByLabel("Bedrock Converse model (required for Converse)")
            .selectOption("anthropic.claude-3-5-sonnet-20241022-v2:0");
        } else {
          await page.getByText("Sonnet 5 is used automatically").waitFor();
        }
        await page.getByRole("button", { name: "Save advanced settings" }).click();
        await page.getByText("Advanced settings saved.").waitFor();
        await expectHealthy(page, "settings advanced save");
      },
      page
    );

    await step(
      results,
      "dashboard link is SPA navigation",
      async () => {
        await clickSpa(
          page,
          page.getByRole("link", { exact: true, name: "Dashboard" }),
          "dashboard link",
          async () => {
            await page.getByRole("heading", { name: "Pick up where you left off" }).waitFor();
          }
        );
      },
      page
    );

    await step(
      results,
      "dashboard next action navigates without reload",
      async () => {
        await clickSpa(
          page,
          page.locator("a[href^='/t/']").first(),
          "dashboard next action",
          async () => {
            await page.waitForURL(/\/t\//);
          }
        );
      },
      page
    );

    await step(
      results,
      "sidebar topic groups create, organize, rename, collapse, and delete",
      async () => {
        await page.goto(baseUrl);
        await page.getByRole("heading", { name: "Pick up where you left off" }).waitFor();
        const sidebar = page.locator("aside").first();
        await sidebar
          .getByRole("button", { name: `Topic actions for ${lessonTopic.title}` })
          .waitFor();

        await sidebar.getByRole("button", { name: "Create topic group" }).click();
        await page.getByLabel("Group name").fill("Regression group");
        await page.getByRole("button", { exact: true, name: "Create group" }).click();
        await page.getByRole("dialog").waitFor({ state: "detached" });
        assert(
          state.topics.groups.some((group) => group.name === "Regression group"),
          "The topic-group create request did not reach the regression stub."
        );
        const groupToggle = sidebar.getByRole("button", { name: /^Regression group \d+$/ });
        await groupToggle.waitFor();
        const sidebarText = await sidebar.innerText();
        assert(
          sidebarText.includes("Regression group"),
          `The created topic group was not rendered: ${sidebarText}`
        );

        await sidebar
          .getByRole("button", { name: `Topic actions for ${lessonTopic.title}` })
          .click();
        await page.getByRole("menuitemradio", { name: "Regression group" }).click();
        await groupToggle.waitFor();

        await groupToggle.click();
        await waitForAttribute(groupToggle, "aria-expanded", "false");
        await groupToggle.click();
        await waitForAttribute(groupToggle, "aria-expanded", "true");

        await sidebar.getByRole("button", { name: "Group actions for Regression group" }).click();
        await page.getByRole("menuitem", { name: "Rename group" }).click();
        await page.getByLabel("Group name").fill("Regression collection");
        await page.getByRole("button", { exact: true, name: "Save name" }).click();
        const renamedGroupToggle = sidebar.getByRole("button", {
          name: /^Regression collection \d+$/
        });
        await renamedGroupToggle.waitFor();

        await sidebar
          .getByRole("button", { name: "Group actions for Regression collection" })
          .click();
        await page.getByRole("menuitem", { name: "Delete group" }).click();
        await page.getByRole("button", { exact: true, name: "Delete group" }).click();
        await renamedGroupToggle.waitFor({
          state: "detached"
        });
        await sidebar
          .getByRole("button", { name: `Topic actions for ${lessonTopic.title}` })
          .waitFor();
        await expectHealthy(page, "sidebar topic groups");
      },
      page
    );

    await step(
      results,
      "command palette opens and navigates without reload",
      async () => {
        await page.getByRole("button", { name: /command palette/i }).click();
        const paletteInput = page.locator("[data-slot='command-input']");
        await paletteInput.fill(lessonTopic.title.slice(0, 10));
        const marker = `marker-${Date.now()}-${Math.random()}`;
        await page.evaluate((value) => {
          window.__lhReloadMarker = value;
          window.__lhBadText = [];
        }, marker);
        await paletteInput.press("Enter");
        await page.waitForURL(new RegExp(`${escapeRegExp(topicPath)}$`));
        await settle(page);
        const markerAfter = await page.evaluate(() => window.__lhReloadMarker);
        assert(markerAfter === marker, "command palette navigation caused a full page reload");
        await expectHealthy(page, "command palette navigation");
      },
      page
    );

    await step(
      results,
      "topic overview generation button handles streamed response",
      async () => {
        const button = page.getByRole("button", { name: "Generate next lesson" });
        if ((await button.count()) > 0 && (await button.first().isEnabled())) {
          await button.click();
          await page.getByText("Lesson ready.").waitFor();
        }
        await expectHealthy(page, "topic lesson generation");
      },
      page
    );

    await step(
      results,
      "topic tab links are SPA navigation",
      async () => {
        const tabs = [
          ["Lessons", `${topicPath}/lessons`, /\/lessons$/],
          ["Practice", `${topicPath}/review`, /\/review$/],
          ["Tutor memory", `${topicPath}/records`, /\/records$/],
          ["Library", `${topicPath}/resources`, /\/resources$/],
          ["Overview", topicPath, new RegExp(`${escapeRegExp(topicPath)}$`)]
        ];

        for (const [name, href, urlPattern] of tabs) {
          const tabLink = page.locator(`a[href="${href}"]`).filter({ hasText: name });
          if ((await tabLink.count()) === 0) {
            // Progressive disclosure: this tab has no content yet, so it is hidden.
            continue;
          }
          await clickSpa(page, tabLink, `topic tab ${name}`, async () => {
            await page.waitForURL(urlPattern);
          });
        }
      },
      page
    );

    await step(
      results,
      "lesson knowledge check completes the workflow",
      async () => {
        await page.goto(`${baseUrl}${topicPath}/lessons`);
        await page.getByRole("heading", { name: "Current lesson" }).waitFor();
        await clickSpa(
          page,
          page.locator(`a[href='${topicPath}/lessons/1']`).first(),
          "lesson detail link",
          async () => {
            await page.waitForURL(/\/lessons\/1$/);
          }
        );
        await page.getByRole("button", { name: "Start knowledge check" }).click();
        await page.getByRole("heading", { name: "Check your understanding" }).waitFor();
        await page.getByLabel("Your answer").fill("A concrete explanation from memory.");
        await page.getByRole("button", { name: "Submit and complete lesson" }).click();
        await page.getByRole("heading", { name: "Knowledge check complete" }).waitFor();
        await page.getByText("Progress saved automatically").waitFor();
        await expectHealthy(page, "lesson controls");
      },
      page
    );

    await step(
      results,
      "lesson chat sends via stubbed stream",
      async () => {
        await page.goto(`${baseUrl}${topicPath}/lessons/1`);
        await page.getByRole("button", { name: "Ask Tutor" }).click();
        await page.getByText("Knows lesson 1 and your topic files.").waitFor();
        await page.getByLabel("Message").fill("Regression chat ping");
        await page.getByRole("button", { name: "Send" }).click();
        await page.getByText("Regression stub response.").waitFor();
        await page.getByRole("button", { name: "Close" }).click();
        await page.getByRole("button", { name: "Ask Tutor" }).click();
        await page.getByText("Regression stub response.").waitFor();
        await expectHealthy(page, "lesson chat");
      },
      page
    );

    await step(
      results,
      "new topic creation is stubbed and navigates to overview",
      async () => {
        await clickSpa(
          page,
          page.getByRole("link", { name: "New topic" }),
          "new topic link",
          async () => {
            await page.getByRole("heading", { name: "Start a new topic" }).waitFor();
          }
        );
        await page.getByLabel("Message").fill("I want to learn regression testing with Playwright");
        await page.getByRole("button", { name: "Send" }).click();
        await page.getByText("Regression stub response.").waitFor();
        await page.getByRole("button", { name: "Create topic", exact: true }).click();
        await page.waitForURL(/\/t\/learning-learn-regression-testing-with-playwrigh$/);
        await page.getByRole("heading", { name: /regression testing/i }).waitFor();
        await expectHealthy(page, "new topic creation");
      },
      page
    );
  } finally {
    await context.close();
  }
}

async function runMobile(browser, state, results) {
  const { context, page } = await createPage(browser, state, { width: 390, height: 900 });

  try {
    await step(
      results,
      "mobile dashboard has no horizontal overflow",
      async () => {
        await page.goto(baseUrl);
        await page.getByRole("heading", { name: "Pick up where you left off" }).waitFor();
        await settle(page);
        await expectHealthy(page, "mobile dashboard");
      },
      page
    );

    await step(
      results,
      "mobile menu opens, closes, and navigates",
      async () => {
        await page.getByRole("button", { name: "Menu" }).click();
        await page.locator("#mobile-sidebar-sheet").waitFor();
        await page.getByRole("button", { name: "Close" }).click();
        await page.getByRole("button", { name: "Menu" }).click();
        await clickSpa(
          page,
          page.locator("#mobile-sidebar-sheet").getByRole("link", { name: "Settings" }),
          "mobile settings link",
          async () => {
            await page.getByRole("heading", { name: "Settings" }).waitFor();
          }
        );
      },
      page
    );
  } finally {
    await context.close();
  }
}

await mkdir(outputDir, { recursive: true });

const state = await loadState();
const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true
});
const results = [];

try {
  await runDesktop(browser, state, results);
  await runMobile(browser, state, results);
  await runVisualMatrix(browser, state, results);
} finally {
  await browser.close();
}

const failures = results.filter((result) => !result.ok);
if (failures.length) {
  console.error(JSON.stringify({ failures, results }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
