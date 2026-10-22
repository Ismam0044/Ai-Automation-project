import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { createHttpError } from "./middleware/httpError.js";
import { createApiRoutes } from "./routes/index.js";

const clientDistDirectory = fileURLToPath(new URL("../client/dist/", import.meta.url));

export function createApp({
  alertService,
  llmService,
  monitorSettings = {},
  appLogger = logger,
  logRequests = true,
} = {}) {
  const settings = {
    bodyLimit: env.monitorBodyLimit,
    maxBatchSize: env.monitorMaxBatchSize,
    concurrency: env.monitorConcurrency,
    ...monitorSettings,
  };
  const app = express();

  if (logRequests) {
    app.use(pinoHttp({
      logger: appLogger,
      serializers: {
        req: (request) => ({
          id: request.id,
          method: request.method,
          url: typeof request.url === "string" ? request.url.split("?", 1)[0] : undefined,
        }),
      },
      customProps: (request) => ({ requestId: request.id }),
    }));
  }
  app.use(express.json({ limit: settings.bodyLimit }));
  if (existsSync(path.join(clientDistDirectory, "index.html"))) {
    app.use(express.static(clientDistDirectory));
  }

  for (const router of createApiRoutes({
    alertService,
    llmService,
    settings,
    logger: appLogger,
  })) {
    app.use(router);
  }

  app.use((_request, _response, next) => {
    next(createHttpError(404, "NOT_FOUND", "Route not found."));
  });
  app.use(createErrorHandler(appLogger));
  return app;
}

export const app = createApp();
