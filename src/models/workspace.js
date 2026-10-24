import mongoose from "mongoose";

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  access_key_hash: { type: String, required: true, select: false },
}, { timestamps: true });

workspaceSchema.index({ access_key_hash: 1 }, { unique: true, name: "unique_workspace_access_key_hash" });

export const Workspace = mongoose.models.Workspace
  ?? mongoose.model("Workspace", workspaceSchema);
