import { createHttpError } from "./httpError.js";

export function createWorkspaceAuth(workspaceService) {
  return async function requireWorkspace(request, _response, next) {
    try {
      const workspaceId = request.params.workspaceId;
      const header = request.get("authorization") ?? "";
      const match = /^Bearer ([A-Za-z0-9_-]{40,})$/.exec(header);
      if (!/^[\da-f]{24}$/i.test(workspaceId) || !match) {
        throw createHttpError(401, "WORKSPACE_ACCESS_REQUIRED", "A valid workspace bearer key is required.");
      }
      const workspace = await workspaceService.authenticateWorkspace(workspaceId, match[1]);
      if (!workspace) {
        throw createHttpError(401, "WORKSPACE_ACCESS_REQUIRED", "A valid workspace bearer key is required.");
      }
      request.workspaceId = workspace._id;
      next();
    } catch (error) {
      next(error);
    }
  };
}
