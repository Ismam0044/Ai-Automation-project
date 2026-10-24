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

export function createOptionalWorkspaceAuth(workspaceService) {
  return async function optionalWorkspace(request, _response, next) {
    try {
      const authorization = request.get("authorization") ?? "";
      const bearer = /^Bearer ([A-Za-z0-9_-]{40,})$/.exec(authorization)?.[1];
      const cookieHeader = request.get("cookie") ?? "";
      const cookies = cookieHeader.split(";").map((part) => part.trim());
      const activeWorkspaceId = cookies.find((part) => part.startsWith("workspace_active="))
        ?.slice("workspace_active=".length);
      const workspaceCookies = cookies.map((part) => {
        const match = /^workspace_([\da-f]{24})=([A-Za-z0-9_-]{40,})$/i.exec(part);
        return match ? { workspaceId: match[1], accessKey: match[2] } : null;
      }).filter(Boolean).filter((cookie) => !activeWorkspaceId || cookie.workspaceId === activeWorkspaceId);

      if (bearer) {
        const workspace = await workspaceService.authenticateAccessKey(bearer);
        if (!workspace) throw createHttpError(401, "WORKSPACE_ACCESS_REQUIRED", "A valid workspace bearer key is required.");
        request.workspaceId = workspace._id;
      } else if (workspaceCookies.length > 0) {
        let authenticated = null;
        for (const cookie of workspaceCookies) {
          const workspace = await workspaceService.authenticateWorkspace(cookie.workspaceId, cookie.accessKey);
          if (workspace) authenticated = workspace;
        }
        if (!authenticated) throw createHttpError(401, "WORKSPACE_ACCESS_REQUIRED", "A valid workspace cookie is required.");
        request.workspaceId = authenticated._id;
      } else if (authorization) {
        throw createHttpError(401, "WORKSPACE_ACCESS_REQUIRED", "A valid workspace bearer key is required.");
      } else {
        request.workspaceId = null;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
