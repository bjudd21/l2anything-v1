import { createHealthResponse, healthResponseSchema } from "@learning-hub/shared";
import type Database from "better-sqlite3";
import { Hono } from "hono";
import { createSqliteConnection, type AppDatabase } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import type { ServerConfig } from "./config.js";
import type { ChatProvider } from "./llm/types.js";
import {
  createAwsRoutes,
  type AwsIdentityProvider,
  type AwsLoginRunner,
  type AwsModelsProvider
} from "./routes/aws.js";
import { createDashboardRoutes } from "./routes/dashboard.js";
import { createQuizRoutes } from "./routes/quizzes.js";
import { createSettingsRoutes } from "./routes/settings.js";
import { createTopicsRoutes } from "./routes/topics.js";

export interface AppDatabaseConnection {
  db: AppDatabase;
  sqlite: Database.Database;
}

export interface CreateAppOptions {
  awsIdentityProvider?: AwsIdentityProvider;
  awsLoginRunner?: AwsLoginRunner;
  awsModelsProvider?: AwsModelsProvider;
  chatProvider?: ChatProvider;
  database?: AppDatabaseConnection;
}

export function createApp(config: ServerConfig, options: CreateAppOptions = {}) {
  const app = new Hono();
  const database = options.database ?? createSqliteConnection();

  runMigrations(database.sqlite);

  app.get("/health", (context) => {
    const response = createHealthResponse("0.0.0");

    return context.json({
      ...healthResponseSchema.parse(response),
      region: config.AWS_REGION
    });
  });

  app.route(
    "/api/aws",
    createAwsRoutes(
      config,
      options.awsIdentityProvider,
      options.awsModelsProvider,
      options.awsLoginRunner
    )
  );
  app.route(
    "/api/settings",
    createSettingsRoutes({
      config,
      db: database.db
    })
  );
  app.route(
    "/api/dashboard",
    createDashboardRoutes({
      config,
      db: database.db
    })
  );
  app.route(
    "/api/topics",
    createTopicsRoutes({
      chatProvider: options.chatProvider,
      config,
      db: database.db
    })
  );
  app.route(
    "/api/quizzes",
    createQuizRoutes({
      chatProvider: options.chatProvider,
      config,
      db: database.db
    })
  );

  app.notFound((context) =>
    context.json(
      {
        ok: false,
        error: "not_found"
      },
      404
    )
  );

  return app;
}

export type LearningHubApp = ReturnType<typeof createApp>;
