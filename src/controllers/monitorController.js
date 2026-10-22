export function createMonitorController(monitorService) {
  return async function monitorController(request, response, next) {
    try {
      response.json(await monitorService.processBatch(request.body));
    } catch (error) {
      next(error);
    }
  };
}
