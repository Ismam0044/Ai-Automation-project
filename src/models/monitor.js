import mongoose from "mongoose";

const monitorSchema = new mongoose.Schema({
  workspace_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace",
    required: true,
  },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  url: { type: String, required: true, maxlength: 2048 },
}, { timestamps: true });

monitorSchema.index({ workspace_id: 1, updatedAt: -1 });

export const Monitor = mongoose.models.Monitor
  ?? mongoose.model("Monitor", monitorSchema);
