import {
  findActiveAlertForDetection,
  listActiveAlerts,
  resolveAlertById,
  saveAlert,
} from "../services/alertService.js";
import { generateAlertMessage } from "../services/llmService.js";
import { createMonitorService } from "../services/monitorService.js";
import { createAlertController } from "../controllers/alertController.js";
import { createMonitorController } from "../controllers/monitorController.js";
import { createAlertRoutes } from "./alertRoutes.js";
import healthRoutes from "./healthRoutes.js";
import { createMonitorRoutes } from "./monitorRoutes.js";

export function createApiRoutes({
  alertService = { findActiveAlertForDetection, saveAlert, listActiveAlerts, resolveAlertById },
  llmService = { generateAlertMessage },
  settings,
  logger,
}) {
  const monitorService = createMonitorService({
    concurrency: settings.concurrency,
    alertService,
    llmService,
    logger,
  });
  const alertController = createAlertController(alertService);
  const monitorController = createMonitorController(monitorService);

  return [
    healthRoutes,
    createMonitorRoutes({ controller: monitorController, maxBatchSize: settings.maxBatchSize }),
    createAlertRoutes(alertController),
  ];
}
