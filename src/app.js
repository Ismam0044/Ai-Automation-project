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
import { createCookieOriginGuard } from "./middleware/cookieOriginGuard.js";
import { createApiRoutes } from "./routes/index.js";

const clientDistDirectory = fileURLToPath(new URL("../client/dist/", import.meta.url));

export function createApp({
  alertService,
  llmService,
  workspaceService,
  workspaceAccessLinkService,
  monitorRepository,
  monitorCheckService,
  checkHistoryService,
  publicUrlValidator,
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
    geminiTimeoutMs: env.geminiTimeoutMs,
    apiRateLimitWindowMs: env.apiRateLimitWindowMs,
    apiRateLimitMax: env.apiRateLimitMax,
    trustProxy: env.trustProxy,
    nodeEnv: env.nodeEnv,
    publicAppUrl: env.publicAppUrl,
    workspaceCreateRateLimitWindowMs: env.workspaceCreateRateLimitWindowMs,
    workspaceCreateRateLimitMax: env.workspaceCreateRateLimitMax,
    monitorCreateRateLimitWindowMs: env.monitorCreateRateLimitWindowMs,
    monitorCreateRateLimitMax: env.monitorCreateRateLimitMax,
    maxMonitorsPerWorkspace: env.maxMonitorsPerWorkspace,
    maxTotalMonitors: env.maxTotalMonitors,
    workspaceInactivePurgeDays: env.workspaceInactivePurgeDays,
    workspaceAccessLinkTtlMinutes: env.workspaceAccessLinkTtlMinutes,
    allowPrivateTargets: env.allowPrivateTargets,
    monitorResponseMaxBytes: env.monitorResponseMaxBytes,
    checkHistoryRetentionDays: env.checkHistoryRetentionDays,
    checkHistoryMaxPageSize: env.checkHistoryMaxPageSize,
    checkNowWorkspaceWindowMs: env.checkNowWorkspaceWindowMs,
    checkNowWorkspaceMax: env.checkNowWorkspaceMax,
    checkNowMonitorWindowMs: env.checkNowMonitorWindowMs,
    checkNowMonitorMax: env.checkNowMonitorMax,
    schedulerEnabled: env.schedulerEnabled,
    schedulerTickIntervalMs: env.schedulerTickIntervalMs,
    schedulerConcurrency: env.schedulerConcurrency,
    schedulerMaxChecksPerMinute: env.schedulerMaxChecksPerMinute,
    schedulerJitterMs: env.schedulerJitterMs,
    monitorCheckLeaseMs: env.monitorCheckLeaseMs,
    autoResolveHealthyChecks: env.autoResolveHealthyChecks,
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
  app.use(createCookieOriginGuard({ nodeEnv: settings.nodeEnv, publicAppUrl: settings.publicAppUrl }));
  app.post("/monitor", limits.monitor);
  app.use("/alerts", limits.api);
  app.use("/workspaces", limits.api);
  app.use(express.json({ limit: settings.bodyLimit }));
  if (existsSync(path.join(clientDistDirectory, "index.html"))) {
    app.use(express.static(clientDistDirectory));
  }

  for (const router of createApiRoutes({
    alertService,
    llmService,
    workspaceService,
    workspaceAccessLinkService,
    monitorRepository,
    monitorCheckService,
    checkHistoryService,
    publicUrlValidator,
    settings,
    logger: appLogger,
    rateLimits: limits,
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
