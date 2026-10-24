import { createHttpError } from "./httpError.js";

export function createWorkspaceAuth(workspaceService) {
  return async function requireWorkspace(request, _response, next) {
    try {
      const workspaceId = request.params.workspaceId;
      const header = request.get("authorization") ?? "";
      const bearer = /^Bearer ([A-Za-z0-9_-]{40,})$/.exec(header)?.[1];
      const cookieName = `workspace_${workspaceId}`;
      const cookieHeader = request.get("cookie") ?? "";
      const cookie = cookieHeader.split(";").map((part) => part.trim())
        .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      const accessKey = bearer ?? cookie;
      if (!/^[\da-f]{24}$/i.test(workspaceId) || !accessKey) {
        throw createHttpError(401, "WORKSPACE_ACCESS_REQUIRED", "A valid workspace bearer key is required.");
      }
      const workspace = await workspaceService.authenticateWorkspace(workspaceId, accessKey);
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
