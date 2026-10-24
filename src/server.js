import "dotenv/config";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectToDatabase, mongoose } from "./db/mongoose.js";
import { Alert } from "./models/alert.js";
import { GeminiDailyUsage } from "./models/geminiDailyUsage.js";
import { Monitor } from "./models/monitor.js";
import { MonitorCapacity } from "./models/monitorCapacity.js";
import { Workspace } from "./models/workspace.js";
import { WorkspaceAccessLink } from "./models/workspaceAccessLink.js";
import { createWorkspacePurgeService } from "./services/workspacePurgeService.js";

try {
  await connectToDatabase(env.mongoUri);
  await Alert.init();
  await GeminiDailyUsage.init();
  await Workspace.init();
  await Monitor.init();
  await MonitorCapacity.init();
  await WorkspaceAccessLink.init();
  const workspacePurgeService = createWorkspacePurgeService();
  await workspacePurgeService.purgeInactiveWorkspaces(env.workspaceInactivePurgeDays);
  const purgeTimer = setInterval(() => {
    workspacePurgeService.purgeInactiveWorkspaces(env.workspaceInactivePurgeDays)
      .catch((error) => logger.error({ err: error }, "Inactive workspace purge failed"));
  }, 24 * 60 * 60 * 1000);
  purgeTimer.unref();
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, "API monitor server listening");
  });

  const shutdown = (signal) => {
    logger.info({ signal }, "Shutting down server");
    clearInterval(purgeTimer);
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
