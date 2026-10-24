import { createHttpError } from "../middleware/httpError.js";

const OBJECT_ID_PATTERN = /^[\da-f]{24}$/i;
const ALLOWED_FIELDS = new Set(["name", "url", "method", "interval_seconds", "timeout_ms", "records_field"]);

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
    if (typeof body.method !== "string" || !["GET", "HEAD"].includes(body.method)) {
      throw invalidMonitor("method must be GET or HEAD.");
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
  return result;
}

export function createMonitorResourceController({ monitorRepository, validatePublicUrl }) {
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
        const monitors = await monitorRepository.list(request.workspaceId);
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
  };
}
