import { createHash, randomBytes } from "node:crypto";
import { WorkspaceAccessLink } from "../models/workspaceAccessLink.js";

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createWorkspaceAccessLinkService({ LinkModel = WorkspaceAccessLink, clock = () => new Date() } = {}) {
  async function create(workspaceId, ttlMinutes) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(clock().getTime() + ttlMinutes * 60_000);
    await LinkModel.create({
      workspace_id: workspaceId,
      token_hash: tokenHash(token),
      expires_at: expiresAt,
      consumed_at: null,
    });
    return { token, expiresAt };
  }

  async function consume(workspaceId, token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
    return LinkModel.findOneAndUpdate(
      {
        workspace_id: workspaceId,
        token_hash: tokenHash(token),
        expires_at: { $gt: clock() },
        consumed_at: null,
      },
      { $set: { consumed_at: clock() } },
      { returnDocument: "after" },
    );
  }

  return { create, consume };
}

const defaultService = createWorkspaceAccessLinkService();
export const createWorkspaceAccessLink = defaultService.create;
export const consumeWorkspaceAccessLink = defaultService.consume;
