import mongoose from "mongoose";

const monitorSchema = new mongoose.Schema({
  workspace_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace",
    required: true,
  },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  url: {
    type: String,
    required: true,
    maxlength: 2048,
    validate: {
      validator(value) {
        try {
          const parsed = new URL(value);
          const standardPort = parsed.protocol === "https:" ? "443" : "80";
          return ["http:", "https:"].includes(parsed.protocol)
            && !parsed.username
            && !parsed.password
            && (!parsed.port || parsed.port === standardPort);
        } catch {
          return false;
        }
      },
      message: "url must be a valid HTTP or HTTPS URL on a standard port without credentials",
    },
  },
  method: { type: String, enum: ["GET", "HEAD"], default: "GET", required: true },
  interval_seconds: {
    type: Number,
    min: 60,
    max: 86400,
    default: 300,
    required: true,
    validate: { validator: Number.isInteger, message: "interval_seconds must be a whole number" },
  },
  timeout_ms: {
    type: Number,
    min: 100,
    max: 30000,
    default: 5000,
    required: true,
    validate: { validator: Number.isInteger, message: "timeout_ms must be a whole number" },
  },
  records_field: {
    type: String,
    default: null,
    maxlength: 128,
    validate: {
      validator(value) {
        if (value === null || value === undefined || value === "") return true;
        if (typeof value !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(value)) return false;
        return value.split(".").every((part) => !["__proto__", "prototype", "constructor"].includes(part));
      },
      message: "records_field must be a safe dotted field path",
    },
  },
}, { timestamps: true });

monitorSchema.index({ workspace_id: 1, updatedAt: -1 });

export const Monitor = mongoose.models.Monitor
  ?? mongoose.model("Monitor", monitorSchema);
