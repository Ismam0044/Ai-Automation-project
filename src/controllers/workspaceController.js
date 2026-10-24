import { createHttpError } from "../middleware/httpError.js";

function badWorkspace(message) {
  return createHttpError(400, "INVALID_WORKSPACE", message);
}

export function createWorkspaceController(workspaceService) {
  return {
    async create(request, response, next) {
      try {
        const name = request.body?.name;
        if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
          throw badWorkspace("name must be a non-empty string of at most 80 characters.");
        }
        const { workspace, accessKey } = await workspaceService.createWorkspace(name.trim());
        return response.status(201).json({
          workspace: { id: workspace._id, name: workspace.name },
          access_key: accessKey,
        });
      } catch (error) {
        return next(error);
      }
    },
  };
}
