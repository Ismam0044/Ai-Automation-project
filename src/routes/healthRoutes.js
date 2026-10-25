import { Router } from "express";
import { createHealthController } from "../controllers/healthController.js";

export function createHealthRoutes({ allowPrivateTargets = false } = {}) {
  const router = Router();
  router.get("/health", createHealthController({ allowPrivateTargets }));
  return router;
}

export default createHealthRoutes;
