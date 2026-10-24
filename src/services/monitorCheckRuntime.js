import { env } from "../config/env.js";
import { logger as defaultLogger } from "../config/logger.js";
import { generateAlertMessage } from "./llmService.js";
import { createMonitorCheckService } from "./monitorCheckService.js";
import { createMonitorRepository } from "./monitorRepository.js";
import { createCheckHistoryService } from "./checkHistoryService.js";

export function createMonitorCheckRuntime({
  settings = env,
  monitorRepository,
  historyService,
  alertService,
  llmService = { generateAlertMessage },
  fetcher,
  checkBudget,
  logger = defaultLogger,
} = {}) {
  const effectiveRepository = monitorRepository ?? createMonitorRepository({
    maxMonitorsPerWorkspace: settings.maxMonitorsPerWorkspace,
    maxTotalMonitors: settings.maxTotalMonitors,
  });
  const effectiveHistory = historyService ?? createCheckHistoryService({ retentionDays: settings.checkHistoryRetentionDays });
  const monitorCheckService = createMonitorCheckService({
    monitorRepository: effectiveRepository,
    historyService: effectiveHistory,
    alertService,
    llmService,
    fetcher,
    checkBudget,
    autoResolveHealthyChecks: settings.autoResolveHealthyChecks,
    leaseMs: Math.max(settings.monitorCheckLeaseMs, 30_000 + 2 * settings.geminiTimeoutMs + 10_000),
    responseMaxBytes: settings.monitorResponseMaxBytes,
    allowPrivateTargets: settings.allowPrivateTargets,
    logger,
  });
  return { monitorRepository: effectiveRepository, historyService: effectiveHistory, monitorCheckService };
}
