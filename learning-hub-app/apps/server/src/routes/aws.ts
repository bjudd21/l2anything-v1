import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import {
  awsLoginResponseSchema,
  awsModelsResponseSchema,
  awsStatusResponseSchema,
  type AwsLoginResponse,
  type AwsModel,
  type AwsModelsResponse,
  type AwsStatusResponse
} from "@learning-hub/shared";
import { Hono } from "hono";
import { spawn } from "node:child_process";
import { classifyAwsCredentialError } from "../aws/errors.js";
import type { ServerConfig } from "../config.js";

const AWS_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const OUTPUT_LIMIT = 4000;

export type AwsIdentityProvider = (
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION">
) => Promise<{ account?: string; arn?: string }>;

export type AwsModelsProvider = (
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION">
) => Promise<AwsModel[]>;

export interface AwsLoginRunResult {
  exitCode: number | null;
  stderr: string;
  stdout: string;
  timedOut?: boolean;
  startError?: string;
}

export type AwsLoginRunner = (command: string) => Promise<AwsLoginRunResult>;

function limitOutput(output: string) {
  return output.length > OUTPUT_LIMIT ? output.slice(-OUTPUT_LIMIT) : output;
}

async function defaultAwsLoginRunner(command: string): Promise<AwsLoginRunResult> {
  return new Promise((resolve) => {
    // PowerShell on Windows, POSIX shell elsewhere, so the login command works
    // on a machine that has never installed pwsh.
    const child =
      process.platform === "win32"
        ? spawn("powershell.exe", ["-Command", command], { windowsHide: true })
        : spawn("/bin/sh", ["-c", command]);
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, AWS_LOGIN_TIMEOUT_MS);

    const finish = (result: Omit<AwsLoginRunResult, "stderr" | "stdout">) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        ...result,
        stderr: limitOutput(stderr),
        stdout: limitOutput(stdout)
      });
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.once("error", (error) => {
      finish({
        exitCode: null,
        startError: error.message
      });
    });

    child.once("close", (exitCode) => {
      finish({
        exitCode,
        timedOut
      });
    });
  });
}

async function defaultAwsIdentityProvider(
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION">
) {
  const client = new STSClient({
    region: config.AWS_REGION,
    credentials: defaultProvider({
      profile: config.AWS_PROFILE
    })
  });

  const response = await client.send(new GetCallerIdentityCommand({}));

  return {
    account: response.Account,
    arn: response.Arn
  };
}

async function defaultAwsModelsProvider(config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION">) {
  const client = new BedrockClient({
    region: config.AWS_REGION,
    credentials: defaultProvider({
      profile: config.AWS_PROFILE
    })
  });

  const response = await client.send(new ListFoundationModelsCommand({}));

  return (response.modelSummaries ?? [])
    .filter((model) => Boolean(model.modelId))
    .map((model) => ({
      modelId: model.modelId ?? "",
      modelName: model.modelName ?? null,
      providerName: model.providerName ?? null,
      inputModalities: model.inputModalities ?? [],
      outputModalities: model.outputModalities ?? []
    }))
    .sort((a, b) => a.modelId.localeCompare(b.modelId));
}

export async function getAwsStatus(
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION">,
  identityProvider: AwsIdentityProvider = defaultAwsIdentityProvider
): Promise<AwsStatusResponse> {
  try {
    const identity = await identityProvider(config);

    if (!identity.account || !identity.arn) {
      throw new Error("STS GetCallerIdentity response was missing account or ARN.");
    }

    return awsStatusResponseSchema.parse({
      ok: true,
      account: identity.account,
      arn: identity.arn,
      region: config.AWS_REGION,
      profile: config.AWS_PROFILE ?? null
    });
  } catch (error) {
    const classified = classifyAwsCredentialError(error);

    return awsStatusResponseSchema.parse({
      ...classified,
      region: config.AWS_REGION,
      profile: config.AWS_PROFILE ?? null
    });
  }
}

export async function getAwsModels(
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION">,
  modelsProvider: AwsModelsProvider = defaultAwsModelsProvider
): Promise<AwsModelsResponse> {
  try {
    const models = await modelsProvider(config);

    return awsModelsResponseSchema.parse({
      ok: true,
      region: config.AWS_REGION,
      profile: config.AWS_PROFILE ?? null,
      models
    });
  } catch (error) {
    const classified = classifyAwsCredentialError(error);

    return awsModelsResponseSchema.parse({
      ...classified,
      region: config.AWS_REGION,
      profile: config.AWS_PROFILE ?? null
    });
  }
}

export async function runAwsLogin(
  config: Pick<ServerConfig, "AWS_LOGIN_COMMAND" | "AWS_PROFILE">,
  loginRunner: AwsLoginRunner = defaultAwsLoginRunner
): Promise<AwsLoginResponse> {
  const command =
    config.AWS_LOGIN_COMMAND?.trim() ??
    (config.AWS_PROFILE ? `aws sso login --profile ${config.AWS_PROFILE}` : "aws sso login");
  const result = await loginRunner(command);

  if (result.exitCode === 0 && !result.timedOut && !result.startError) {
    return awsLoginResponseSchema.parse({
      ok: true,
      command,
      message: "AWS login command completed. AWS status will refresh now."
    });
  }

  const detail =
    result.startError ??
    (result.timedOut
      ? "AWS login command timed out before completing."
      : `AWS login command exited with code ${result.exitCode ?? "unknown"}.`);

  return awsLoginResponseSchema.parse({
    ok: false,
    command,
    exitCode: result.exitCode,
    message: detail
  });
}

export function createAwsRoutes(
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION" | "AWS_LOGIN_COMMAND">,
  identityProvider?: AwsIdentityProvider,
  modelsProvider?: AwsModelsProvider,
  loginRunner?: AwsLoginRunner
) {
  const routes = new Hono();

  routes.get("/status", async (context) => {
    const status = await getAwsStatus(config, identityProvider);

    return context.json(status);
  });

  routes.get("/models", async (context) => {
    const models = await getAwsModels(config, modelsProvider);

    return context.json(models);
  });

  routes.post("/login", async (context) => {
    if (context.req.header("x-learning-hub-action") !== "aws-login") {
      return context.json(
        {
          ok: false,
          error: "forbidden",
          message: "AWS login must be started from the local app."
        },
        403
      );
    }

    const login = await runAwsLogin(config, loginRunner);

    return context.json(login);
  });

  return routes;
}
