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

const summaryCases = Array.from({ length: 50 }, (_, index) => {
  const kind = index % 4;
  const count = kind === 0 ? 0 : index % 8 + 1;
  const checks = Array.from({ length: count }, (_unused, checkIndex) => {
    const isHealthy = kind === 1 || kind === 3 && checkIndex % 2 === 0;
    const checkedAt = new Date(fixedNow.getTime() - checkIndex * (kind === 3 ? 4 : 0.25) * 3_600_000);
    return { checked_at: checkedAt, status_code: isHealthy ? 200 : kind === 3 ? 400 : 500, response_time_ms: checkIndex * 125 + 50,
      records_returned: isHealthy ? 1 : 0, outcome: "ok" };
  });
  const monitor = { _id: "monitor-summary-id", expected_status_code: 200, max_response_time_ms: 1000, expect_records: true };
  const healthy = (check) => check.outcome === "ok" && check.status_code === 200
    && check.response_time_ms <= monitor.max_response_time_ms && check.records_returned > 0;
  const recent24 = checks.filter((check) => check.checked_at >= new Date(fixedNow.getTime() - 86_400_000));
  const recent7d = checks.filter((check) => check.checked_at >= new Date(fixedNow.getTime() - 7 * 86_400_000));
  const times = recent7d.map((check) => check.response_time_ms).sort((a, b) => a - b);
  const latest = [...checks].sort((a, b) => b.checked_at - a.checked_at)[0] ?? null;
  const expected = {
    monitor_id: "monitor-summary-id",
    state: !latest ? "down" : healthy(latest) ? "up" : latest.status_code === 0 || latest.status_code >= 500 ? "down" : "degraded",
    last_check_at: latest?.checked_at ?? null,
    last_response_time_ms: latest?.response_time_ms ?? null,
    uptime_percent: {
      last_24_hours: recent24.length ? Math.round(recent24.filter(healthy).length / recent24.length * 10000) / 100 : null,
      last_7_days: recent7d.length ? Math.round(recent7d.filter(healthy).length / recent7d.length * 10000) / 100 : null,
    },
    average_response_time_ms: times.length ? Math.round(times.reduce((sum, time) => sum + time, 0) / times.length) : null,
    p95_response_time_ms: times.length ? times[Math.max(0, Math.ceil(times.length * 0.95) - 1)] : null,
  };
  return { name: `summary case ${index + 1} (${["empty", "healthy", "all failed", "mixed recent history"][kind]})`, input: checks, monitor, expected };
});
for (const entry of summaryCases) {
  test(`stress history summary: ${entry.name}`, async () => {
    const model = { find(filter) {
      let rows = filter.checked_at
        ? entry.input.filter((check) => check.checked_at >= filter.checked_at.$gte)
        : [...entry.input];
      const query = {
        sort(spec) {
          if (spec?.checked_at) rows.sort((a, b) => spec.checked_at < 0 ? b.checked_at - a.checked_at : a.checked_at - b.checked_at);
          return this;
        },
        limit(count) { return Promise.resolve(rows.slice(0, count)); },
        then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
      };
      return query;
    } };
    const actual = await createCheckHistoryService({ CheckModel: model, clock: () => fixedNow }).summary("workspace-id", entry.monitor);
    assert.deepEqual(actual, entry.expected);
  });
}
