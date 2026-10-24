import { monitoringConfig } from "../config/monitoring.js";
import { logger } from "../config/logger.js";
import { createSafeFetcher } from "./safeFetcher.js";
import { createCheckHistoryService } from "./checkHistoryService.js";
import { detectAnomalies } from "./detector.js";
import { buildFallbackMessage, buildPromptFacts } from "./llmService.js";
import { findActiveAlertForDetection, resolveMonitorAlerts, saveAlert } from "./alertService.js";
import { createMonitorRepository } from "./monitorRepository.js";
import { createHttpError } from "../middleware/httpError.js";
import { monitorCheckBudget } from "./monitorCheckBudget.js";

export function createMonitorCheckService({
  fetcher,
  historyService,
  monitorRepository = createMonitorRepository(),
  alertService = { findActiveAlertForDetection, resolveMonitorAlerts, saveAlert },
  llmService,
  autoResolveHealthyChecks = 2,
  leaseMs = 120_000,
  responseMaxBytes = 1_048_576,
  allowPrivateTargets = false,
  checkBudget = monitorCheckBudget,
  logger: serviceLogger = logger,
} = {}) {
  const effectiveFetcher = fetcher ?? createSafeFetcher({ allowPrivateTargets, maxResponseBytes: responseMaxBytes, logger: serviceLogger });
  const effectiveHistory = historyService ?? createCheckHistoryService();
  if (!llmService?.generateAlertMessage) throw new TypeError("llmService.generateAlertMessage is required");

  async function run(monitor) {
    const workspaceId = monitor.workspace_id;
    const monitorId = monitor._id;
    const fetched = await effectiveFetcher.fetchMonitor(monitor);
    const check = {
      api_name: monitor.name,
      response_time_ms: fetched.response_time_ms,
      status_code: fetched.status_code,
      records_returned: fetched.records_returned,
    };
    let detection = detectAnomalies(check, {
      expectRecords: monitor.expect_records === true,
      expectedStatusCode: Number.isInteger(monitor.expected_status_code) ? monitor.expected_status_code : 200,
      responseTimeWarningMs: Number.isInteger(monitor.max_response_time_ms)
        ? monitor.max_response_time_ms : monitoringConfig.responseTimeWarningMs,
      responseTimeCriticalMs: Math.max(monitoringConfig.responseTimeCriticalMs,
        Number.isInteger(monitor.max_response_time_ms) ? monitor.max_response_time_ms : monitoringConfig.responseTimeWarningMs),
      allowStatusZero: true,
    });
    if (fetched.outcome === "invalid_json") detection.anomaly_types.push("invalid_json");
    if (fetched.outcome === "too_large") detection.anomaly_types.push("response_too_large");
    detection.anomaly_types = [...new Set(detection.anomaly_types)].sort();
    if (detection.anomaly_types.length && detection.severity === "none") detection.severity = "warning";

    try {
      await effectiveHistory.record(workspaceId, monitorId, fetched);
    } catch {
      serviceLogger.error({ monitor_id: String(monitorId) }, "Monitor check history could not be stored");
    }

    if (detection.anomaly_types.length === 0 && fetched.outcome === "ok") {
      const updated = await monitorRepository.incrementHealthyCount(workspaceId, monitorId);
      const healthyCount = updated?.consecutive_healthy_checks ?? 0;
      if (healthyCount >= autoResolveHealthyChecks) {
        await alertService.resolveMonitorAlerts(
          workspaceId,
          monitorId,
          `Automatically resolved after ${autoResolveHealthyChecks} consecutive healthy checks.`,
        );
        await monitorRepository.resetHealthyCount(workspaceId, monitorId);
      }
      return { check, outcome: fetched.outcome, status: "healthy", severity: "none", alert_id: null };
    }

    await monitorRepository.resetHealthyCount(workspaceId, monitorId);
    const scope = { workspaceId, monitorId };
    const existing = await alertService.findActiveAlertForDetection(detection, scope);
    let generated;
    if (existing?.message_source === "model" && typeof existing.message === "string" && existing.message.trim()) {
      generated = { message: existing.message, source: "model" };
    } else {
      try {
        generated = await llmService.generateAlertMessage(check, detection, { skipActiveAlertLookup: true });
      } catch {
        generated = { message: buildFallbackMessage(buildPromptFacts(check, detection)), source: "fallback" };
      }
    }
    const alert = await alertService.saveAlert(detection, check, generated.message, generated.source, scope);
    return {
      check,
      outcome: fetched.outcome,
      status: existing ? "updated" : "created",
      severity: detection.severity,
      alert_id: String(alert._id ?? alert.id),
    };
  }

  async function runNow(workspaceId, monitorId) {
    const monitor = await monitorRepository.findById(workspaceId, monitorId);
    if (!monitor) throw createHttpError(404, "MONITOR_NOT_FOUND", "Monitor was not found in this workspace.");
    if (monitor.paused) throw createHttpError(409, "MONITOR_PAUSED", "A paused monitor cannot be checked.");
    const claimed = await monitorRepository.claimById(workspaceId, monitorId, { leaseMs });
    if (!claimed) throw createHttpError(409, "MONITOR_CHECK_RUNNING", "A check for this monitor is already running.");
    try {
      if (!checkBudget.take()) throw createHttpError(429, "CHECK_RATE_LIMITED", "The check limit has been reached. Try again shortly.");
      try {
        return await run(claimed);
      } finally {
        await monitorRepository.scheduleNextCheck?.(workspaceId, monitorId, {
          intervalSeconds: claimed.interval_seconds,
        });
      }
    } finally {
      await monitorRepository.releaseLease(workspaceId, monitorId);
    }
  }

  return { run, runNow };
}
