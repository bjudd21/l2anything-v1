import { healthResponseSchema } from "@learning-hub/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

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

describe("server app", () => {
  it("exposes a health endpoint", async () => {
    const app = createApp(testConfig());
    const response = await app.request("/health");

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    const parsed = healthResponseSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    expect(body.region).toBe("us-east-2");
  });

  it("returns a JSON 404 envelope for unknown routes", async () => {
    const app = createApp(testConfig());
    const response = await app.request("/missing");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "not_found"
    });
  });
});
