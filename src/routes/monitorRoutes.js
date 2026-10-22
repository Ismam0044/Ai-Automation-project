import { Router } from "express";
import { validateMonitorBatch } from "../middleware/validateMonitorBatch.js";

export function createMonitorRoutes({ controller, maxBatchSize }) {
  const router = Router();
  router.post("/monitor", validateMonitorBatch(maxBatchSize), controller);
  return router;
}
