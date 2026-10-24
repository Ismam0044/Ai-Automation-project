import mongoose from "mongoose";

const monitorCapacitySchema = new mongoose.Schema({
  _id: { type: String, default: "global" },
  count: { type: Number, min: 0, default: 0 },
}, { versionKey: false });

export const MonitorCapacity = mongoose.models.MonitorCapacity
  ?? mongoose.model("MonitorCapacity", monitorCapacitySchema);
