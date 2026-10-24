import { Router } from "express";
import express from "express";
import { createWorkspaceAuth } from "../middleware/workspaceAuth.js";

export function createWorkspaceRoutes({
  workspaceController,
  accessController,
  monitorController,
  workspaceService,
  workspaceCreateLimiter,
  monitorCreateLimiter,
}) {
  const router = Router();
  const requireWorkspace = createWorkspaceAuth(workspaceService);
  router.post("/workspaces", workspaceCreateLimiter, workspaceController.create);
  router.post("/workspaces/:workspaceId/access-links", requireWorkspace, accessController.createLink);
  router.get("/workspaces/:workspaceId/open", accessController.open);
  router.post("/workspaces/:workspaceId/claim", express.urlencoded({ extended: false, limit: "2kb" }), accessController.claim);
  router.get("/workspaces/:workspaceId/monitors", requireWorkspace, monitorController.list);
  router.post("/workspaces/:workspaceId/monitors", requireWorkspace, monitorCreateLimiter, monitorController.create);
  router.get("/workspaces/:workspaceId/monitors/:monitorId", requireWorkspace, monitorController.get);
  router.patch("/workspaces/:workspaceId/monitors/:monitorId", requireWorkspace, monitorController.update);
  router.delete("/workspaces/:workspaceId/monitors/:monitorId", requireWorkspace, monitorController.remove);
  return router;
}
