import { Router } from "express";
import { createWorkspaceAuth } from "../middleware/workspaceAuth.js";

export function createWorkspaceRoutes({ workspaceController, monitorController, workspaceService }) {
  const router = Router();
  const requireWorkspace = createWorkspaceAuth(workspaceService);
  router.post("/workspaces", workspaceController.create);
  router.get("/workspaces/:workspaceId/monitors", requireWorkspace, monitorController.list);
  router.post("/workspaces/:workspaceId/monitors", requireWorkspace, monitorController.create);
  router.get("/workspaces/:workspaceId/monitors/:monitorId", requireWorkspace, monitorController.get);
  router.patch("/workspaces/:workspaceId/monitors/:monitorId", requireWorkspace, monitorController.update);
  router.delete("/workspaces/:workspaceId/monitors/:monitorId", requireWorkspace, monitorController.remove);
  return router;
}
