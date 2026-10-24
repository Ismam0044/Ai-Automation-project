import {
  findActiveAlertForDetection,
  listAlerts,
  listActiveAlerts,
  resolveAlertById,
  resolveMonitorAlerts,
  saveAlert,
} from "../services/alertService.js";
import { generateAlertMessage } from "../services/llmService.js";
import { createMonitorService } from "../services/monitorService.js";
import { createAlertController } from "../controllers/alertController.js";
import { createMonitorController } from "../controllers/monitorController.js";
import { createMonitorResourceController } from "../controllers/monitorResourceController.js";
import { createWorkspaceAccessController, createWorkspaceController } from "../controllers/workspaceController.js";
import { createMonitorRepository } from "../services/monitorRepository.js";
import { createCheckHistoryService } from "../services/checkHistoryService.js";
import { createMonitorCheckRuntime } from "../services/monitorCheckRuntime.js";
import { createWorkspaceService } from "../services/workspaceService.js";
import { createWorkspaceAccessLinkService } from "../services/workspaceAccessLinkService.js";
import { createOptionalWorkspaceAuth } from "../middleware/workspaceAuth.js";
import { createPublicUrlValidator } from "../services/publicUrlValidator.js";
import { createAlertRoutes } from "./alertRoutes.js";
import healthRoutes from "./healthRoutes.js";
import { createMonitorRoutes } from "./monitorRoutes.js";
import { createWorkspaceRoutes } from "./workspaceRoutes.js";

export function createApiRoutes({
  alertService = { findActiveAlertForDetection, saveAlert, listActiveAlerts, listAlerts, resolveAlertById, resolveMonitorAlerts },
  llmService = { generateAlertMessage },
  workspaceService,
  workspaceAccessLinkService,
  monitorRepository,
  monitorCheckService,
  checkHistoryService,
  publicUrlValidator,
  rateLimits,
  settings,
  logger,
}) {
  const monitorService = createMonitorService({
    concurrency: settings.concurrency,
    alertService,
    llmService,
    logger,
  });
  const effectiveWorkspaceService = workspaceService ?? createWorkspaceService();
  const effectiveMonitorRepository = monitorRepository ?? createMonitorRepository({
    maxMonitorsPerWorkspace: settings.maxMonitorsPerWorkspace,
    maxTotalMonitors: settings.maxTotalMonitors,
  });
  const effectiveCheckHistoryService = checkHistoryService ?? createCheckHistoryService({
    retentionDays: settings.checkHistoryRetentionDays,
  });
  const effectiveMonitorCheckService = monitorCheckService ?? createMonitorCheckRuntime({
    settings,
    monitorRepository: effectiveMonitorRepository,
    historyService: effectiveCheckHistoryService,
    alertService,
    llmService,
    logger,
  }).monitorCheckService;
  const effectiveWorkspaceAccessLinkService = workspaceAccessLinkService ?? createWorkspaceAccessLinkService();
  const effectivePublicUrlValidator = publicUrlValidator ?? createPublicUrlValidator({ allowPrivateTargets: settings.allowPrivateTargets });
  const alertController = createAlertController(alertService, {
    defaultPageSize: settings.alertsDefaultPageSize,
    maxPageSize: settings.alertsMaxPageSize,
  });
  const monitorController = createMonitorController(monitorService);
  const workspaceController = createWorkspaceController(effectiveWorkspaceService, {
    secureCookies: settings.nodeEnv === "production",
  });
  const workspaceAccessController = createWorkspaceAccessController({
    workspaceAccessLinkService: effectiveWorkspaceAccessLinkService,
    workspaceService: effectiveWorkspaceService,
    secureCookies: settings.nodeEnv === "production",
    publicAppUrl: settings.publicAppUrl,
    ttlMinutes: settings.workspaceAccessLinkTtlMinutes,
  });
  const monitorResourceController = createMonitorResourceController({
    monitorRepository: effectiveMonitorRepository,
    validatePublicUrl: effectivePublicUrlValidator,
    checkHistoryService: effectiveCheckHistoryService,
    monitorCheckService: effectiveMonitorCheckService,
    checkHistoryMaxPageSize: settings.checkHistoryMaxPageSize,
  });

  const routes = [
    healthRoutes,
    createMonitorRoutes({ controller: monitorController, maxBatchSize: settings.maxBatchSize }),
    createAlertRoutes(alertController, createOptionalWorkspaceAuth(effectiveWorkspaceService)),
    createWorkspaceRoutes({
      workspaceController,
      accessController: workspaceAccessController,
      monitorController: monitorResourceController,
      workspaceService: effectiveWorkspaceService,
      workspaceCreateLimiter: rateLimits.workspaceCreate,
      monitorCreateLimiter: rateLimits.monitorCreate,
      checkNowWorkspaceLimiter: rateLimits.checkNowWorkspace,
      checkNowMonitorLimiter: rateLimits.checkNowMonitor,
    }),
  ];
  return routes;
}
