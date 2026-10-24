import { Router } from "express";

export function createAlertRoutes(controller, optionalWorkspaceAuth = (_request, _response, next) => next()) {
  const router = Router();
  router.get("/alerts", optionalWorkspaceAuth, controller.listActive);
  router.patch("/alerts/:id/resolve", optionalWorkspaceAuth, controller.resolve);
  return router;
}
