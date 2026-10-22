export const monitoringConfig = Object.freeze({
  responseTimeWarningMs: 3000,
  responseTimeCriticalMs: 5000,
  successStatusMin: 200,
  successStatusMax: 299,
  clientErrorStatusMin: 400,
  clientErrorStatusMax: 499,
  serverErrorStatusMin: 500,
  serverErrorStatusMax: 599,
});
