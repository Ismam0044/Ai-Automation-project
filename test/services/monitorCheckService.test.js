import assert from "node:assert/strict";
import test from "node:test";
import { createMonitorCheckService } from "../../src/services/monitorCheckService.js";
import { createMonitorCheckBudget } from "../../src/services/monitorCheckBudget.js";

function monitorDoc() {
  return {
    _id: "monitor-a",
    workspace_id: "workspace-a",
    name: "Synthetic API",
    url: "http://127.0.0.1:4010/api",
    method: "GET",
    timeout_ms: 1000,
    expected_status_code: 200,
    max_response_time_ms: 3000,
    expect_records: false,
  };
}

test("two consecutive healthy checks auto-resolve scoped alerts and a later failure creates a new alert", async () => {
  const results = [
    { status_code: 500, response_time_ms: 20, records_returned: 0, outcome: "ok" },
    { status_code: 200, response_time_ms: 20, records_returned: 1, outcome: "ok" },
    { status_code: 200, response_time_ms: 20, records_returned: 1, outcome: "ok" },
    { status_code: 500, response_time_ms: 20, records_returned: 0, outcome: "ok" },
  ];
  const records = [];
  let healthyCount = 0;
  let llmCalls = 0;
  let nextId = 1;
  const repository = {
    async incrementHealthyCount() { healthyCount += 1; return { consecutive_healthy_checks: healthyCount }; },
    async resetHealthyCount() { healthyCount = 0; },
    async releaseLease() {},
  };
  const alertService = {
    async findActiveAlertForDetection(detection, scope) {
      return records.find((record) => record.status === "active"
        && record.workspace_id === scope.workspaceId && record.monitor_id === scope.monitorId
        && record.api_name === detection.api_name) ?? null;
    },
    async saveAlert(detection, snapshot, message, source, scope) {
      const record = { _id: `alert-${nextId++}`, api_name: detection.api_name, message, message_source: source,
        anomaly_types: detection.anomaly_types, severity: detection.severity, workspace_id: scope.workspaceId,
        monitor_id: scope.monitorId, input_snapshot: snapshot, status: "active", occurrence_count: 1 };
      records.push(record);
      return record;
    },
    async resolveMonitorAlerts(workspaceId, monitorId, reason) {
      for (const record of records) {
        if (record.workspace_id === workspaceId && record.monitor_id === monitorId && record.status === "active") {
          record.status = "resolved";
          record.resolution_reason = reason;
        }
      }
    },
  };
  const historyService = { async record() {} };
  const service = createMonitorCheckService({
    fetcher: { async fetchMonitor() { return results.shift(); } },
    historyService,
    monitorRepository: repository,
    alertService,
    llmService: { async generateAlertMessage() { llmCalls += 1; return { message: "Synthetic alert", source: "model" }; } },
    autoResolveHealthyChecks: 2,
  });

  const failed = await service.run(monitorDoc());
  assert.equal(failed.status, "created");
  assert.deepEqual(failed.check, { api_name: "Synthetic API", response_time_ms: 20, status_code: 500, records_returned: 0 });
  assert.equal((await service.run(monitorDoc())).status, "healthy");
  assert.equal((await service.run(monitorDoc())).status, "healthy");
  assert.equal(records[0].status, "resolved");
  assert.match(records[0].resolution_reason, /2 consecutive healthy checks/);
  const failedAgain = await service.run(monitorDoc());
  assert.equal(failedAgain.status, "created");
  assert.equal(records.length, 2);
  assert.equal(records[1].occurrence_count, 1);
  assert.equal(llmCalls, 2);
});

test("monitor check treats transport failures as critical and does not require records by default", async () => {
  let savedDetection;
  const service = createMonitorCheckService({
    fetcher: { async fetchMonitor() { return { status_code: 0, response_time_ms: 5, records_returned: 0, outcome: "network_error" }; } },
    historyService: { async record() {} },
    monitorRepository: { async resetHealthyCount() {} },
    alertService: {
      async findActiveAlertForDetection() { return null; },
      async saveAlert(detection) { savedDetection = detection; return { _id: "alert" }; },
      async resolveMonitorAlerts() {},
    },
    llmService: { async generateAlertMessage() { return { message: "Network failure", source: "model" }; } },
  });
  const result = await service.run(monitorDoc());
  assert.equal(result.severity, "critical");
  assert.ok(savedDetection.anomaly_types.includes("http_status_failure_critical"));
  assert.ok(!savedDetection.anomaly_types.includes("records_returned_anomaly"));
});

test("manual checks consume the shared outgoing-check budget and release a claim when capped", async () => {
  const budget = createMonitorCheckBudget({ maxPerMinute: 1 });
  assert.equal(budget.take(), true);
  let released = false;
  let fetched = false;
  const service = createMonitorCheckService({
    fetcher: { async fetchMonitor() { fetched = true; return {}; } },
    historyService: { async record() {} },
    monitorRepository: {
      async findById() { return monitorDoc(); },
      async claimById() { return monitorDoc(); },
      async releaseLease() { released = true; },
    },
    llmService: { async generateAlertMessage() { return { message: "unused", source: "model" }; } },
    checkBudget: budget,
  });
  await assert.rejects(service.runNow("workspace-a", "monitor-a"), (error) => error.statusCode === 429);
  assert.equal(released, true);
  assert.equal(fetched, false);
});

test("a successful manual check moves the next scheduled time by the monitor interval", async () => {
  let nextInterval;
  let released = false;
  const monitor = { ...monitorDoc(), interval_seconds: 120 };
  const service = createMonitorCheckService({
    fetcher: { async fetchMonitor() { return { status_code: 200, response_time_ms: 10, records_returned: 1, outcome: "ok" }; } },
    historyService: { async record() {} },
    monitorRepository: {
      async findById() { return monitor; },
      async claimById() { return monitor; },
      async scheduleNextCheck(_workspaceId, _monitorId, options) { nextInterval = options.intervalSeconds; },
      async releaseLease() { released = true; },
      async incrementHealthyCount() { return { consecutive_healthy_checks: 1 }; },
    },
    llmService: { async generateAlertMessage() { throw new Error("unused"); } },
  });
  assert.equal((await service.runNow("workspace-a", "monitor-a")).status, "healthy");
  assert.equal(nextInterval, 120);
  assert.equal(released, true);
});

test("manual healthy checks count toward auto-resolution and an intervening failure resets the count", async () => {
  const results = [
    { status_code: 500, response_time_ms: 10, records_returned: 0, outcome: "ok" },
    { status_code: 200, response_time_ms: 10, records_returned: 1, outcome: "ok" },
    { status_code: 500, response_time_ms: 10, records_returned: 0, outcome: "ok" },
    { status_code: 200, response_time_ms: 10, records_returned: 1, outcome: "ok" },
    { status_code: 200, response_time_ms: 10, records_returned: 1, outcome: "ok" },
  ];
  let healthyCount = 0;
  let resolutionCount = 0;
  let alertId = 0;
  const monitor = { ...monitorDoc(), interval_seconds: 60 };
  const repository = {
    async findById() { return monitor; },
    async claimById() { return monitor; },
    async releaseLease() {},
    async scheduleNextCheck() {},
    async incrementHealthyCount() { healthyCount += 1; return { consecutive_healthy_checks: healthyCount }; },
    async resetHealthyCount() { healthyCount = 0; },
  };
  const service = createMonitorCheckService({
    fetcher: { async fetchMonitor() { return results.shift(); } },
    historyService: { async record() {} },
    monitorRepository: repository,
    alertService: {
      async findActiveAlertForDetection() { return null; },
      async saveAlert() { return { _id: `alert-${++alertId}` }; },
      async resolveMonitorAlerts() { resolutionCount += 1; },
    },
    llmService: { async generateAlertMessage() { return { message: "synthetic", source: "fallback" }; } },
    autoResolveHealthyChecks: 2,
    checkBudget: createMonitorCheckBudget({ maxPerMinute: 10 }),
  });

  await service.runNow("workspace-a", "monitor-a");
  await service.runNow("workspace-a", "monitor-a");
  assert.equal(healthyCount, 1);
  await service.runNow("workspace-a", "monitor-a");
  assert.equal(healthyCount, 0, "a failed manual check resets the consecutive count");
  assert.equal(resolutionCount, 0);
  await service.runNow("workspace-a", "monitor-a");
  assert.equal(healthyCount, 1);
  assert.equal(resolutionCount, 0);
  await service.runNow("workspace-a", "monitor-a");
  assert.equal(resolutionCount, 1, "the configured second consecutive healthy check resolves the alert");
});
