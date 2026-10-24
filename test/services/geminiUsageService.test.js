import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiUsageService } from "../../src/services/geminiUsageService.js";

function createMemoryUsageModel() {
  const counters = new Map();
  return {
    counters,
    async findOneAndUpdate(filter, update, options = {}) {
      let row = counters.get(filter.day);
      if (!row && options.upsert) {
        row = { ...(update.$setOnInsert ?? {}) };
        counters.set(filter.day, row);
      }
      if (!row) return null;
      if (filter.calls?.$lt !== undefined && row.calls >= filter.calls.$lt) return null;
      if (filter.cap_warning_logged === false && row.cap_warning_logged !== false) return null;
      if (update.$inc) {
        for (const [key, amount] of Object.entries(update.$inc)) row[key] = (row[key] ?? 0) + amount;
      }
      if (update.$set) Object.assign(row, update.$set);
      return { ...row };
    },
    async findOne(filter) {
      const row = counters.get(filter.day);
      return row ? { ...row } : null;
    },
  };
}

test("daily Gemini usage counter enforces the cap and claims one warning per UTC day", async () => {
  const UsageModel = createMemoryUsageModel();
  const service = createGeminiUsageService({
    UsageModel,
    clock: () => new Date("2026-10-24T23:59:00Z"),
  });

  assert.deepEqual(await service.reserveGeminiCall(2), { allowed: true, day: "2026-10-24" });
  assert.deepEqual(await service.reserveGeminiCall(2), { allowed: true, day: "2026-10-24" });
  assert.deepEqual(await service.reserveGeminiCall(2), { allowed: false, day: "2026-10-24", logRequired: true });
  assert.deepEqual(await service.reserveGeminiCall(2), { allowed: false, day: "2026-10-24", logRequired: false });
  assert.deepEqual(UsageModel.counters.get("2026-10-24"), {
    day: "2026-10-24",
    calls: 2,
    cap_warning_logged: true,
  });
});

test("daily Gemini counter starts a fresh count on the next UTC day", async () => {
  const UsageModel = createMemoryUsageModel();
  let currentDate = new Date("2026-10-24T23:59:00Z");
  const service = createGeminiUsageService({ UsageModel, clock: () => currentDate });

  await service.reserveGeminiCall(1);
  currentDate = new Date("2026-10-25T00:01:00Z");
  assert.deepEqual(await service.reserveGeminiCall(1), { allowed: true, day: "2026-10-25" });
  assert.equal(UsageModel.counters.get("2026-10-24").calls, 1);
  assert.equal(UsageModel.counters.get("2026-10-25").calls, 1);
});
