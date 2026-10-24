import {
  findActiveAlertForDetection,
  listAlerts,
  listActiveAlerts,
  resolveAlertById,
  saveAlert,
} from "../services/alertService.js";
import { generateAlertMessage } from "../services/llmService.js";
import { createMonitorService } from "../services/monitorService.js";
import { createAlertController } from "../controllers/alertController.js";
import { createMonitorController } from "../controllers/monitorController.js";
import { createMonitorResourceController } from "../controllers/monitorResourceController.js";
import { createWorkspaceAccessController, createWorkspaceController } from "../controllers/workspaceController.js";
import { createMonitorRepository } from "../services/monitorRepository.js";
import { createWorkspaceService } from "../services/workspaceService.js";
import { createWorkspaceAccessLinkService } from "../services/workspaceAccessLinkService.js";
import { validatePublicUrl } from "../services/publicUrlValidator.js";
import { createAlertRoutes } from "./alertRoutes.js";
import healthRoutes from "./healthRoutes.js";
import { createMonitorRoutes } from "./monitorRoutes.js";
import { createWorkspaceRoutes } from "./workspaceRoutes.js";

export function createApiRoutes({
  alertService = { findActiveAlertForDetection, saveAlert, listActiveAlerts, listAlerts, resolveAlertById },
  llmService = { generateAlertMessage },
  workspaceService,
  workspaceAccessLinkService,
  monitorRepository,
  publicUrlValidator = validatePublicUrl,
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
  const effectiveWorkspaceAccessLinkService = workspaceAccessLinkService ?? createWorkspaceAccessLinkService();
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
    validatePublicUrl: publicUrlValidator,
  });

  return [
    healthRoutes,
    createMonitorRoutes({ controller: monitorController, maxBatchSize: settings.maxBatchSize }),
    createAlertRoutes(alertController),
    createWorkspaceRoutes({
      workspaceController,
      accessController: workspaceAccessController,
      monitorController: monitorResourceController,
      workspaceService: effectiveWorkspaceService,
      workspaceCreateLimiter: rateLimits.workspaceCreate,
      monitorCreateLimiter: rateLimits.monitorCreate,
    }),
  ];
}
