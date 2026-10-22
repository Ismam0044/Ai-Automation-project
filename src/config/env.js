const port = Number(process.env.PORT ?? 3000);

function positiveIntegerFromEnv(name, defaultValue) {
  const value = Number(process.env[name] ?? defaultValue);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
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
});
