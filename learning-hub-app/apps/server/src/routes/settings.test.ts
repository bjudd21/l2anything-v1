import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { createSqliteConnection } from "../db/client.js";

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

const awsReady = {
  awsAccessProvider: () => Promise.resolve(),
  awsIdentityProvider: () =>
    Promise.resolve({
      account: "000000000000",
      arn: "arn:aws:sts::000000000000:assumed-role/Test/User"
    })
};

describe("settings routes", () => {
  it("requires access validation before environment-backed settings are complete", async () => {
    const app = createApp(testConfig());
    const response = await app.request("/api/settings");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      setupComplete: false,
      workspaceDir: "C:/learning",
      awsProfile: "learning-dev",
      awsRegion: "us-east-2",
      awsLoginCommand: null,
      defaultProvider: "bedrock-converse",
      converseModelId: "anthropic.test",
      mantleModelId: "openai.gpt-5.6-sol"
    });
  });

  it("saves first-run setup and applies it without a restart", async () => {
    const config = testConfig({ AWS_PROFILE: "" });
    const app = createApp(config, awsReady);

    const before = await app.request("/api/settings");
    await expect(before.json()).resolves.toMatchObject({
      setupComplete: false,
      workspaceDir: "C:/learning",
      awsProfile: null
    });

    const response = await app.request("/api/settings/setup", {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        awsProfile: "l2anything",
        awsRegion: "us-west-2"
      })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      setupComplete: true,
      workspaceDir: "C:/learning",
      awsProfile: "l2anything",
      awsRegion: "us-west-2",
      mantleBaseUrl: "https://bedrock-mantle.us-west-2.api.aws/openai/v1"
    });
    expect(config.AWS_PROFILE).toBe("l2anything");
    expect(config.AWS_REGION).toBe("us-west-2");
  });

  it("restores setup from SQLite on the next launch", async () => {
    const database = createSqliteConnection();
    const firstConfig = testConfig({ AWS_PROFILE: "" });
    const firstApp = createApp(firstConfig, { ...awsReady, database });

    await firstApp.request("/api/settings/setup", {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        awsProfile: "shared-profile",
        awsRegion: "eu-west-1"
      })
    });

    const restoredConfig = testConfig({ AWS_PROFILE: "" });
    const restoredApp = createApp(restoredConfig, { database });
    const response = await restoredApp.request("/api/settings");

    await expect(response.json()).resolves.toMatchObject({
      setupComplete: true,
      awsProfile: "shared-profile",
      awsRegion: "eu-west-1"
    });
    expect(restoredConfig.AWS_PROFILE).toBe("shared-profile");
    expect(restoredConfig.AWS_REGION).toBe("eu-west-1");
  });

  it("rejects invalid AWS profile names during setup", async () => {
    const app = createApp(testConfig({ AWS_PROFILE: "" }));
    const response = await app.request("/api/settings/setup", {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        awsProfile: "invalid profile name",
        awsRegion: "us-east-2"
      })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_setup"
    });
  });

  it("does not complete setup when Sonnet 5 access is denied", async () => {
    const config = testConfig({ AWS_PROFILE: "" });
    const app = createApp(config, {
      ...awsReady,
      awsAccessProvider: () =>
        Promise.reject(
          new Error("User is not authorized to perform: bedrock:InvokeModelWithResponseStream")
        )
    });

    const response = await app.request("/api/settings/setup", {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        awsProfile: "missing-sonnet-access",
        awsRegion: "us-east-2"
      })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "aws_access_failed",
      reason: "access_denied",
      message:
        "AWS credentials are valid, but this role is not authorized to call bedrock:InvokeModelWithResponseStream."
    });

    const settingsResponse = await app.request("/api/settings");
    await expect(settingsResponse.json()).resolves.toMatchObject({
      setupComplete: false,
      awsProfile: null
    });
    expect(config.AWS_PROFILE).toBeUndefined();
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
        mantleModelId: "openai.custom-model"
      })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      defaultProvider: "bedrock-mantle",
      mantleModelId: "openai.custom-model"
    });
  });
});
