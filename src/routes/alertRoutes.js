import { Router } from "express";

export function createAlertRoutes(controller) {
  const router = Router();
  router.get("/alerts", controller.listActive);
  router.patch("/alerts/:id/resolve", controller.resolve);
  return router;
}
