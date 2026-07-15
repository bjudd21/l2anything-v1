import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";

function testConfig(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({
    AWS_REGION: "us-east-2",
    LEARNING_HUB_DIR: "C:/learning",
    AWS_PROFILE: "learning-dev",
    DEFAULT_PROVIDER: undefined,
    CONVERSE_MODEL_ID: "anthropic.test",
    MANTLE_MODEL_ID: "",
    MANTLE_BASE_URL: "",
    TAVILY_API_KEY: "",
    PORT: "",
    ...overrides
  });
}

describe("settings routes", () => {
  it("returns environment-backed settings for the shell", async () => {
    const app = createApp(testConfig());
    const response = await app.request("/api/settings");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workspaceDir: "C:/learning",
      awsProfile: "learning-dev",
      awsRegion: "us-east-2",
      awsLoginCommand: null,
      defaultProvider: "bedrock-converse",
      converseModelId: "anthropic.test",
      mantleModelId: "openai.gpt-5.5"
    });
  });

  it("persists provider and model overrides in app settings", async () => {
    const app = createApp(testConfig());
    const response = await app.request("/api/settings", {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        defaultProvider: "bedrock-mantle",
        mantleModelId: "openai.gpt-5.5-mini"
      })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      defaultProvider: "bedrock-mantle",
      mantleModelId: "openai.gpt-5.5-mini"
    });
  });
});
