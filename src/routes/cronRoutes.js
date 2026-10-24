import { Router } from "express";

export function createCronRoutes(controller) {
  const router = Router();
  router.get("/cron/run-due", controller.runDue);
  router.get("/cron/purge", controller.purge);
  return router;
}
