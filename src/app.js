import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { createHttpError } from "./middleware/httpError.js";
import { createRateLimiters } from "./middleware/rateLimits.js";
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
    alertsDefaultPageSize: env.alertsDefaultPageSize,
    alertsMaxPageSize: env.alertsMaxPageSize,
    monitorRateLimitWindowMs: env.monitorRateLimitWindowMs,
    monitorRateLimitMax: env.monitorRateLimitMax,
    apiRateLimitWindowMs: env.apiRateLimitWindowMs,
    apiRateLimitMax: env.apiRateLimitMax,
    trustProxy: env.trustProxy,
    ...monitorSettings,
  };
  if (settings.alertsDefaultPageSize > settings.alertsMaxPageSize) {
    throw new Error("ALERTS_DEFAULT_PAGE_SIZE cannot exceed ALERTS_MAX_PAGE_SIZE");
  }
  const app = express();
  const limits = createRateLimiters(settings);
  app.set("trust proxy", settings.trustProxy);

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
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: env.nodeEnv === "production" ? [] : null,
      },
    },
  }));
  app.post("/monitor", limits.monitor);
  app.use("/alerts", limits.api);
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
