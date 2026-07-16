import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import {
  awsLoginRequestSchema,
  awsLoginResponseSchema,
  awsModelsResponseSchema,
  awsProfileCreateResponseSchema,
  awsProfileCreateSchema,
  awsProfilesResponseSchema,
  awsStatusResponseSchema,
  type AwsLoginResponse,
  type AwsModel,
  type AwsModelsResponse,
  type AwsProfile,
  type AwsProfileCreate,
  type AwsProfilesResponse,
  type AwsStatusResponse
} from "@learning-hub/shared";
import { Hono } from "hono";
import { spawn } from "node:child_process";
import { classifyAwsCredentialError } from "../aws/errors.js";
import type { ServerConfig } from "../config.js";

const AWS_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const AWS_CLI_TIMEOUT_MS = 30 * 1000;
const OUTPUT_LIMIT = 4000;

export type AwsIdentityProvider = (
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION">
) => Promise<{ account?: string; arn?: string }>;

export type AwsAccessProvider = (
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION" | "CONVERSE_MODEL_ID">
) => Promise<void>;

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
export type AwsProfilesProvider = () => Promise<AwsProfile[]>;
export type AwsProfileWriter = (profile: AwsProfileCreate) => Promise<AwsProfile>;
export type AwsCliRunner = (args: string[]) => Promise<AwsLoginRunResult>;

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

async function runAwsCli(args: string[]): Promise<AwsLoginRunResult> {
  return new Promise((resolve) => {
    const child = spawn("aws", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, AWS_CLI_TIMEOUT_MS);

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
    child.once("error", (error) => finish({ exitCode: null, startError: error.message }));
    child.once("close", (exitCode) => finish({ exitCode, timedOut }));
  });
}

export async function listAwsProfiles(cliRunner: AwsCliRunner = runAwsCli): Promise<AwsProfile[]> {
  const result = await cliRunner(["configure", "list-profiles"]);
  if (result.exitCode !== 0 || result.timedOut || result.startError) {
    throw new Error((result.startError ?? result.stderr) || "AWS profiles could not be listed.");
  }

  const names = [
    ...new Set(
      result.stdout
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
    )
  ];
  return Promise.all(
    names.map(async (name) => {
      const regionResult = await cliRunner(["configure", "get", "region", "--profile", name]);
      return {
        name,
        region: regionResult.exitCode === 0 ? regionResult.stdout.trim() || null : null
      };
    })
  );
}

export async function writeAwsProfile(
  profile: AwsProfileCreate,
  cliRunner: AwsCliRunner = runAwsCli
): Promise<AwsProfile> {
  const values: Array<[string, string]> = [
    ["sso_start_url", profile.ssoStartUrl],
    ["sso_region", profile.ssoRegion],
    ["sso_account_id", profile.accountId],
    ["sso_role_name", profile.roleName],
    ["region", profile.region],
    ["output", "json"]
  ];

  for (const [key, value] of values) {
    const result = await cliRunner(["configure", "set", key, value, "--profile", profile.name]);
    if (result.exitCode !== 0 || result.timedOut || result.startError) {
      throw new Error((result.startError ?? result.stderr) || `AWS profile field ${key} failed.`);
    }
  }

  return { name: profile.name, region: profile.region };
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

async function defaultAwsAccessProvider(
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION" | "CONVERSE_MODEL_ID">
) {
  const client = new BedrockRuntimeClient({
    region: config.AWS_REGION,
    credentials: defaultProvider({
      profile: config.AWS_PROFILE
    })
  });

  const response = await client.send(
    new ConverseStreamCommand({
      modelId: config.CONVERSE_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: "Reply with OK." }]
        }
      ],
      inferenceConfig: {
        maxTokens: 32
      }
    })
  );

  if (!response.stream) {
    throw new Error("Bedrock Converse access check did not return a stream.");
  }

  for await (const event of response.stream) {
    if (event.messageStop) {
      break;
    }
  }
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

export async function getAwsSetupStatus(
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION" | "CONVERSE_MODEL_ID">,
  identityProvider: AwsIdentityProvider = defaultAwsIdentityProvider,
  accessProvider: AwsAccessProvider = defaultAwsAccessProvider
): Promise<AwsStatusResponse> {
  const identity = await getAwsStatus(config, identityProvider);
  if (!identity.ok) {
    return identity;
  }

  try {
    await accessProvider(config);
    return identity;
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

export async function getAwsProfiles(
  profilesProvider: AwsProfilesProvider = listAwsProfiles
): Promise<AwsProfilesResponse> {
  try {
    const profiles = await profilesProvider();
    return awsProfilesResponseSchema.parse({
      ok: true,
      profiles: profiles.sort((a, b) => a.name.localeCompare(b.name))
    });
  } catch {
    return awsProfilesResponseSchema.parse({
      ok: false,
      message: "AWS profiles could not be read. Confirm that AWS CLI v2 is installed."
    });
  }
}

export async function runAwsLogin(
  config: Pick<ServerConfig, "AWS_LOGIN_COMMAND" | "AWS_PROFILE">,
  loginRunner: AwsLoginRunner = defaultAwsLoginRunner,
  profileOverride?: string
): Promise<AwsLoginResponse> {
  const profile = profileOverride === undefined ? config.AWS_PROFILE : profileOverride || undefined;
  const command = profileOverride === undefined ? config.AWS_LOGIN_COMMAND?.trim() : undefined;
  const resolvedCommand =
    command ?? (profile ? `aws sso login --profile ${profile}` : "aws sso login");
  const result = await loginRunner(resolvedCommand);

  if (result.exitCode === 0 && !result.timedOut && !result.startError) {
    return awsLoginResponseSchema.parse({
      ok: true,
      command: resolvedCommand,
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
    command: resolvedCommand,
    exitCode: result.exitCode,
    message: detail
  });
}

export function createAwsRoutes(
  config: Pick<ServerConfig, "AWS_PROFILE" | "AWS_REGION" | "AWS_LOGIN_COMMAND">,
  identityProvider?: AwsIdentityProvider,
  modelsProvider?: AwsModelsProvider,
  loginRunner?: AwsLoginRunner,
  profilesProvider?: AwsProfilesProvider,
  profileWriter?: AwsProfileWriter
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

  routes.get("/profiles", async (context) => {
    const profiles = await getAwsProfiles(profilesProvider);
    return context.json(profiles);
  });

  routes.put("/profiles", async (context) => {
    if (context.req.header("x-learning-hub-action") !== "write-aws-profile") {
      return context.json(
        {
          ok: false,
          error: "forbidden",
          message: "AWS profiles must be created from the local setup screen."
        },
        403
      );
    }

    const parsed = awsProfileCreateSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(
        {
          ok: false,
          error: "invalid_profile",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        400
      );
    }

    try {
      const profile = await (profileWriter ?? writeAwsProfile)(parsed.data);
      return context.json(awsProfileCreateResponseSchema.parse({ ok: true, profile }));
    } catch {
      return context.json(
        {
          ok: false,
          error: "profile_write_failed",
          message: "The AWS CLI could not write this profile."
        },
        500
      );
    }
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

    const parsed = awsLoginRequestSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json(
        {
          ok: false,
          error: "invalid_login",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        400
      );
    }

    const login = await runAwsLogin(config, loginRunner, parsed.data.profile);

    return context.json(login);
  });

  return routes;
}
