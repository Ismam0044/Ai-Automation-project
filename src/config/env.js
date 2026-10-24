const port = Number(process.env.PORT ?? 3000);

function positiveIntegerFromEnv(name, defaultValue) {
  const value = Number(process.env[name] ?? defaultValue);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function trustProxyFromEnv(value = "0") {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "off") return false;
  const hops = Number(normalized);
  if (!Number.isSafeInteger(hops) || hops < 1) {
    throw new Error("TRUST_PROXY must be 0/false or a positive proxy hop count");
  }
  return hops;
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is required. Copy .env.example to .env and configure it.");
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port,
  mongoUri: process.env.MONGODB_URI,
  logLevel: process.env.LOG_LEVEL ?? "info",
  monitorBodyLimit: process.env.MONITOR_BODY_LIMIT ?? "1mb",
  monitorMaxBatchSize: positiveIntegerFromEnv("MONITOR_MAX_BATCH_SIZE", 100),
  monitorConcurrency: positiveIntegerFromEnv("MONITOR_CONCURRENCY", 5),
  alertsDefaultPageSize: positiveIntegerFromEnv("ALERTS_DEFAULT_PAGE_SIZE", 20),
  alertsMaxPageSize: positiveIntegerFromEnv("ALERTS_MAX_PAGE_SIZE", 50),
  monitorRateLimitWindowMs: positiveIntegerFromEnv("MONITOR_RATE_LIMIT_WINDOW_MS", 900000),
  monitorRateLimitMax: positiveIntegerFromEnv("MONITOR_RATE_LIMIT_MAX", 10),
  apiRateLimitWindowMs: positiveIntegerFromEnv("API_RATE_LIMIT_WINDOW_MS", 900000),
  apiRateLimitMax: positiveIntegerFromEnv("API_RATE_LIMIT_MAX", 120),
  geminiDailyCallLimit: positiveIntegerFromEnv("GEMINI_DAILY_CALL_LIMIT", 100),
  trustProxy: trustProxyFromEnv(process.env.TRUST_PROXY),
});
