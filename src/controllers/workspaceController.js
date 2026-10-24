import { createHttpError } from "../middleware/httpError.js";

function badWorkspace(message) {
  return createHttpError(400, "INVALID_WORKSPACE", message);
}

function setWorkspaceCookie(response, workspaceId, accessKey, secure) {
  const cookieName = `workspace_${workspaceId}`;
  const parts = [
    `${cookieName}=${accessKey}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000",
  ];
  if (secure) parts.push("Secure");
  response.append("Set-Cookie", parts.join("; "));
  const activeParts = [`workspace_active=${workspaceId}`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=2592000"];
  if (secure) activeParts.push("Secure");
  response.append("Set-Cookie", activeParts.join("; "));
}

const OBJECT_ID_PATTERN = /^[\da-f]{24}$/i;

export function createWorkspaceController(workspaceService, { secureCookies = false } = {}) {
  return {
    async current(request, response, next) {
      try {
        if (!request.workspaceId) throw createHttpError(401, "WORKSPACE_ACCESS_REQUIRED", "A private workspace is not open in this browser.");
        const workspace = await workspaceService.getWorkspace(request.workspaceId);
        if (!workspace) throw createHttpError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found.");
        return response.json({ workspace: { id: String(workspace._id), name: workspace.name } });
      } catch (error) {
        return next(error);
      }
    },
    async create(request, response, next) {
      try {
        const name = request.body?.name;
        if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
          throw badWorkspace("name must be a non-empty string of at most 80 characters.");
        }
        const { workspace, accessKey } = await workspaceService.createWorkspace(name.trim());
        setWorkspaceCookie(response, workspace._id, accessKey, secureCookies);
        const result = { workspace: { id: workspace._id, name: workspace.name } };
        if (request.get("x-return-workspace-key") === "true") result.access_key = accessKey;
        return response.status(201).json(result);
      } catch (error) {
        return next(error);
      }
    },
  };
}

export function createWorkspaceAccessController({
  workspaceAccessLinkService,
  workspaceService,
  secureCookies = false,
  publicAppUrl,
  ttlMinutes = 15,
}) {
  return {
    async createLink(request, response, next) {
      try {
        const { token, expiresAt } = await workspaceAccessLinkService.create(request.workspaceId, ttlMinutes);
        const path = `/workspaces/${request.params.workspaceId}/open?token=${encodeURIComponent(token)}`;
        const link = new URL(path, publicAppUrl).toString();
        return response.status(201).json({ access_link: link, expires_at: expiresAt.toISOString() });
      } catch (error) {
        return next(error);
      }
    },

    open(request, response, next) {
      try {
        const workspaceId = request.params.workspaceId;
        const token = request.query.token;
        if (!OBJECT_ID_PATTERN.test(workspaceId) || typeof token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
          throw createHttpError(410, "WORKSPACE_LINK_INVALID", "This workspace link is invalid or has expired.");
        }
        response.set("Cache-Control", "no-store");
        response.set("Referrer-Policy", "no-referrer");
        return response.type("html").send(
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open workspace</title><body><main><h1>Open private workspace</h1><p>Continue on this device to use the one-time workspace link.</p><form method="post" action="/workspaces/${workspaceId}/claim"><input type="hidden" name="token" value="${token}"><button type="submit">Open workspace</button></form></main></body></html>`,
        );
      } catch (error) {
        return next(error);
      }
    },

    async claim(request, response, next) {
      try {
        const workspaceId = request.params.workspaceId;
        if (!OBJECT_ID_PATTERN.test(workspaceId)) {
          throw createHttpError(410, "WORKSPACE_LINK_INVALID", "This workspace link is invalid or has expired.");
        }
        const link = await workspaceAccessLinkService.consume(workspaceId, request.body?.token);
        if (!link) throw createHttpError(410, "WORKSPACE_LINK_INVALID", "This workspace link is invalid or has expired.");
        const result = await workspaceService.addAccessKey(workspaceId);
        if (!result) throw createHttpError(410, "WORKSPACE_LINK_INVALID", "This workspace link is invalid or has expired.");
        setWorkspaceCookie(response, workspaceId, result.accessKey, secureCookies);
        return response.redirect(303, "/");
      } catch (error) {
        return next(error);
      }
    },
  };
}
