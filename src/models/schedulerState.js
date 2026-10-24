import mongoose from "mongoose";

const schema = new mongoose.Schema({ _id: String, position: { type: Number, default: 0 } }, { versionKey: false });
export const SchedulerState = mongoose.models.SchedulerState ?? mongoose.model("SchedulerState", schema);
