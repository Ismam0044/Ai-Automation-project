import mongoose from "mongoose";

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  access_key_hashes: { type: [String], required: true, default: [], select: false },
  last_active_at: { type: Date, required: true, default: Date.now },
  monitor_count: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

workspaceSchema.index({ last_active_at: 1 }, { name: "workspace_inactive_purge" });

export const Workspace = mongoose.models.Workspace
  ?? mongoose.model("Workspace", workspaceSchema);
