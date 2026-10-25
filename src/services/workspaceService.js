import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Workspace } from "../models/workspace.js";

const MAX_WORKSPACE_KEYS = 10;

function hashAccessKey(accessKey) {
  return createHash("sha256").update(accessKey).digest("hex");
}

function constantTimeKeyMatch(storedHashes, accessKey) {
  const candidate = Buffer.from(hashAccessKey(accessKey), "hex");
  let matched = 0;
  for (const storedHash of storedHashes) {
    const stored = Buffer.from(storedHash, "hex");
    const equal = stored.length === candidate.length && timingSafeEqual(stored, candidate);
    matched |= Number(equal);
  }
  return matched === 1;
}

export function createWorkspaceService({ WorkspaceModel = Workspace } = {}) {
  function keyQuery(workspaceId) {
    return WorkspaceModel.findById(workspaceId).select("+access_key_hashes");
  }

  async function createWorkspace(name) {
    const accessKey = randomBytes(32).toString("base64url");
    const accessKeyHash = hashAccessKey(accessKey);
    const workspace = await WorkspaceModel.create({
      name,
      access_key_hash: accessKeyHash,
      access_key_hashes: [accessKeyHash],
      last_active_at: new Date(),
    });
    return { workspace, accessKey };
  }

  async function getWorkspace(workspaceId) {
    return WorkspaceModel.findById(workspaceId).select("_id name");
  }

  async function authenticateWorkspace(workspaceId, accessKey) {
    if (typeof accessKey !== "string" || accessKey.length > 128) return null;
    const workspace = await keyQuery(workspaceId);
    if (!workspace || !constantTimeKeyMatch(workspace.access_key_hashes ?? [], accessKey)) return null;
    return WorkspaceModel.findOneAndUpdate(
      { _id: workspaceId, access_key_hashes: hashAccessKey(accessKey) },
      { $set: { last_active_at: new Date() } },
      { returnDocument: "after" },
    ).select("_id name last_active_at");
  }

  async function authenticateAccessKey(accessKey) {
    if (typeof accessKey !== "string" || accessKey.length > 128) return null;
    const storedHash = hashAccessKey(accessKey);
    const workspace = await WorkspaceModel.findOne({ access_key_hashes: storedHash }).select("+access_key_hashes");
    if (!workspace || !constantTimeKeyMatch(workspace.access_key_hashes ?? [], accessKey)) return null;
    return WorkspaceModel.findOneAndUpdate(
      { _id: workspace._id, access_key_hashes: storedHash },
      { $set: { last_active_at: new Date() } },
      { returnDocument: "after" },
    ).select("_id name last_active_at");
  }

  async function addAccessKey(workspaceId) {
    const accessKey = randomBytes(32).toString("base64url");
    const accessKeyHash = hashAccessKey(accessKey);
    const workspace = await WorkspaceModel.findByIdAndUpdate(
      workspaceId,
      {
        $set: { access_key_hash: accessKeyHash, last_active_at: new Date() },
        $push: { access_key_hashes: { $each: [accessKeyHash], $slice: -MAX_WORKSPACE_KEYS } },
      },
      { returnDocument: "after", runValidators: true },
    ).select("_id name last_active_at");
    return workspace ? { workspace, accessKey } : null;
  }

  return { createWorkspace, getWorkspace, authenticateWorkspace, authenticateAccessKey, addAccessKey };
}

const defaultService = createWorkspaceService();
export const createWorkspace = defaultService.createWorkspace;
export const authenticateWorkspace = defaultService.authenticateWorkspace;
export const authenticateWorkspaceAccessKey = defaultService.authenticateAccessKey;
export const addWorkspaceAccessKey = defaultService.addAccessKey;
