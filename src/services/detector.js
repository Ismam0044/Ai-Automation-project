import { monitoringConfig } from "../config/monitoring.js";

const severityRank = Object.freeze({ none: 0, warning: 1, critical: 2 });

function makeResult(apiName, anomalyTypes) {
  const sortedTypes = [...new Set(anomalyTypes)].sort();
  const severity = sortedTypes.reduce((highest, type) => {
    const typeSeverity = type.endsWith("_critical") ? "critical" : "warning";
    return severityRank[typeSeverity] > severityRank[highest] ? typeSeverity : highest;
  }, "none");

  return { api_name: apiName, anomaly_types: sortedTypes, severity };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Analyze one API check without side effects. Invalid checks produce a result instead of throwing. */
export function detectAnomalies(check, {
  expectRecords = true,
  expectedStatusCode = null,
  responseTimeWarningMs = monitoringConfig.responseTimeWarningMs,
  responseTimeCriticalMs = monitoringConfig.responseTimeCriticalMs,
  allowStatusZero = false,
} = {}) {
  const apiName = isObject(check) && typeof check.api_name === "string" && check.api_name.trim()
    ? check.api_name
    : null;
  const anomalyTypes = [];

  if (!isObject(check)) {
    return makeResult(null, ["validation_anomaly"]);
  }

  let hasValidationIssue = false;
  for (const field of ["api_name", "response_time_ms", "status_code", ...(expectRecords ? ["records_returned"] : [])]) {
    if (!Object.hasOwn(check, field)) hasValidationIssue = true;
  }

  if (typeof check.api_name !== "string" || check.api_name.trim().length === 0) {
    hasValidationIssue = true;
  }

  const responseTimeIsValid = typeof check.response_time_ms === "number"
    && Number.isFinite(check.response_time_ms)
    && check.response_time_ms >= 0;
  if (!responseTimeIsValid) {
    hasValidationIssue = true;
  } else if (check.response_time_ms > responseTimeCriticalMs) {
    anomalyTypes.push("response_time_critical");
  } else if (check.response_time_ms > responseTimeWarningMs) {
    anomalyTypes.push("response_time_warning");
  }

  const statusIsValid = typeof check.status_code === "number"
    && Number.isInteger(check.status_code)
    && ((allowStatusZero && check.status_code === 0) || check.status_code >= 100)
    && check.status_code <= 599;
  if (!statusIsValid) hasValidationIssue = true;

  if (typeof check.status_code === "number" && Number.isFinite(check.status_code)
      && (expectedStatusCode !== null
        ? check.status_code !== expectedStatusCode
        : check.status_code < monitoringConfig.successStatusMin
          || check.status_code > monitoringConfig.successStatusMax)) {
    const isServerError = (allowStatusZero && check.status_code === 0)
      || (check.status_code >= monitoringConfig.serverErrorStatusMin
        && check.status_code <= monitoringConfig.serverErrorStatusMax);
    anomalyTypes.push(isServerError
      ? "http_status_failure_critical"
      : "http_status_failure_warning");
  }

  if (expectRecords) {
    const recordsIsNumeric = typeof check.records_returned === "number"
      && Number.isFinite(check.records_returned);
    const recordsAreValid = recordsIsNumeric
      && Number.isInteger(check.records_returned)
      && check.records_returned >= 0;
    if (!recordsAreValid) hasValidationIssue = true;
    if (!recordsAreValid || check.records_returned === 0) {
      anomalyTypes.push("records_returned_anomaly");
    }
  }

  if (hasValidationIssue) anomalyTypes.push("validation_anomaly");
  return makeResult(apiName, anomalyTypes);
}

/** Analyze each batch item independently, preserving order and returning one result per item. */
export function processBatch(checks) {
  if (!Array.isArray(checks)) return [];
  return checks.map((check) => detectAnomalies(check));
}
