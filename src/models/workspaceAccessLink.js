import mongoose from "mongoose";

const workspaceAccessLinkSchema = new mongoose.Schema({
  workspace_id: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  token_hash: { type: String, required: true, unique: true },
  expires_at: { type: Date, required: true },
  consumed_at: { type: Date, default: null },
}, { timestamps: true });

workspaceAccessLinkSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0, name: "expire_workspace_access_links" });
workspaceAccessLinkSchema.index({ workspace_id: 1 });

export const WorkspaceAccessLink = mongoose.models.WorkspaceAccessLink
  ?? mongoose.model("WorkspaceAccessLink", workspaceAccessLinkSchema);
