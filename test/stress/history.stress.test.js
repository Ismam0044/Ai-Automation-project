import assert from "node:assert/strict";
import test from "node:test";
import { createCheckHistoryService } from "../../src/services/checkHistoryService.js";

const fixedNow = new Date("2026-10-25T00:00:00Z");
const cases = Array.from({ length: 50 }, (_, index) => ({
  name: `retention ${index + 1} days`, retentionDays: index + 1,
  checkedAt: new Date(fixedNow.getTime() - ((index % 20) * 60_000)),
  result: { status_code: 200, response_time_ms: index * 17, records_returned: index + 1, outcome: "ok" },
}));
for (const entry of cases) {
  test(`stress history retention: ${entry.name}`, async () => {
    let saved;
    const service = createCheckHistoryService({
      CheckModel: { async create(value) { saved = value; return value; } },
      clock: () => entry.checkedAt,
      retentionDays: entry.retentionDays,
    });
    const actual = await service.record("workspace-id", "monitor-id", entry.result);
    assert.equal(actual, saved);
    assert.deepEqual(saved, {
      workspace_id: "workspace-id", monitor_id: "monitor-id", ...entry.result,
      checked_at: entry.checkedAt,
      expires_at: new Date(entry.checkedAt.getTime() + entry.retentionDays * 86_400_000),
    });
  });
}

test("history p95 uses nearest-rank and average uses only finite nonnegative timings", async () => {
  const checks = Array.from({ length: 100 }, (_, i) => ({ checked_at: new Date(fixedNow.getTime() - i), status_code: 200,
    response_time_ms: i + 1, outcome: "ok", records_returned: 1 }));
  const model = { find(filter) {
    const filtered = filter.checked_at ? checks.filter((row) => row.checked_at >= filter.checked_at.$gte) : checks;
    return { sort() { return { limit: async () => filtered.slice(0, 1) }; }, then(resolve, reject) { return Promise.resolve(filtered).then(resolve, reject); } };
  } };
  const service = createCheckHistoryService({ CheckModel: model, clock: () => fixedNow });
  const monitor = { _id: "monitor-id", expected_status_code: 200, max_response_time_ms: 200, expect_records: false };
  const summary = await service.summary("workspace-id", monitor);
  assert.equal(summary.state, "up");
  assert.equal(summary.last_response_time_ms, 1);
  assert.equal(summary.average_response_time_ms, 51);
  assert.equal(summary.p95_response_time_ms, 95);
  assert.equal(summary.uptime_percent.last_7_days, 100);
});
