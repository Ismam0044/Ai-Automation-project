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
import { connectToDatabase } from "./db/mongoose.js";

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
  clientDirectory = clientDistDirectory,
  appLogger = logger,
  logRequests = true,
  connectDatabase = connectToDatabase,
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
    isVercel: env.isVercel,
    cronSecret: env.cronSecret,
    cronRunDueBudgetMs: env.cronRunDueBudgetMs,
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
  const limits = createRateLimiters(settings, { serverless: settings.isVercel });
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
  if (settings.isVercel) app.use((request, _response, next) => {
    const forwardedPath = new URL(request.url, "http://vercel.internal");
    const routePath = forwardedPath.searchParams.get("route");
    if (routePath?.startsWith("/")) {
      forwardedPath.searchParams.delete("route");
      request.url = routePath + (forwardedPath.search ? forwardedPath.search : "");
    }
    next();
  });
  if (settings.isVercel) app.use(async (request, response, next) => {
    try { await connectDatabase(env.mongoUri, { serverless: true }); next(); }
    catch {
      if (request.path === "/api/health" || request.path === "/health") return next();
      return response.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "Database is unavailable." } });
    }
  });
  const apiPrefix = settings.isVercel ? "/api" : "";
  app.post(`${apiPrefix}/monitor`, limits.monitor);
  app.use(`${apiPrefix}/alerts`, limits.api);
  app.use(`${apiPrefix}/workspaces`, limits.api);
  app.use(express.json({ limit: settings.bodyLimit }));
  const clientIndexPath = path.join(clientDirectory, "index.html");
  if (existsSync(clientIndexPath)) {
    app.use(express.static(clientDirectory));
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
    isVercel: settings.isVercel,
    cronSecret: settings.cronSecret,
    cronRunDueBudgetMs: settings.cronRunDueBudgetMs,
  })) {
    app.use(settings.isVercel ? "/api" : "/", router);
  }

  app.get(/.*/, (request, response, next) => {
    const isApiPath = /^\/(?:api\/)?(?:monitor|alerts|workspaces|health|cron)(?:\/|$)/.test(request.path);
    if (isApiPath || !request.accepts("html") || !existsSync(clientIndexPath)) return next();
    response.sendFile(clientIndexPath, (error) => {
      if (error) next(error);
    });
  });

  app.use((_request, _response, next) => {
    next(createHttpError(404, "NOT_FOUND", "Route not found."));
  });
  app.use(createErrorHandler(appLogger));
  return app;
}

export const app = createApp();
