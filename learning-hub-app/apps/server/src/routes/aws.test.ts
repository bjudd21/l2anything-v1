import { describe, expect, it } from "vitest";
import { classifyAwsCredentialError } from "../aws/errors.js";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { writeAwsProfile } from "./aws.js";

function testConfig(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({
    AWS_REGION: "us-east-2",
    LEARNING_HUB_DIR: "",
    AWS_PROFILE: "learning-dev",
    DEFAULT_PROVIDER: undefined,
    CONVERSE_MODEL_ID: "",
    MANTLE_MODEL_ID: "",
    MANTLE_BASE_URL: "",
    TAVILY_API_KEY: "",
    PORT: "",
    ...overrides
  });
}

describe("AWS status route", () => {
  it("returns account identity when credentials are valid", async () => {
    const app = createApp(testConfig(), {
      awsIdentityProvider: () =>
        Promise.resolve({
          account: "000000000000",
          arn: "arn:aws:sts::000000000000:assumed-role/Test/User"
        })
    });

    const response = await app.request("/api/aws/status");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      account: "000000000000",
      arn: "arn:aws:sts::000000000000:assumed-role/Test/User",
      region: "us-east-2",
      profile: "learning-dev"
    });
  });

  it("classifies expired SSO sessions", () => {
    const error = Object.assign(
      new Error("The SSO session associated with this profile has expired"),
      {
        name: "TokenRefreshRequired"
      }
    );

    expect(classifyAwsCredentialError(error)).toMatchObject({
      ok: false,
      reason: "sso_expired"
    });
  });

  it("classifies missing credentials without throwing from the route", async () => {
    const app = createApp(testConfig(), {
      awsIdentityProvider: () => {
        const error = new Error("Could not load credentials from any providers");
        error.name = "CredentialsProviderError";
        return Promise.reject(error);
      }
    });

    const response = await app.request("/api/aws/status");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      reason: "no_credentials",
      region: "us-east-2",
      profile: "learning-dev"
    });
  });

  it("lists available Bedrock foundation models", async () => {
    const app = createApp(testConfig(), {
      awsModelsProvider: () =>
        Promise.resolve([
          {
            modelId: "anthropic.claude-test",
            modelName: "Claude Test",
            providerName: "Anthropic",
            inputModalities: ["TEXT"],
            outputModalities: ["TEXT"]
          }
        ])
    });

    const response = await app.request("/api/aws/models");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      region: "us-east-2",
      profile: "learning-dev",
      models: [
        {
          modelId: "anthropic.claude-test",
          modelName: "Claude Test",
          providerName: "Anthropic",
          inputModalities: ["TEXT"],
          outputModalities: ["TEXT"]
        }
      ]
    });
  });

  it("returns clean credential errors for model listing", async () => {
    const app = createApp(testConfig(), {
      awsModelsProvider: () => {
        const error = new Error("Could not load credentials from any providers");
        error.name = "CredentialsProviderError";
        return Promise.reject(error);
      }
    });

    const response = await app.request("/api/aws/models");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      reason: "no_credentials",
      region: "us-east-2",
      profile: "learning-dev"
    });
  });

  it("returns clean access denied errors for model listing", async () => {
    const app = createApp(testConfig(), {
      awsModelsProvider: () => {
        const error = new Error(
          "User is not authorized to perform: bedrock:ListFoundationModels because no identity-based policy allows the bedrock:ListFoundationModels action"
        );
        error.name = "AccessDeniedException";
        return Promise.reject(error);
      }
    });

    const response = await app.request("/api/aws/models");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      reason: "access_denied",
      region: "us-east-2",
      profile: "learning-dev",
      message:
        "AWS credentials are valid, but this role is not authorized to call bedrock:ListFoundationModels."
    });
  });

  it("lists configured AWS profiles", async () => {
    const app = createApp(testConfig(), {
      awsProfilesProvider: () =>
        Promise.resolve([
          { name: "work", region: "us-west-2" },
          { name: "default", region: null }
        ])
    });

    const response = await app.request("/api/aws/profiles");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      profiles: [
        { name: "default", region: null },
        { name: "work", region: "us-west-2" }
      ]
    });
  });

  it("writes an AWS SSO profile from local setup", async () => {
    const app = createApp(testConfig(), {
      awsProfileWriter: (profile) => Promise.resolve({ name: profile.name, region: profile.region })
    });
    const response = await app.request("/api/aws/profiles", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-learning-hub-action": "write-aws-profile"
      },
      body: JSON.stringify({
        name: "l2anything",
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        accountId: "123456789012",
        roleName: "BedrockAccess",
        region: "us-east-2"
      })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      profile: {
        name: "l2anything",
        region: "us-east-2"
      }
    });
  });

  it("writes SSO profile fields through AWS CLI arguments", async () => {
    const calls: string[][] = [];
    const profile = await writeAwsProfile(
      {
        name: "l2anything",
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        accountId: "123456789012",
        roleName: "BedrockAccess",
        region: "us-east-2"
      },
      (args) => {
        calls.push(args);
        return Promise.resolve({ exitCode: 0, stderr: "", stdout: "" });
      }
    );

    expect(profile).toEqual({ name: "l2anything", region: "us-east-2" });
    expect(calls).toEqual([
      [
        "configure",
        "set",
        "sso_start_url",
        "https://example.awsapps.com/start",
        "--profile",
        "l2anything"
      ],
      ["configure", "set", "sso_region", "us-east-1", "--profile", "l2anything"],
      ["configure", "set", "sso_account_id", "123456789012", "--profile", "l2anything"],
      ["configure", "set", "sso_role_name", "BedrockAccess", "--profile", "l2anything"],
      ["configure", "set", "region", "us-east-2", "--profile", "l2anything"],
      ["configure", "set", "output", "json", "--profile", "l2anything"]
    ]);
  });

  it("rejects AWS profile writes outside the local setup action", async () => {
    const app = createApp(testConfig());
    const response = await app.request("/api/aws/profiles", { method: "PUT" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "forbidden"
    });
  });

  it("runs the configured local AWS login command", async () => {
    const app = createApp(testConfig({ AWS_LOGIN_COMMAND: "bedrock-login" }), {
      awsLoginRunner: (command) =>
        Promise.resolve({
          exitCode: command === "bedrock-login" ? 0 : 1,
          stderr: "",
          stdout: ""
        })
    });

    const response = await app.request("/api/aws/login", {
      method: "POST",
      headers: {
        "x-learning-hub-action": "aws-login"
      }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      command: "bedrock-login",
      message: "AWS login command completed. AWS status will refresh now."
    });
  });

  it("falls back to standard AWS SSO login for the configured profile", async () => {
    const app = createApp(testConfig({ AWS_LOGIN_COMMAND: "" }), {
      awsLoginRunner: (command) =>
        Promise.resolve({
          exitCode: command === "aws sso login --profile learning-dev" ? 0 : 1,
          stderr: "",
          stdout: ""
        })
    });

    const response = await app.request("/api/aws/login", {
      method: "POST",
      headers: {
        "x-learning-hub-action": "aws-login"
      }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      command: "aws sso login --profile learning-dev",
      message: "AWS login command completed. AWS status will refresh now."
    });
  });

  it("runs AWS SSO login for a profile selected during setup", async () => {
    const app = createApp(testConfig({ AWS_LOGIN_COMMAND: "bedrock-login" }), {
      awsLoginRunner: (command) =>
        Promise.resolve({
          exitCode: command === "aws sso login --profile setup-profile" ? 0 : 1,
          stderr: "",
          stdout: ""
        })
    });

    const response = await app.request("/api/aws/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-learning-hub-action": "aws-login"
      },
      body: JSON.stringify({ profile: "setup-profile" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      command: "aws sso login --profile setup-profile"
    });
  });

  it("returns clean failures when the local AWS login command fails", async () => {
    const app = createApp(testConfig({ AWS_LOGIN_COMMAND: "bedrock-login" }), {
      awsLoginRunner: () =>
        Promise.resolve({
          exitCode: 1,
          stderr: "not recognized",
          stdout: ""
        })
    });

    const response = await app.request("/api/aws/login", {
      method: "POST",
      headers: {
        "x-learning-hub-action": "aws-login"
      }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      command: "bedrock-login",
      exitCode: 1,
      message: "AWS login command exited with code 1."
    });
  });

  it("rejects AWS login posts that do not come from the local app action", async () => {
    const app = createApp(testConfig(), {
      awsLoginRunner: () =>
        Promise.resolve({
          exitCode: 0,
          stderr: "",
          stdout: ""
        })
    });

    const response = await app.request("/api/aws/login", { method: "POST" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "forbidden"
    });
  });
});
