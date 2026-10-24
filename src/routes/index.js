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
import { createWorkspaceController } from "../controllers/workspaceController.js";
import { createMonitorRepository } from "../services/monitorRepository.js";
import { createWorkspaceService } from "../services/workspaceService.js";
import { validatePublicUrl } from "../services/publicUrlValidator.js";
import { createAlertRoutes } from "./alertRoutes.js";
import healthRoutes from "./healthRoutes.js";
import { createMonitorRoutes } from "./monitorRoutes.js";
import { createWorkspaceRoutes } from "./workspaceRoutes.js";

export function createApiRoutes({
  alertService = { findActiveAlertForDetection, saveAlert, listActiveAlerts, listAlerts, resolveAlertById },
  llmService = { generateAlertMessage },
  workspaceService = createWorkspaceService(),
  monitorRepository = createMonitorRepository(),
  publicUrlValidator = validatePublicUrl,
  settings,
  logger,
}) {
  const monitorService = createMonitorService({
    concurrency: settings.concurrency,
    alertService,
    llmService,
    logger,
  });
  const alertController = createAlertController(alertService, {
    defaultPageSize: settings.alertsDefaultPageSize,
    maxPageSize: settings.alertsMaxPageSize,
  });
  const monitorController = createMonitorController(monitorService);
  const workspaceController = createWorkspaceController(workspaceService);
  const monitorResourceController = createMonitorResourceController({
    monitorRepository,
    validatePublicUrl: publicUrlValidator,
  });

  return [
    healthRoutes,
    createMonitorRoutes({ controller: monitorController, maxBatchSize: settings.maxBatchSize }),
    createAlertRoutes(alertController),
    createWorkspaceRoutes({ workspaceController, monitorController: monitorResourceController, workspaceService }),
  ];
}
