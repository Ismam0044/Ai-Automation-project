import "dotenv/config";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectToDatabase, mongoose } from "./db/mongoose.js";
import { Alert } from "./models/alert.js";
import { GeminiDailyUsage } from "./models/geminiDailyUsage.js";
import { Monitor } from "./models/monitor.js";
import { MonitorCheck } from "./models/monitorCheck.js";
import { MonitorCapacity } from "./models/monitorCapacity.js";
import { Workspace } from "./models/workspace.js";
import { WorkspaceAccessLink } from "./models/workspaceAccessLink.js";
import { createWorkspacePurgeService } from "./services/workspacePurgeService.js";
import { createMonitorScheduler } from "./services/monitorScheduler.js";
import { createMonitorCheckRuntime } from "./services/monitorCheckRuntime.js";
import { generateAlertMessage } from "./services/llmService.js";
import { privateTargetsStartupMessage } from "./config/privateTargets.js";

logger.info(privateTargetsStartupMessage(env.allowPrivateTargets));
try {
  await connectToDatabase(env.mongoUri);
  await Alert.init();
  await GeminiDailyUsage.init();
  await Workspace.init();
  await Monitor.init();
  await MonitorCheck.init();
  await MonitorCapacity.init();
  await WorkspaceAccessLink.init();
  const workspacePurgeService = createWorkspacePurgeService();
  let purgeTimer;
  await workspacePurgeService.purgeInactiveWorkspaces(env.workspaceInactivePurgeDays);
  purgeTimer = setInterval(() => {
    workspacePurgeService.purgeInactiveWorkspaces(env.workspaceInactivePurgeDays)
      .catch((error) => logger.error({ err: error }, "Inactive workspace purge failed"));
  }, 24 * 60 * 60 * 1000);
  purgeTimer.unref();
  let scheduler;
  if (env.schedulerEnabled) {
    const { monitorRepository, monitorCheckService } = createMonitorCheckRuntime({
      settings: env,
      llmService: { generateAlertMessage },
      logger,
    });
    scheduler = createMonitorScheduler({
      monitorRepository,
      monitorCheckService,
      tickIntervalMs: env.schedulerTickIntervalMs,
      concurrency: env.schedulerConcurrency,
      leaseMs: Math.max(env.monitorCheckLeaseMs, 30_000 + 2 * env.geminiTimeoutMs + 10_000),
      jitterMs: env.schedulerJitterMs,
      logger,
    });
    scheduler.start();
  }
  const server = app.listen(env.port, "0.0.0.0", () => {
    logger.info({ port: env.port }, "API monitor server listening");
  });

  const shutdown = (signal) => {
    logger.info({ signal }, "Shutting down server");
    if (purgeTimer) clearInterval(purgeTimer);
    scheduler?.stop();
    server.close(async () => {
      try {
        await scheduler?.stop();
        await mongoose.disconnect();
      } catch (shutdownError) {
        logger.error({ err: shutdownError }, "Graceful shutdown did not complete cleanly");
        process.exitCode = 1;
      } finally {
        process.exit();
      }
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
} catch (error) {
  logger.fatal({ err: error }, "Server startup failed");
  process.exit(1);
}
