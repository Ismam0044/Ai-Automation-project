import { createHttpError } from "../middleware/httpError.js";

const OBJECT_ID_PATTERN = /^[\da-f]{24}$/i;

export function createAlertController(alertService) {
  return {
    async listActive(_request, response, next) {
      try {
        const alerts = await alertService.listActiveAlerts();
        response.json({ alerts });
      } catch (error) {
        next(error);
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
