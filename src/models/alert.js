import mongoose from "mongoose";

const alertSchema = new mongoose.Schema({
  api_name: {
    type: String,
    required: true,
    trim: true,
  },
  anomaly_types: {
    type: [String],
    required: true,
    set: (types) => [...new Set(types)].sort(),
    validate: {
      validator: (types) => Array.isArray(types) && types.length > 0,
      message: "An alert must contain at least one anomaly type",
    },
  },
  severity: {
    type: String,
    enum: ["warning", "critical"],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  message_source: {
    type: String,
    enum: ["model", "fallback"],
    default: "fallback",
    required: true,
  },
  input_snapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  status: {
    type: String,
    enum: ["active", "resolved"],
    default: "active",
    required: true,
  },
  dedupe_key: {
    type: String,
    required: true,
  },
  occurrence_count: {
    type: Number,
    min: 1,
    default: 1,
  },
}, {
  timestamps: true,
});

alertSchema.index(
  { dedupe_key: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
    name: "unique_active_alert_dedupe_key",
  },
);

export const Alert = mongoose.models.Alert ?? mongoose.model("Alert", alertSchema);
