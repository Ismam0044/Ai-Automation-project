import { Alert } from "../models/alert.js";

export const PLACEHOLDER_ALERT_MESSAGE = "Anomaly detected; detailed analysis pending.";

export function buildDedupeKey(apiName, anomalyTypes) {
  if (typeof apiName !== "string" || apiName.trim().length === 0) {
    throw new TypeError("api_name must be a non-empty string to build an alert dedupe key");
  }
  if (!Array.isArray(anomalyTypes) || anomalyTypes.some((type) => typeof type !== "string")) {
    throw new TypeError("anomaly_types must be an array of strings");
  }

  return `${apiName}|${[...new Set(anomalyTypes)].sort().join("|")}`;
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

    const dedupeKey = buildDedupeKey(apiName, anomalyTypes);
    const filter = { dedupe_key: dedupeKey, status: "active" };
    const update = {
      $set: {
        api_name: apiName,
        anomaly_types: anomalyTypes,
        severity: detectionResult.severity,
        message,
        message_source: messageSource,
        input_snapshot: inputSnapshot,
      },
      $inc: { occurrence_count: 1 },
    };
    const updateOptions = { new: true, runValidators: true };

    const existingAlert = await AlertModel.findOneAndUpdate(filter, update, updateOptions);
    if (existingAlert) return existingAlert;

    try {
      return await AlertModel.create({
        api_name: apiName,
        anomaly_types: anomalyTypes,
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

  async function listActiveAlerts() {
    return AlertModel.find({ status: "active" }).sort({ createdAt: -1 });
  }

  async function findActiveAlertForDetection(detectionResult) {
    if (!detectionResult || !Array.isArray(detectionResult.anomaly_types)
        || detectionResult.anomaly_types.length === 0) {
      return null;
    }

    const apiName = typeof detectionResult.api_name === "string" && detectionResult.api_name.trim()
      ? detectionResult.api_name.trim()
      : "unknown";
    const dedupeKey = buildDedupeKey(apiName, detectionResult.anomaly_types);
    return AlertModel.findOne({ dedupe_key: dedupeKey, status: "active" });
  }

  async function resolveAlertById(id) {
    return AlertModel.findOneAndUpdate(
      { _id: id, status: "active" },
      { $set: { status: "resolved" } },
      { new: true, runValidators: true },
    );
  }

  return { saveAlert, listActiveAlerts, findActiveAlertForDetection, resolveAlertById };
}

const defaultService = createAlertService();

export const saveAlert = defaultService.saveAlert;
export const listActiveAlerts = defaultService.listActiveAlerts;
export const findActiveAlertForDetection = defaultService.findActiveAlertForDetection;
export const resolveAlertById = defaultService.resolveAlertById;
