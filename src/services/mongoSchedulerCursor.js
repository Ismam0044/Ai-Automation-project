import { SchedulerState } from "../models/schedulerState.js";

export function createMongoSchedulerCursor({ Model = SchedulerState } = {}) {
  return {
    async nextOffset(length) {
      if (!length) return 0;
      let row;
      try { row = await Model.findOneAndUpdate({ _id: "monitor-due-workspace-cursor" }, { $inc: { position: 1 } }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }); }
      catch (error) {
        if (error?.code !== 11000) throw error;
        row = await Model.findOneAndUpdate({ _id: "monitor-due-workspace-cursor" }, { $inc: { position: 1 } }, { returnDocument: "after" });
      }
      return Math.max(0, (row.position - 1) % length);
    },
  };
}
