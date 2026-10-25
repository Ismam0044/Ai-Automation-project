import assert from "node:assert/strict";
import test from "node:test";
import { createMonitorCheckService } from "../../src/services/monitorCheckService.js";

const cases = Array.from({ length: 50 }, (_, index) => {
  const runCount = index % 6 + 1;
  const withFailure = index >= 25;
  const sequence = withFailure
    ? [...Array(Math.min(runCount, 2)).fill("healthy"), ...(runCount > 2 ? ["failed", ...Array(runCount - 2).fill("healthy")] : [])]
    : Array(runCount).fill("healthy");
  let consecutiveHealthy = 0;
  let expectedResolutions = 0;
  for (const item of sequence) {
    consecutiveHealthy = item === "healthy" ? consecutiveHealthy + 1 : 0;
    if (consecutiveHealthy >= 2) { expectedResolutions += 1; consecutiveHealthy = 0; }
  }
  return { name: `check sequence ${index + 1}`, input: sequence, sequence, expected: {
    resolutions: expectedResolutions, saves: sequence.filter((value) => value === "failed").length,
    statuses: sequence.map((value) => value === "healthy" ? "healthy" : "created"),
  } };
});

for (const entry of cases) {
  test(`stress auto resolve: ${entry.name}`, async () => {
    let position = 0;
    let healthy = 0;
    let resolutions = 0;
    let saves = 0;
    const monitor = { _id: "monitor-id", workspace_id: "workspace-id", name: "Synthetic API", url: "http://127.0.0.1:4010/health",
      method: "GET", interval_seconds: 60, timeout_ms: 1000, expected_status_code: 200, max_response_time_ms: 3000,
      expect_records: false, paused: false };
    const service = createMonitorCheckService({
      fetcher: { async fetchMonitor() {
        const state = entry.sequence[position++];
        return state === "failed"
          ? { status_code: 500, response_time_ms: 100, records_returned: null, outcome: "ok" }
          : { status_code: 200, response_time_ms: 100, records_returned: 1, outcome: "ok" };
      } },
      historyService: { async record() {} },
      monitorRepository: {
        async incrementHealthyCount() { healthy += 1; return { consecutive_healthy_checks: healthy }; },
        async resetHealthyCount() { healthy = 0; },
      },
      alertService: {
        async findActiveAlertForDetection() { return null; },
        async saveAlert() { saves += 1; return { _id: "alert-id", occurrence_count: 1 }; },
        async resolveMonitorAlerts() { resolutions += 1; },
      },
      llmService: { async generateAlertMessage() { return { message: "Synthetic failure.", source: "fallback" }; } },
      autoResolveHealthyChecks: 2,
      checkBudget: { take() { return true; } },
      logger: { info() {}, warn() {}, error() {} },
    });
    const outputs = [];
    for (const _item of entry.sequence) outputs.push(await service.run(monitor));
    assert.equal(position, entry.sequence.length);
    assert.equal(resolutions, entry.expected.resolutions);
    assert.equal(saves, entry.expected.saves);
    assert.equal(outputs.length, entry.sequence.length);
    assert.deepEqual(outputs.map((item) => item.status), entry.expected.statuses);
  });
}
