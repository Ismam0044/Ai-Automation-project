import mongoose from "mongoose";

const schema = new mongoose.Schema({
  _id: { type: String },
  count: { type: Number, default: 0 },
  expires_at: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
export const SchedulerMinuteCounter = mongoose.models.SchedulerMinuteCounter ?? mongoose.model("SchedulerMinuteCounter", schema);
