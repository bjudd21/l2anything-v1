import {
  settingsResponseSchema,
  settingsUpdateSchema,
  type SettingsResponse
} from "@learning-hub/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppDatabase } from "../db/client.js";
import { appSettings } from "../db/schema.js";
import { createBedrockConverseProvider } from "../llm/providers/bedrock-converse.js";
import { createBedrockMantleProvider } from "../llm/providers/bedrock-mantle.js";
import type { ServerConfig } from "../config.js";

const settingKeys = {
  defaultProvider: "default_provider",
  converseModelId: "converse_model_id",
  mantleModelId: "mantle_model_id"
} as const;

export interface SettingsRouteDependencies {
  config: ServerConfig;
  db: AppDatabase;
}

function getSetting(db: AppDatabase, key: string) {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value;
}

function setSetting(db: AppDatabase, key: string, value: string) {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value }
    })
    .run();
}

export function readSettings({ config, db }: SettingsRouteDependencies): SettingsResponse {
  return settingsResponseSchema.parse({
    ok: true,
    workspaceDir: config.LEARNING_HUB_DIR ?? null,
    awsProfile: config.AWS_PROFILE ?? null,
    awsRegion: config.AWS_REGION,
    awsLoginCommand: config.AWS_LOGIN_COMMAND ?? null,
    defaultProvider: getSetting(db, settingKeys.defaultProvider) ?? config.DEFAULT_PROVIDER,
    converseModelId:
      getSetting(db, settingKeys.converseModelId) ?? config.CONVERSE_MODEL_ID ?? null,
    mantleModelId: getSetting(db, settingKeys.mantleModelId) ?? config.MANTLE_MODEL_ID,
    mantleBaseUrl: config.MANTLE_BASE_URL,
    tavilyConfigured: Boolean(config.TAVILY_API_KEY)
  });
}

// Builds the LLM provider from the *effective* settings (SQLite overrides first,
// then environment), so choices saved on the Settings page actually take effect.
export function createConfiguredChatProvider({ config, db }: SettingsRouteDependencies) {
  const settings = readSettings({ config, db });
  const effectiveConfig: ServerConfig = {
    ...config,
    CONVERSE_MODEL_ID: settings.converseModelId ?? config.CONVERSE_MODEL_ID,
    MANTLE_MODEL_ID: settings.mantleModelId
  };

  return settings.defaultProvider === "bedrock-mantle"
    ? createBedrockMantleProvider(effectiveConfig)
    : createBedrockConverseProvider(effectiveConfig);
}

export function createSettingsRoutes(dependencies: SettingsRouteDependencies) {
  const routes = new Hono();

  routes.get("/", (context) => context.json(readSettings(dependencies)));

  routes.put("/", async (context) => {
    const parsed = settingsUpdateSchema.safeParse(await context.req.json().catch(() => ({})));

    if (!parsed.success) {
      return context.json(
        {
          ok: false,
          error: "invalid_settings",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        400
      );
    }

    if (parsed.data.defaultProvider) {
      setSetting(dependencies.db, settingKeys.defaultProvider, parsed.data.defaultProvider);
    }

    if (parsed.data.converseModelId) {
      setSetting(dependencies.db, settingKeys.converseModelId, parsed.data.converseModelId);
    }

    if (parsed.data.mantleModelId) {
      setSetting(dependencies.db, settingKeys.mantleModelId, parsed.data.mantleModelId);
    }

    return context.json(readSettings(dependencies));
  });

  return routes;
}
