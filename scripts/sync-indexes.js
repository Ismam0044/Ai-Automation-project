import "dotenv/config";
import { env } from "../src/config/env.js";
import { connectToDatabase, mongoose } from "../src/db/mongoose.js";
import { Alert } from "../src/models/alert.js";
import { GeminiDailyUsage } from "../src/models/geminiDailyUsage.js";
import { Monitor } from "../src/models/monitor.js";
import { MonitorCheck } from "../src/models/monitorCheck.js";
import { MonitorCapacity } from "../src/models/monitorCapacity.js";
import { Workspace } from "../src/models/workspace.js";
import { WorkspaceAccessLink } from "../src/models/workspaceAccessLink.js";
import { RateLimitBucket } from "../src/models/rateLimitBucket.js";
import { SchedulerMinuteCounter } from "../src/models/schedulerMinuteCounter.js";
import { logger } from "../src/config/logger.js";

const models = [Alert, GeminiDailyUsage, Monitor, MonitorCheck, MonitorCapacity, Workspace, WorkspaceAccessLink, RateLimitBucket, SchedulerMinuteCounter];
try {
  await connectToDatabase(env.mongoUri, { serverless: false });
  for (const model of models) await model.createIndexes();
  logger.info({ models: models.map((model) => model.modelName) }, "MongoDB indexes synchronized");
} catch {
  logger.error("Could not synchronize MongoDB indexes. Verify MONGODB_URI and network access.");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
