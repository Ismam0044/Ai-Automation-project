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
  };
}
