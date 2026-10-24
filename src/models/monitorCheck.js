import mongoose from "mongoose";

const monitorCheckSchema = new mongoose.Schema({
  monitor_id: { type: mongoose.Schema.Types.ObjectId, ref: "Monitor", required: true },
  workspace_id: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  status_code: { type: Number, required: true },
  response_time_ms: { type: Number, required: true, min: 0 },
  records_returned: { type: Number, default: null },
  outcome: {
    type: String,
    enum: ["ok", "timeout", "network_error", "blocked", "too_large", "invalid_json"],
    required: true,
  },
  checked_at: { type: Date, required: true, default: Date.now },
  expires_at: { type: Date, required: true },
}, { versionKey: false });

monitorCheckSchema.index({ workspace_id: 1, monitor_id: 1, checked_at: -1 });
monitorCheckSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0, name: "expire_monitor_checks" });

export const MonitorCheck = mongoose.models.MonitorCheck
  ?? mongoose.model("MonitorCheck", monitorCheckSchema);
