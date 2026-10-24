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
import { createMonitorCheckService } from "./services/monitorCheckService.js";
import { createMonitorRepository } from "./services/monitorRepository.js";
import { createCheckHistoryService } from "./services/checkHistoryService.js";

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
  await workspacePurgeService.purgeInactiveWorkspaces(env.workspaceInactivePurgeDays);
  const purgeTimer = setInterval(() => {
    workspacePurgeService.purgeInactiveWorkspaces(env.workspaceInactivePurgeDays)
      .catch((error) => logger.error({ err: error }, "Inactive workspace purge failed"));
  }, 24 * 60 * 60 * 1000);
  purgeTimer.unref();
  let scheduler;
  if (env.schedulerEnabled) {
    const monitorRepository = createMonitorRepository({
      maxMonitorsPerWorkspace: env.maxMonitorsPerWorkspace,
      maxTotalMonitors: env.maxTotalMonitors,
    });
    const historyService = createCheckHistoryService({ retentionDays: env.checkHistoryRetentionDays });
    const monitorCheckService = createMonitorCheckService({
      monitorRepository,
      historyService,
      autoResolveHealthyChecks: env.autoResolveHealthyChecks,
      leaseMs: Math.max(env.monitorCheckLeaseMs, 30_000 + 2 * env.geminiTimeoutMs + 10_000),
      responseMaxBytes: env.monitorResponseMaxBytes,
      allowPrivateTargets: env.allowPrivateTargets,
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
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, "API monitor server listening");
  });

  const shutdown = (signal) => {
    logger.info({ signal }, "Shutting down server");
    clearInterval(purgeTimer);
    scheduler?.stop();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
} catch (error) {
  logger.fatal({ err: error }, "Server startup failed");
  process.exit(1);
}
