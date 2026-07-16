import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("applies defaults for empty optional environment values", () => {
    const config = loadConfig({
      LEARNING_HUB_DIR: "",
      AWS_PROFILE: "",
      AWS_REGION: "",
      AWS_LOGIN_COMMAND: "",
      DEFAULT_PROVIDER: undefined,
      CONVERSE_MODEL_ID: "",
      MANTLE_MODEL_ID: "",
      MANTLE_BASE_URL: "",
      TAVILY_API_KEY: "",
      PORT: ""
    });

    expect(config).toMatchObject({
      AWS_REGION: "us-east-2",
      DEFAULT_PROVIDER: "bedrock-converse",
      CONVERSE_MODEL_ID: "us.anthropic.claude-sonnet-5",
      MANTLE_MODEL_ID: "openai.gpt-5.6-sol",
      MANTLE_BASE_URL: "https://bedrock-mantle.us-east-2.api.aws/openai/v1",
      PORT: 8787
    });
  });

  it("derives the Mantle base URL from the configured region", () => {
    const config = loadConfig({ AWS_REGION: "eu-west-1", PORT: "" });

    expect(config.MANTLE_BASE_URL).toBe("https://bedrock-mantle.eu-west-1.api.aws/openai/v1");
  });

  it("keeps an explicit Mantle base URL over the regional default", () => {
    const config = loadConfig({
      AWS_REGION: "eu-west-1",
      MANTLE_BASE_URL: "https://example.com/openai/v1",
      PORT: ""
    });

    expect(config.MANTLE_BASE_URL).toBe("https://example.com/openai/v1");
  });

  it("rejects invalid ports", () => {
    expect(() => loadConfig({ PORT: "not-a-number" })).toThrow();
  });

  it("keeps explicit AWS login commands when configured", () => {
    expect(loadConfig({ AWS_LOGIN_COMMAND: "bedrock-login" }).AWS_LOGIN_COMMAND).toBe(
      "bedrock-login"
    );
  });
});
