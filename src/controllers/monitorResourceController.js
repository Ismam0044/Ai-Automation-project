import { createHttpError } from "../middleware/httpError.js";

const OBJECT_ID_PATTERN = /^[\da-f]{24}$/i;
const ALLOWED_FIELDS = new Set(["name", "url"]);

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
