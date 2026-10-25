import assert from "node:assert/strict";
import test from "node:test";
import { createMonitorService } from "../../src/services/monitorService.js";

const cases = Array.from({ length: 50 }, (_, index) => {
  const size = [0, 1, 2, 20, 100, 101][index % 6];
  const badAt = size > 2 ? index % size : -1;
  const input = Array.from({ length: size }, (_, item) => item === badAt
    ? { api_name: `Bad-${index}-${item}`, response_time_ms: "slow", status_code: 200, records_returned: 1 }
    : { api_name: `Good-${index}-${item}`, response_time_ms: 100 + item, status_code: 500, records_returned: item + 1 });
  return { name: `batch size ${size}, case ${index + 1}`, input, badAt, expected: {
    total_items: size, healthy_count: 0, anomalies_created: size - (badAt >= 0 ? 1 : 0),
    anomalies_updated: 0, failed_items: badAt >= 0 ? 1 : 0,
    result_api_names: input.map((item) => item.api_name),
  } };
});

for (const entry of cases) {
  test(`stress batch: ${entry.name}`, async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const service = createMonitorService({
      concurrency: 5,
      detector(check) {
        if (check.response_time_ms === "slow") throw new TypeError("synthetic detector failure");
        return { api_name: check.api_name, anomaly_types: ["http_status_failure_critical"], severity: "critical" };
      },
      alertService: {
        async findActiveAlertForDetection() { return null; },
        async saveAlert(detection) { return { _id: detection.api_name, occurrence_count: 1 }; },
      },
      llmService: { async generateAlertMessage() {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return { message: "synthetic status failure", source: "model" };
      } },
      logger: { error() {}, warn() {}, info() {} },
    });
    const summary = await service.processBatch(entry.input.map((item) => ({ ...item })));
    assert.equal(summary.total_items, entry.expected.total_items);
    assert.equal(summary.results.length, entry.input.length);
    assert.equal(summary.healthy_count, entry.expected.healthy_count);
    assert.equal(summary.failed_items, entry.expected.failed_items);
    assert.equal(summary.anomalies_created, entry.expected.anomalies_created);
    assert.equal(summary.anomalies_updated, entry.expected.anomalies_updated);
    assert.deepEqual(summary.results.map((item) => item.api_name), entry.expected.result_api_names);
    assert.equal(inFlight, 0);
    assert.ok(maxInFlight <= 5);
    assert.ok(maxInFlight <= Math.max(1, entry.input.length));
  });
}
