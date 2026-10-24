import { createHash, randomBytes } from "node:crypto";
import { Workspace } from "../models/workspace.js";

function hashAccessKey(accessKey) {
  return createHash("sha256").update(accessKey).digest("hex");
}

export function createWorkspaceService({ WorkspaceModel = Workspace } = {}) {
  async function createWorkspace(name) {
    const accessKey = randomBytes(32).toString("base64url");
    const workspace = await WorkspaceModel.create({
      name,
      access_key_hash: hashAccessKey(accessKey),
    });
    return { workspace, accessKey };
  }

  async function authenticateWorkspace(workspaceId, accessKey) {
    if (!accessKey) return null;
    return WorkspaceModel.findOne({
      _id: workspaceId,
      access_key_hash: hashAccessKey(accessKey),
    }).select("_id");
  }

  return { createWorkspace, authenticateWorkspace };
}

const defaultService = createWorkspaceService();
export const createWorkspace = defaultService.createWorkspace;
export const authenticateWorkspace = defaultService.authenticateWorkspace;
