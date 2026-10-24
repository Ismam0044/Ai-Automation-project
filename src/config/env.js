const port = Number(process.env.PORT ?? 3000);
const nodeEnv = process.env.NODE_ENV ?? "development";

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

const publicAppUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
let parsedPublicAppUrl;
try {
  parsedPublicAppUrl = new URL(publicAppUrl);
} catch {
  throw new Error("PUBLIC_APP_URL must be an absolute HTTP or HTTPS URL");
}
if (!["http:", "https:"].includes(parsedPublicAppUrl.protocol)
    || parsedPublicAppUrl.username || parsedPublicAppUrl.password
    || (nodeEnv === "production" && parsedPublicAppUrl.protocol !== "https:")) {
  throw new Error("PUBLIC_APP_URL must be a public HTTP URL, or HTTPS in production, without credentials");
}

export const env = Object.freeze({
  nodeEnv,
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
  workspaceCreateRateLimitWindowMs: positiveIntegerFromEnv("WORKSPACE_CREATE_RATE_LIMIT_WINDOW_MS", 3600000),
  workspaceCreateRateLimitMax: positiveIntegerFromEnv("WORKSPACE_CREATE_RATE_LIMIT_MAX", 5),
  monitorCreateRateLimitWindowMs: positiveIntegerFromEnv("MONITOR_CREATE_RATE_LIMIT_WINDOW_MS", 900000),
  monitorCreateRateLimitMax: positiveIntegerFromEnv("MONITOR_CREATE_RATE_LIMIT_MAX", 30),
  maxMonitorsPerWorkspace: positiveIntegerFromEnv("MONITORS_PER_WORKSPACE_MAX", 50),
  maxTotalMonitors: positiveIntegerFromEnv("MONITORS_TOTAL_MAX", 1000),
  workspaceInactivePurgeDays: positiveIntegerFromEnv("WORKSPACE_INACTIVE_PURGE_DAYS", 90),
  workspaceAccessLinkTtlMinutes: positiveIntegerFromEnv("WORKSPACE_ACCESS_LINK_TTL_MINUTES", 15),
  publicAppUrl: parsedPublicAppUrl.origin,
});
