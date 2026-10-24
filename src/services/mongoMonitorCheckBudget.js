import { SchedulerMinuteCounter } from "../models/schedulerMinuteCounter.js";

export function createMongoMonitorCheckBudget({ maxPerMinute = 60, Model = SchedulerMinuteCounter, clock = () => Date.now() } = {}) {
  const current = () => {
    const time = clock(); const minute = Math.floor(time / 60_000) * 60_000;
    return { id: String(minute), expires_at: new Date(minute + 120_000) };
  };
  async function take() {
    const { id, expires_at } = current();
    try {
      return Boolean(await Model.findOneAndUpdate({ _id: id, count: { $lt: maxPerMinute } },
        { $inc: { count: 1 }, $setOnInsert: { expires_at } }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }));
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return Boolean(await Model.findOneAndUpdate({ _id: id, count: { $lt: maxPerMinute } }, { $inc: { count: 1 } }, { returnDocument: "after" }));
    }
  }
  async function remaining() {
    const { id } = current(); const row = await Model.findById(id).lean();
    return Math.max(0, maxPerMinute - (row?.count ?? 0));
  }
  return { take, remaining };
}
