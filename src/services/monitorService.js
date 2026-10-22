import { detectAnomalies } from "./detector.js";
import { buildFallbackMessage, buildPromptFacts } from "./llmService.js";
import {
  findActiveAlertForDetection,
  saveAlert,
} from "./alertService.js";
import { logger } from "../config/logger.js";

export async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, concurrency);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
}

export function createMonitorService({
  concurrency = 5,
  detector = detectAnomalies,
  alertService = { findActiveAlertForDetection, saveAlert },
  llmService,
  logger: serviceLogger = logger,
} = {}) {
  if (!llmService?.generateAlertMessage) {
    throw new TypeError("llmService.generateAlertMessage is required");
  }

  async function processItem(check) {
    let detection;
    try {
      detection = detector(check);
      if (detection.anomaly_types.length === 0) {
        return {
          api_name: detection.api_name,
          status: "healthy",
          severity: detection.severity,
          alert_id: null,
        };
      }

      const existingAlert = await alertService.findActiveAlertForDetection(detection);
      let generatedMessage;
      if (existingAlert?.message_source === "model"
          && typeof existingAlert.message === "string"
          && existingAlert.message.trim()) {
        generatedMessage = {
          message: existingAlert.message,
          source: "model",
        };
      } else {
        try {
          generatedMessage = await llmService.generateAlertMessage(check, detection, {
            skipActiveAlertLookup: true,
          });
        } catch {
          generatedMessage = {
            message: buildFallbackMessage(buildPromptFacts(check, detection)),
            source: "fallback",
          };
          serviceLogger.warn({ source: "fallback" }, "Using fallback after alert message service failure");
        }
      }

      const alert = await alertService.saveAlert(
        detection,
        check,
        generatedMessage.message,
        generatedMessage.source,
      );
      const wasUpdated = Boolean(existingAlert) || Number(alert.occurrence_count) > 1;

      return {
        api_name: detection.api_name,
        status: wasUpdated ? "updated" : "created",
        severity: detection.severity,
        alert_id: String(alert._id ?? alert.id),
      };
    } catch (error) {
      serviceLogger.error({ err: error }, "API check processing failed");
      return {
        api_name: detection?.api_name ?? (typeof check?.api_name === "string" ? check.api_name : null),
        status: "failed",
        severity: detection?.severity ?? "warning",
        alert_id: null,
      };
    }
  }

  async function processBatch(checks) {
    const results = await mapWithConcurrency(checks, concurrency, processItem);
    const healthyCount = results.filter((result) => result.status === "healthy").length;
    const anomaliesCreated = results.filter((result) => result.status === "created").length;
    const anomaliesUpdated = results.filter((result) => result.status === "updated").length;
    const failedItems = results.filter((result) => result.status === "failed").length;

    return {
      total_items: checks.length,
      healthy_count: healthyCount,
      anomalies_created: anomaliesCreated,
      anomalies_updated: anomaliesUpdated,
      failed_items: failedItems,
      results,
    };
  }

  return { processBatch };
}
