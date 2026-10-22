export function createErrorHandler(logger) {
  return function errorHandler(error, _request, response, next) {
    if (response.headersSent) return next(error);

    logger.error({ err: error }, "Request failed");

    let statusCode = Number(error.statusCode ?? error.status);
    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) statusCode = 500;

    let code = typeof error.code === "string" ? error.code : "INTERNAL_ERROR";
    let message = statusCode < 500 && typeof error.publicMessage === "string"
      ? error.publicMessage
      : "Internal server error.";

    if (error.type === "entity.parse.failed") {
      statusCode = 400;
      code = "INVALID_JSON";
      message = "Request body must contain valid JSON.";
    } else if (error.type === "entity.too.large") {
      statusCode = 413;
      code = "BODY_TOO_LARGE";
      message = "Request body exceeds the configured size limit.";
    }

    return response.status(statusCode).json({
      error: { code, message },
    });
  };
}
