import { GeminiDailyUsage } from "../models/geminiDailyUsage.js";

function isDuplicateKey(error) {
  return error?.code === 11000;
}

export function createGeminiUsageService({ UsageModel = GeminiDailyUsage, clock = () => new Date() } = {}) {
  function todayKey() {
    return clock().toISOString().slice(0, 10);
  }

  async function ensureToday(day) {
    try {
      return await UsageModel.findOneAndUpdate(
        { day },
        { $setOnInsert: { day, calls: 0, cap_warning_logged: false } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return UsageModel.findOne({ day });
    }
  }

  async function claimCapWarning(day) {
    return UsageModel.findOneAndUpdate(
      { day, cap_warning_logged: false },
      { $set: { cap_warning_logged: true } },
      { returnDocument: "after" },
    );
  }

  async function reserveGeminiCall(dailyLimit) {
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 0) {
      throw new TypeError("Gemini daily call limit must be a non-negative integer");
    }

    const day = todayKey();
    await ensureToday(day);
    const reservation = dailyLimit > 0
      ? await UsageModel.findOneAndUpdate(
        { day, calls: { $lt: dailyLimit } },
        { $inc: { calls: 1 } },
        { returnDocument: "after" },
      )
      : null;

    if (reservation) return { allowed: true, day };

    const logged = await claimCapWarning(day);
    return { allowed: false, day, logRequired: Boolean(logged) };
  }

  return { reserveGeminiCall };
}

const defaultUsageService = createGeminiUsageService();

export const reserveGeminiCall = defaultUsageService.reserveGeminiCall;
