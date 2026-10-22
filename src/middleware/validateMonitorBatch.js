import { createHttpError } from "./httpError.js";

export function validateMonitorBatch(maxBatchSize) {
  return function monitorBatchValidator(request, _response, next) {
    if (!Array.isArray(request.body)) {
      return next(createHttpError(400, "INVALID_BATCH", "Request body must be a JSON array."));
    }
    if (request.body.length > maxBatchSize) {
      return next(createHttpError(
        413,
        "BATCH_TOO_LARGE",
        `Batch exceeds the configured maximum of ${maxBatchSize} items.`,
      ));
    }
    return next();
  };
}
