import assert from "node:assert/strict";
import test from "node:test";
import { MonitorCheck } from "../../src/models/monitorCheck.js";
import { createCheckHistoryService } from "../../src/services/checkHistoryService.js";

function memoryCheckModel(records) {
  return {
    async create(record) { records.push(record); return record; },
    find(filter) {
      let found = records.filter((record) => Object.entries(filter).every(([key, value]) => {
        if (key === "checked_at") return record.checked_at >= value.$gte;
        return String(record[key]) === String(value);
      }));
      let offset = 0;
      let limit = Infinity;
      const query = {
        sort(spec) {
          if (spec.checked_at === -1) found = [...found].sort((a, b) => b.checked_at - a.checked_at);
          return this;
        },
        skip(value) { offset = value; return this; },
        limit(value) { limit = value; return Promise.resolve(found.slice(offset, offset + limit)); },
        then(resolve, reject) { return Promise.resolve(found).then(resolve, reject); },
      };
      return query;
    },
    async countDocuments(filter) {
      return records.filter((record) => Object.entries(filter).every(([key, value]) => String(record[key]) === String(value))).length;
    },
  };
}

test("monitor check history schema has a TTL index", () => {
  const ttl = MonitorCheck.schema.indexes().find(([keys]) => keys.expires_at === 1);
  assert.ok(ttl);
  assert.equal(ttl[1].expireAfterSeconds, 0);
});

test("check history records only check metrics and expires after configured retention", async () => {
  const records = [];
  const now = new Date("2026-10-24T00:00:00Z");
  const service = createCheckHistoryService({ CheckModel: memoryCheckModel(records), retentionDays: 14, clock: () => now });
  const saved = await service.record("workspace-a", "monitor-a", {
    status_code: 200, response_time_ms: 50, records_returned: 2, outcome: "ok",
  });
  assert.equal(saved.expires_at.toISOString(), "2026-11-07T00:00:00.000Z");
  assert.deepEqual(Object.keys(saved).sort(), ["checked_at", "expires_at", "monitor_id", "outcome", "records_returned", "response_time_ms", "status_code", "workspace_id"].sort());
});

test("check history pagination and summary compute state, uptime, average and p95", async () => {
  const now = new Date("2026-10-24T00:00:00Z");
  const records = [
    { workspace_id: "w", monitor_id: "m", checked_at: new Date(now - 1_000), status_code: 500, response_time_ms: 1200, records_returned: 0, outcome: "ok" },
    { workspace_id: "w", monitor_id: "m", checked_at: new Date(now - 2_000), status_code: 200, response_time_ms: 1500, records_returned: 2, outcome: "ok" },
    { workspace_id: "w", monitor_id: "m", checked_at: new Date(now - 3_000), status_code: 200, response_time_ms: 500, records_returned: 2, outcome: "ok" },
    { workspace_id: "w", monitor_id: "m", checked_at: new Date(now - 2 * 86_400_000), status_code: 200, response_time_ms: 700, records_returned: 1, outcome: "ok" },
    { workspace_id: "other", monitor_id: "m", checked_at: now, status_code: 200, response_time_ms: 1, records_returned: 1, outcome: "ok" },
  ];
  const service = createCheckHistoryService({ CheckModel: memoryCheckModel(records), clock: () => now });
  const page = await service.list("w", "m", { page: 2, limit: 2 });
  assert.equal(page.checks.length, 2);
  assert.deepEqual(page.pagination, { page: 2, limit: 2, total: 4, total_pages: 2 });
  const summary = await service.summary("w", {
    _id: "m", expected_status_code: 200, max_response_time_ms: 1000, expect_records: true,
  });
  assert.equal(summary.state, "down");
  assert.equal(summary.last_response_time_ms, 1200);
  assert.equal(summary.uptime_percent.last_24_hours, 33.33);
  assert.equal(summary.uptime_percent.last_7_days, 50);
  assert.equal(summary.average_response_time_ms, 975);
  assert.equal(summary.p95_response_time_ms, 1500);
});
