import mongoose from "mongoose";

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  // Kept for compatibility with databases that still have the legacy singular-key unique index.
  access_key_hash: { type: String, required: true, select: false },
  access_key_hashes: { type: [String], required: true, default: [], select: false },
  last_active_at: { type: Date, required: true, default: Date.now },
  monitor_count: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

workspaceSchema.index({ last_active_at: 1 }, { name: "workspace_inactive_purge" });
workspaceSchema.index({ access_key_hashes: 1 }, { name: "workspace_key_lookup" });
workspaceSchema.index(
  { access_key_hash: 1 },
  {
    unique: true,
    partialFilterExpression: { access_key_hash: { $type: "string" } },
    // Use a new name so an existing non-partial legacy index can remain until explicitly migrated.
    name: "unique_workspace_access_key_hash_string",
  },
);

export const Workspace = mongoose.models.Workspace
  ?? mongoose.model("Workspace", workspaceSchema);
