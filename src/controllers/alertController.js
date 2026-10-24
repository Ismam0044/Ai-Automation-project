import { createHttpError } from "../middleware/httpError.js";

const OBJECT_ID_PATTERN = /^[\da-f]{24}$/i;

function invalidQuery(message) {
  return createHttpError(400, "INVALID_ALERT_QUERY", message);
}

function parsePositiveInteger(value, field, defaultValue, maximum) {
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw invalidQuery(`${field} must be a positive whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw invalidQuery(`${field} is outside the supported range.`);
  if (maximum && parsed > maximum) throw invalidQuery(`${field} cannot exceed ${maximum}.`);
  return parsed;
}

export function parseAlertsQuery(query, { defaultPageSize = 20, maxPageSize = 50 } = {}) {
  const allowedKeys = new Set(["status", "limit", "page", "api_name", "severity"]);
  for (const key of Object.keys(query)) {
    if (!allowedKeys.has(key)) throw invalidQuery(`Unsupported query parameter: ${key}.`);
  }

  const status = query.status ?? "active";
  if (typeof status !== "string" || !["active", "resolved"].includes(status)) {
    throw invalidQuery("status must be active or resolved.");
  }

  const apiName = query.api_name ?? "";
  if (typeof apiName !== "string" || apiName.length > 100 || (query.api_name !== undefined && !apiName.trim())) {
    throw invalidQuery("api_name must be a non-empty search string of at most 100 characters.");
  }

  const severity = query.severity ?? "all";
  if (typeof severity !== "string" || !["all", "critical", "warning"].includes(severity)) {
    throw invalidQuery("severity must be all, critical, or warning.");
  }

  const page = parsePositiveInteger(query.page, "page", 1);
  const limit = parsePositiveInteger(query.limit, "limit", defaultPageSize, maxPageSize);
  if (page > Math.floor(Number.MAX_SAFE_INTEGER / limit)) {
    throw invalidQuery("page is outside the supported range.");
  }

  return {
    status,
    page,
    limit,
    apiName: apiName.trim(),
    severity,
  };
}

export function createAlertController(alertService, { defaultPageSize = 20, maxPageSize = 50 } = {}) {
  return {
    async listActive(request, response, next) {
      try {
        if (Object.keys(request.query).length === 0) {
          const alerts = await alertService.listActiveAlerts();
          return response.json({ alerts });
        }
        const query = parseAlertsQuery(request.query, { defaultPageSize, maxPageSize });
        const result = await alertService.listAlerts(query);
        return response.json({ alerts: result.alerts, pagination: result.pagination, summary: result.summary });
      } catch (error) {
        return next(error);
      }
    },

    async resolve(request, response, next) {
      try {
        if (!OBJECT_ID_PATTERN.test(request.params.id)) {
          throw createHttpError(400, "INVALID_ALERT_ID", "Alert id must be a valid 24-character hexadecimal id.");
        }
        const alert = await alertService.resolveAlertById(request.params.id);
        if (!alert) throw createHttpError(404, "ALERT_NOT_FOUND", "No active alert was found with that id.");
        response.json({ alert });
      } catch (error) {
        next(error);
      }
    },
  };
}
