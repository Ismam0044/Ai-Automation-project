import { Alert } from "../models/alert.js";

export const PLACEHOLDER_ALERT_MESSAGE = "Anomaly detected; detailed analysis pending.";

export function buildDedupeKey(apiName, anomalyTypes, { workspaceId = null, monitorId = null } = {}) {
  if (typeof apiName !== "string" || apiName.trim().length === 0) {
    throw new TypeError("api_name must be a non-empty string to build an alert dedupe key");
  }
  if (!Array.isArray(anomalyTypes) || anomalyTypes.some((type) => typeof type !== "string")) {
    throw new TypeError("anomaly_types must be an array of strings");
  }

  return `${workspaceId ?? "shared"}|${monitorId ?? "demo"}|${apiName}|${[...new Set(anomalyTypes)].sort().join("|")}`;
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

export function createAlertService({ AlertModel = Alert } = {}) {
  async function saveAlert(
    detectionResult,
    inputSnapshot,
    message = PLACEHOLDER_ALERT_MESSAGE,
    messageSource = "fallback",
    { workspaceId = null, monitorId = null } = {},
  ) {
    if (!detectionResult || !Array.isArray(detectionResult.anomaly_types)) {
      throw new TypeError("A detection result with anomaly_types is required");
    }

    const anomalyTypes = [...new Set(detectionResult.anomaly_types)].sort();
    if (anomalyTypes.length === 0) return null;
    if (anomalyTypes.some((type) => typeof type !== "string" || type.length === 0)) {
      throw new TypeError("anomaly_types must contain non-empty strings");
    }
    if (!["warning", "critical"].includes(detectionResult.severity)) {
      throw new TypeError("Alert severity must be warning or critical");
    }

    const apiName = typeof detectionResult.api_name === "string" && detectionResult.api_name.trim()
      ? detectionResult.api_name.trim()
      : "unknown";
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new TypeError("message must be a non-empty string");
    }
    if (!["model", "fallback"].includes(messageSource)) {
      throw new TypeError("message_source must be model or fallback");
    }

    const scope = { workspaceId, monitorId };
    const dedupeKey = buildDedupeKey(apiName, anomalyTypes, scope);
    const filter = { dedupe_key: dedupeKey, status: "active" };
    const update = {
      $set: {
        api_name: apiName,
        anomaly_types: anomalyTypes,
        workspace_id: workspaceId,
        monitor_id: monitorId,
        severity: detectionResult.severity,
        message,
        message_source: messageSource,
        input_snapshot: inputSnapshot,
      },
      $inc: { occurrence_count: 1 },
    };
    const updateOptions = { new: true, runValidators: true };

    let existingAlert = await AlertModel.findOneAndUpdate(filter, update, updateOptions);
    if (!existingAlert && workspaceId === null && monitorId === null) {
      // Upgrade prior shared alerts in place so the new scoped key does not duplicate them.
      existingAlert = await AlertModel.findOneAndUpdate({
        status: "active",
        api_name: apiName,
        anomaly_types: anomalyTypes,
        workspace_id: null,
        monitor_id: null,
        dedupe_key: { $ne: dedupeKey },
      }, update, updateOptions);
    }
    if (existingAlert) return existingAlert;

    try {
      return await AlertModel.create({
        api_name: apiName,
        anomaly_types: anomalyTypes,
        workspace_id: workspaceId,
        monitor_id: monitorId,
        severity: detectionResult.severity,
        message,
        message_source: messageSource,
        input_snapshot: inputSnapshot,
        status: "active",
        dedupe_key: dedupeKey,
        occurrence_count: 1,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const retriedAlert = await AlertModel.findOneAndUpdate(filter, update, updateOptions);
      if (retriedAlert) return retriedAlert;
      throw error;
    }
  }

  async function listActiveAlerts({ workspaceId = null } = {}) {
    return AlertModel.find({ status: "active", workspace_id: workspaceId }).sort({ createdAt: -1 });
  }

  async function listAlerts({ status = "active", page = 1, limit = 20, apiName = "", severity = "all", workspaceId = null } = {}) {
    const summaryFilter = { status, workspace_id: workspaceId };
    if (apiName) {
      const escaped = apiName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      summaryFilter.api_name = new RegExp(escaped, "i");
    }
    const resultFilter = { ...summaryFilter };
    if (severity !== "all") resultFilter.severity = severity;
    const sort = status === "resolved"
      ? { updatedAt: -1 }
      : { severity: 1, updatedAt: -1 };
    const offset = (page - 1) * limit;

    const [alerts, total, summaryTotal, criticalCount, warningCount] = await Promise.all([
      AlertModel.find(resultFilter).sort(sort).skip(offset).limit(limit),
      AlertModel.countDocuments(resultFilter),
      AlertModel.countDocuments(summaryFilter),
      AlertModel.countDocuments({ ...summaryFilter, severity: "critical" }),
      AlertModel.countDocuments({ ...summaryFilter, severity: "warning" }),
    ]);

    return {
      alerts,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
      summary: {
        total: summaryTotal,
        critical: criticalCount,
        warning: warningCount,
      },
    };
  }

  async function findActiveAlertForDetection(detectionResult, { workspaceId = null, monitorId = null } = {}) {
    if (!detectionResult || !Array.isArray(detectionResult.anomaly_types)
        || detectionResult.anomaly_types.length === 0) {
      return null;
    }

    const apiName = typeof detectionResult.api_name === "string" && detectionResult.api_name.trim()
      ? detectionResult.api_name.trim()
      : "unknown";
    const dedupeKey = buildDedupeKey(apiName, detectionResult.anomaly_types, { workspaceId, monitorId });
    let alert = await AlertModel.findOne({ dedupe_key: dedupeKey, status: "active" });
    if (!alert && workspaceId === null && monitorId === null) {
      alert = await AlertModel.findOne({
        status: "active",
        api_name: apiName,
        anomaly_types: [...new Set(detectionResult.anomaly_types)].sort(),
        workspace_id: null,
        monitor_id: null,
        dedupe_key: { $ne: dedupeKey },
      });
    }
    return alert;
  }

  async function resolveAlertById(id, { workspaceId = null, reason = null } = {}) {
    return AlertModel.findOneAndUpdate(
      { _id: id, status: "active", workspace_id: workspaceId },
      { $set: { status: "resolved", resolution_reason: reason } },
      { new: true, runValidators: true },
    );
  }

  async function resolveMonitorAlerts(workspaceId, monitorId, reason) {
    return AlertModel.updateMany(
      { workspace_id: workspaceId, monitor_id: monitorId, status: "active" },
      { $set: { status: "resolved", resolution_reason: reason } },
    );
  }

  return { saveAlert, listActiveAlerts, listAlerts, findActiveAlertForDetection, resolveAlertById, resolveMonitorAlerts };
}

const defaultService = createAlertService();

export const saveAlert = defaultService.saveAlert;
export const listActiveAlerts = defaultService.listActiveAlerts;
export const listAlerts = defaultService.listAlerts;
export const findActiveAlertForDetection = defaultService.findActiveAlertForDetection;
export const resolveAlertById = defaultService.resolveAlertById;
export const resolveMonitorAlerts = defaultService.resolveMonitorAlerts;
