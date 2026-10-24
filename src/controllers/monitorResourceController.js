import { createHttpError } from "../middleware/httpError.js";

const OBJECT_ID_PATTERN = /^[\da-f]{24}$/i;
const ALLOWED_FIELDS = new Set([
  "name", "url", "method", "interval_seconds", "timeout_ms", "records_field",
  "expected_status_code", "max_response_time_ms", "expect_records", "paused",
]);

function invalidMonitor(message) {
  return createHttpError(400, "INVALID_MONITOR", message);
}

function validateId(id) {
  if (!OBJECT_ID_PATTERN.test(id)) {
    throw createHttpError(400, "INVALID_MONITOR_ID", "Monitor id must be a valid 24-character hexadecimal id.");
  }
}

function parseBody(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw invalidMonitor("Request body must be a JSON object.");
  }
  for (const field of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(field)) throw invalidMonitor(`Unsupported monitor field: ${field}.`);
  }
  if (!partial && (!Object.hasOwn(body, "name") || !Object.hasOwn(body, "url"))) {
    throw invalidMonitor("name and url are required.");
  }
  if (partial && Object.keys(body).length === 0) {
    throw invalidMonitor("Provide name or url to update.");
  }
  const result = {};
  if (Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
      throw invalidMonitor("name must be a non-empty string of at most 100 characters.");
    }
    result.name = body.name.trim();
  }
  if (Object.hasOwn(body, "url")) {
    if (typeof body.url !== "string" || !body.url.trim() || body.url.length > 2048) {
      throw invalidMonitor("url must be a non-empty URL string of at most 2048 characters.");
    }
    result.url = body.url.trim();
  }
  if (Object.hasOwn(body, "method")) {
    if (body.method !== "GET") {
      throw invalidMonitor("method must be GET.");
    }
    result.method = body.method;
  }
  if (Object.hasOwn(body, "interval_seconds")) {
    if (!Number.isInteger(body.interval_seconds) || body.interval_seconds < 60 || body.interval_seconds > 86400) {
      throw invalidMonitor("interval_seconds must be a whole number from 60 through 86400.");
    }
    result.interval_seconds = body.interval_seconds;
  }
  if (Object.hasOwn(body, "timeout_ms")) {
    if (!Number.isInteger(body.timeout_ms) || body.timeout_ms < 100 || body.timeout_ms > 30000) {
      throw invalidMonitor("timeout_ms must be a whole number from 100 through 30000.");
    }
    result.timeout_ms = body.timeout_ms;
  }
  if (Object.hasOwn(body, "records_field")) {
    const value = body.records_field === "" ? null : body.records_field;
    const pathPattern = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
    if (value !== null && (typeof value !== "string" || value.length > 128 || !pathPattern.test(value)
        || value.split(".").some((part) => ["__proto__", "prototype", "constructor"].includes(part)))) {
      throw invalidMonitor("records_field must be null or a safe dotted field path of at most 128 characters.");
    }
    result.records_field = value;
  }
  if (Object.hasOwn(body, "expected_status_code")) {
    if (!Number.isInteger(body.expected_status_code) || body.expected_status_code < 100 || body.expected_status_code > 599) {
      throw invalidMonitor("expected_status_code must be a whole HTTP status from 100 through 599.");
    }
    result.expected_status_code = body.expected_status_code;
  }
  if (Object.hasOwn(body, "max_response_time_ms")) {
    if (!Number.isInteger(body.max_response_time_ms) || body.max_response_time_ms < 1 || body.max_response_time_ms > 300000) {
      throw invalidMonitor("max_response_time_ms must be a whole number from 1 through 300000.");
    }
    result.max_response_time_ms = body.max_response_time_ms;
  }
  for (const field of ["expect_records", "paused"]) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== "boolean") throw invalidMonitor(`${field} must be true or false.`);
      result[field] = body[field];
    }
  }
  return result;
}

function positiveQueryInteger(value, name, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw createHttpError(400, "INVALID_CHECK_QUERY", `${name} must be a positive whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw createHttpError(400, "INVALID_CHECK_QUERY", `${name} cannot exceed ${maximum}.`);
  }
  return parsed;
}

export function createMonitorResourceController({
  monitorRepository,
  validatePublicUrl,
  checkHistoryService,
  monitorCheckService,
  checkHistoryMaxPageSize = 50,
}) {
  async function sanitizeUrl(url) {
    try {
      return await validatePublicUrl(url);
    } catch (error) {
      throw invalidMonitor(error.message);
    }
  }

  return {
    async list(request, response, next) {
      try {
        const records = await monitorRepository.list(request.workspaceId);
        const monitors = await Promise.all(records.map(async (record) => {
          const monitor = record.toObject ? record.toObject() : record;
          return { ...monitor, summary: await checkHistoryService.summary(request.workspaceId, monitor, monitor._id) };
        }));
        return response.json({ monitors });
      } catch (error) {
        return next(error);
      }
    },

    async create(request, response, next) {
      try {
        const data = parseBody(request.body);
        data.url = await sanitizeUrl(data.url);
        const monitor = await monitorRepository.create(request.workspaceId, data);
        return response.status(201).json({ monitor });
      } catch (error) {
        return next(error);
      }
    },

    async get(request, response, next) {
      try {
        validateId(request.params.monitorId);
        const monitor = await monitorRepository.findById(request.workspaceId, request.params.monitorId);
        if (!monitor) throw createHttpError(404, "MONITOR_NOT_FOUND", "Monitor was not found in this workspace.");
        return response.json({ monitor });
      } catch (error) {
        return next(error);
      }
    },

    async update(request, response, next) {
      try {
        validateId(request.params.monitorId);
        const data = parseBody(request.body, { partial: true });
        if (Object.hasOwn(data, "url")) data.url = await sanitizeUrl(data.url);
        const monitor = await monitorRepository.update(request.workspaceId, request.params.monitorId, data);
        if (!monitor) throw createHttpError(404, "MONITOR_NOT_FOUND", "Monitor was not found in this workspace.");
        return response.json({ monitor });
      } catch (error) {
        return next(error);
      }
    },

    async remove(request, response, next) {
      try {
        validateId(request.params.monitorId);
        const monitor = await monitorRepository.remove(request.workspaceId, request.params.monitorId);
        if (!monitor) throw createHttpError(404, "MONITOR_NOT_FOUND", "Monitor was not found in this workspace.");
        return response.json({ deleted: true, monitor_id: request.params.monitorId });
      } catch (error) {
        return next(error);
      }
    },

    async checks(request, response, next) {
      try {
        validateId(request.params.monitorId);
        const monitor = await monitorRepository.findById(request.workspaceId, request.params.monitorId);
        if (!monitor) throw createHttpError(404, "MONITOR_NOT_FOUND", "Monitor was not found in this workspace.");
        const allowed = new Set(["page", "limit"]);
        for (const key of Object.keys(request.query)) {
          if (!allowed.has(key)) throw createHttpError(400, "INVALID_CHECK_QUERY", `Unsupported query parameter: ${key}.`);
        }
        const page = positiveQueryInteger(request.query.page, "page", 1);
        const limit = positiveQueryInteger(request.query.limit, "limit", 20, checkHistoryMaxPageSize);
        const result = await checkHistoryService.list(request.workspaceId, request.params.monitorId, { page, limit });
        return response.json(result);
      } catch (error) {
        return next(error);
      }
    },

    async summary(request, response, next) {
      try {
        validateId(request.params.monitorId);
        const monitor = await monitorRepository.findById(request.workspaceId, request.params.monitorId);
        if (!monitor) throw createHttpError(404, "MONITOR_NOT_FOUND", "Monitor was not found in this workspace.");
        return response.json({ summary: await checkHistoryService.summary(request.workspaceId, monitor, monitor._id) });
      } catch (error) {
        return next(error);
      }
    },

    async checkNow(request, response, next) {
      try {
        validateId(request.params.monitorId);
        const result = await monitorCheckService.runNow(request.workspaceId, request.params.monitorId);
        return response.status(200).json({ result });
      } catch (error) {
        return next(error);
      }
    },
  };
}
