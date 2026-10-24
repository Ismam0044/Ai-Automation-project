import { rateLimit } from "express-rate-limit";

function makeLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
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

function makeScopedLimiter({ windowMs, limit, key }) {
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

export function createRateLimiters(settings) {
  return {
    monitor: makeLimiter({
      windowMs: settings.monitorRateLimitWindowMs,
      limit: settings.monitorRateLimitMax,
    }),
    api: makeLimiter({
      windowMs: settings.apiRateLimitWindowMs,
      limit: settings.apiRateLimitMax,
    }),
    workspaceCreate: makeLimiter({
      windowMs: settings.workspaceCreateRateLimitWindowMs,
      limit: settings.workspaceCreateRateLimitMax,
    }),
    monitorCreate: makeLimiter({
      windowMs: settings.monitorCreateRateLimitWindowMs,
      limit: settings.monitorCreateRateLimitMax,
    }),
    checkNowWorkspace: makeScopedLimiter({
      windowMs: settings.checkNowWorkspaceWindowMs,
      limit: settings.checkNowWorkspaceMax,
      key: (request) => String(request.workspaceId),
    }),
    checkNowMonitor: makeScopedLimiter({
      windowMs: settings.checkNowMonitorWindowMs,
      limit: settings.checkNowMonitorMax,
      key: (request) => `${request.workspaceId}:${request.params.monitorId}`,
    }),
  };
}
