import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
export const DEFAULT_CONVERSE_MODEL_ID = "us.anthropic.claude-sonnet-5";

const serverEnvSchema = z.object({
  LEARNING_HUB_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  AWS_PROFILE: z.preprocess(emptyToUndefined, z.string().optional()),
  AWS_REGION: z.preprocess(emptyToUndefined, z.string().default("us-east-2")),
  AWS_LOGIN_COMMAND: z.preprocess(emptyToUndefined, z.string().optional()),
  DEFAULT_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(["bedrock-converse", "bedrock-mantle"]).default("bedrock-converse")
  ),
  CONVERSE_MODEL_ID: z.preprocess(emptyToUndefined, z.string().default(DEFAULT_CONVERSE_MODEL_ID)),
  MANTLE_MODEL_ID: z.preprocess(emptyToUndefined, z.string().default("openai.gpt-5.5")),
  MANTLE_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  TAVILY_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(8787)),
  DB_PATH: z.preprocess(emptyToUndefined, z.string().optional())
});

export type ServerConfig = Omit<z.infer<typeof serverEnvSchema>, "MANTLE_BASE_URL"> & {
  MANTLE_BASE_URL: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = serverEnvSchema.parse(env);

  return {
    ...parsed,
    // Follow the configured region unless an explicit endpoint is provided, so a
    // different AWS setup works without extra configuration.
    MANTLE_BASE_URL:
      parsed.MANTLE_BASE_URL ?? `https://bedrock-mantle.${parsed.AWS_REGION}.api.aws/openai/v1`
  };
}
