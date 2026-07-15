import { describe, expect, it } from "vitest";
import { createFetchUrlTool } from "./research.js";
import { createTutorToolRegistry } from "./registry.js";

function dbStub() {
  return {} as Parameters<typeof createTutorToolRegistry>[0]["db"];
}

function topicStub() {
  return {
    id: 1,
    slug: "typescript-basics",
    dirPath: "/tmp/topic",
    title: "TypeScript Basics",
    createdAt: "now",
    lastActiveAt: null
  } as Parameters<typeof createTutorToolRegistry>[0]["topic"];
}

describe("research tutor tools", () => {
  it("registers web_search only when Tavily is configured", () => {
    const withoutKey = createTutorToolRegistry({
      config: {
        LEARNING_HUB_DIR: "/tmp",
        TAVILY_API_KEY: ""
      },
      db: dbStub(),
      topic: topicStub()
    });
    const withKey = createTutorToolRegistry({
      config: {
        LEARNING_HUB_DIR: "/tmp",
        TAVILY_API_KEY: "test-key"
      },
      db: dbStub(),
      topic: topicStub()
    });

    expect(withoutKey.specs.map((spec) => spec.name)).not.toContain("web_search");
    expect(withKey.specs.map((spec) => spec.name)).toContain("web_search");
  });

  it("extracts readable text from fetched HTML", async () => {
    const tool = createFetchUrlTool({
      config: {
        TAVILY_API_KEY: ""
      },
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            [
              "<html><head><title>Readable Page</title><style>.x{}</style></head>",
              "<body><script>ignored()</script><h1>Hello</h1><p>Fish &amp; chips</p></body></html>"
            ].join("")
          )
        )
    });

    const result = await tool.execute({ url: "https://example.com/page" });

    expect(result.content).toContain("# Readable Page");
    expect(result.content).toContain("Hello");
    expect(result.content).toContain("Fish & chips");
    expect(result.data).toEqual({
      title: "Readable Page",
      url: "https://example.com/page"
    });
  });

  it("reports fetch failures as clean tool errors", async () => {
    const tool = createFetchUrlTool({
      config: {
        TAVILY_API_KEY: ""
      },
      fetchImpl: () =>
        Promise.resolve(new Response("Nope", { status: 503, statusText: "Unavailable" }))
    });

    await expect(tool.execute({ url: "https://example.com/down" })).rejects.toMatchObject({
      code: "tool_error",
      message: "Fetch failed for https://example.com/down: 503 Unavailable"
    });
  });
});
