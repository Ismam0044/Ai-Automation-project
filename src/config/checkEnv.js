import { parseMongoUri } from "./mongoUri.js";

export const NUMERIC_ENV_DEFAULTS = Object.freeze({
  PORT: 3000,
  TRUST_PROXY: 0,
  MONITOR_MAX_BATCH_SIZE: 100,
  MONITOR_CONCURRENCY: 5,
  ALERTS_DEFAULT_PAGE_SIZE: 20,
  ALERTS_MAX_PAGE_SIZE: 50,
  MONITOR_RATE_LIMIT_WINDOW_MS: 900000,
  MONITOR_RATE_LIMIT_MAX: 10,
  API_RATE_LIMIT_WINDOW_MS: 900000,
  API_RATE_LIMIT_MAX: 120,
  GEMINI_DAILY_CALL_LIMIT: 100,
  GEMINI_TIMEOUT_MS: 10000,
  WORKSPACE_CREATE_RATE_LIMIT_WINDOW_MS: 3600000,
  WORKSPACE_CREATE_RATE_LIMIT_MAX: 5,
  MONITOR_CREATE_RATE_LIMIT_WINDOW_MS: 900000,
  MONITOR_CREATE_RATE_LIMIT_MAX: 30,
  MONITORS_PER_WORKSPACE_MAX: 50,
  MONITORS_TOTAL_MAX: 1000,
  WORKSPACE_INACTIVE_PURGE_DAYS: 90,
  WORKSPACE_ACCESS_LINK_TTL_MINUTES: 15,
  MONITOR_RESPONSE_MAX_BYTES: 1048576,
  CHECK_HISTORY_RETENTION_DAYS: 14,
  CHECK_HISTORY_MAX_PAGE_SIZE: 50,
  CHECK_NOW_WORKSPACE_WINDOW_MS: 3600000,
  CHECK_NOW_WORKSPACE_MAX: 30,
  CHECK_NOW_MONITOR_WINDOW_MS: 3600000,
  CHECK_NOW_MONITOR_MAX: 6,
  SCHEDULER_TICK_INTERVAL_MS: 5000,
  SCHEDULER_CONCURRENCY: 5,
  SCHEDULER_MAX_CHECKS_PER_MINUTE: 60,
  SCHEDULER_JITTER_MS: 5000,
  MONITOR_CHECK_LEASE_MS: 120000,
  AUTO_RESOLVE_CONSECUTIVE_HEALTHY_CHECKS: 2,
});

function numericSetting(source, name, defaultValue) {
  if (source[name] === undefined) return defaultValue;
  if (name === "TRUST_PROXY") {
    const normalized = String(source[name]).trim().toLowerCase();
    if (["0", "false", "off"].includes(normalized)) return false;
    const hops = Number(normalized);
    return Number.isSafeInteger(hops) && hops > 0 ? hops : "invalid";
  }
  const parsed = Number(source[name]);
  const valid = Number.isSafeInteger(parsed) && parsed > 0
    && (name !== "PORT" || parsed <= 65535);
  return valid ? parsed : "invalid";
}

export function summarizeEnvironment(source = process.env) {
  const uri = source.MONGODB_URI;
  let mongodb = { present: Boolean(uri) };
  let valid = Boolean(uri);
  if (uri) {
    try {
      const parsed = parseMongoUri(uri);
      mongodb = {
        present: true,
        scheme: parsed.scheme,
        hosts: parsed.hostCount,
        databaseName: parsed.databaseName,
        hadTrailingSlash: parsed.hadTrailingSlash,
        optionNames: parsed.optionNames,
      };
    } catch (error) {
      valid = false;
      mongodb = { present: true, valid: false, error: error.message };
    }
  }

  const apiKey = source.GEMINI_API_KEY ?? "";
  const numericSettings = Object.fromEntries(Object.entries(NUMERIC_ENV_DEFAULTS)
    .map(([name, value]) => [name, numericSetting(source, name, value)]));
  return {
    required: { MONGODB_URI: uri ? "present" : "missing" },
    mongodb,
    gemini: {
      GEMINI_API_KEY: apiKey ? "present" : "missing",
      GEMINI_API_KEY_length: apiKey.length,
      GEMINI_MODEL: source.GEMINI_MODEL || "missing",
    },
    numericSettings,
    valid,
  };
}
