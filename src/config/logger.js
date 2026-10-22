import pino from "pino";

const isDevelopment = (process.env.NODE_ENV ?? "development") === "development";

function redactLogText(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/mongodb(?:\+srv)?:\/\/[^@\s/]+@/gi, "mongodb://[REDACTED]@")
    .replace(/\bAIza[\w-]{20,}\b/g, "[REDACTED]")
    .replace(/\bAQ\.[\w-]{20,}\b/g, "[REDACTED]")
    .replace(/((?:api[_-]?key|password|passwd)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi, "$1[REDACTED]");
}

function serializeSafeError(error) {
  if (!error || typeof error !== "object") return { message: redactLogText(String(error)) };
  return {
    type: typeof error.name === "string" ? error.name : "Error",
    message: redactLogText(error.message),
    ...(typeof error.code === "string" || typeof error.code === "number" ? { code: error.code } : {}),
    ...(typeof error.stack === "string" ? { stack: redactLogText(error.stack) } : {}),
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  serializers: { err: serializeSafeError },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.proxy-authorization",
      "req.headers.x-api-key",
      "req.headers.x-goog-api-key",
    ],
    censor: "[REDACTED]",
  },
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, singleLine: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
});
