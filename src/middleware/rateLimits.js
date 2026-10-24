import { rateLimit } from "express-rate-limit";
import { MongoRateLimitStore } from "../services/mongoRateLimitStore.js";

function makeLimiter({ windowMs, limit, store }) {
  return rateLimit({
    windowMs,
    limit,
    ...(store ? { store } : {}),
    standardHeaders: true,
    legacyHeaders: false,
    handler(_request, response) {
      response.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
        },
      });
    },
  });
}

function makeScopedLimiter({ windowMs, limit, key, store }) {
  if (store) return async function mongoScopedLimiter(request, response, next) {
    try {
      const { totalHits } = await store.increment(key(request));
      if (totalHits > limit) return response.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } });
      return next();
    } catch (error) { return next(error); }
  };
  const windows = new Map();
  return function scopedLimiter(request, response, next) {
    const now = Date.now();
    for (const [entry, value] of windows) if (now - value.start >= windowMs) windows.delete(entry);
    const scopeKey = key(request);
    const current = windows.get(scopeKey);
    if (!current || now - current.start >= windowMs) {
      windows.set(scopeKey, { start: now, count: 1 });
      return next();
    }
    if (current.count >= limit) {
      return response.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
      });
    }
    current.count += 1;
    return next();
  };
}

export function createRateLimiters(settings, { serverless = settings.isVercel === true, Store = MongoRateLimitStore } = {}) {
  const store = (name, windowMs) => {
    if (!serverless) return undefined;
    const instance = new Store({ prefix: name });
    instance.init({ windowMs });
    return instance;
  };
  return {
    monitor: makeLimiter({
      windowMs: settings.monitorRateLimitWindowMs,
      limit: settings.monitorRateLimitMax,
      store: store("monitor", settings.monitorRateLimitWindowMs),
    }),
    api: makeLimiter({
      windowMs: settings.apiRateLimitWindowMs,
      limit: settings.apiRateLimitMax,
      store: store("api", settings.apiRateLimitWindowMs),
    }),
    workspaceCreate: makeLimiter({
      windowMs: settings.workspaceCreateRateLimitWindowMs,
      limit: settings.workspaceCreateRateLimitMax,
      store: store("workspace-create", settings.workspaceCreateRateLimitWindowMs),
    }),
    monitorCreate: makeLimiter({
      windowMs: settings.monitorCreateRateLimitWindowMs,
      limit: settings.monitorCreateRateLimitMax,
      store: store("monitor-create", settings.monitorCreateRateLimitWindowMs),
    }),
    checkNowWorkspace: makeScopedLimiter({
      windowMs: settings.checkNowWorkspaceWindowMs,
      limit: settings.checkNowWorkspaceMax,
      key: (request) => String(request.workspaceId),
      store: store("check-now-workspace", settings.checkNowWorkspaceWindowMs),
    }),
    checkNowMonitor: makeScopedLimiter({
      windowMs: settings.checkNowMonitorWindowMs,
      limit: settings.checkNowMonitorMax,
      key: (request) => `${request.workspaceId}:${request.params.monitorId}`,
      store: store("check-now-monitor", settings.checkNowMonitorWindowMs),
    }),
  };
}
