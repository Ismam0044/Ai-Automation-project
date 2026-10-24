import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/wiring_mock_only";
process.env.NODE_ENV = "test";
process.env.VERCEL = "1";
process.env.TRUST_PROXY = "1";

const [{ createMonitorCheckRuntime }, { default: apiApp }] = await Promise.all([
  import("../src/services/monitorCheckRuntime.js"),
  import("../api/index.js"),
]);

test("local server and Vercel entry build the shared check runtime with DB and fetcher mocked", async () => {
  const settings = {
    maxMonitorsPerWorkspace: 10,
    maxTotalMonitors: 100,
    checkHistoryRetentionDays: 14,
    autoResolveHealthyChecks: 2,
    monitorCheckLeaseMs: 120000,
    geminiTimeoutMs: 10000,
    monitorResponseMaxBytes: 1024,
    allowPrivateTargets: false,
  };
  const runtime = createMonitorCheckRuntime({
    settings,
    monitorRepository: {
      async incrementHealthyCount() { return { consecutive_healthy_checks: 1 }; },
      async resetHealthyCount() {},
    },
    historyService: { async record() {} },
    alertService: {
      async findActiveAlertForDetection() { return null; },
      async saveAlert() { assert.fail("Healthy result should not save an alert"); },
      async resolveMonitorAlerts() {},
    },
    fetcher: {
      async fetchMonitor() { return { status_code: 200, response_time_ms: 150, records_returned: 2, outcome: "ok" }; },
    },
    logger: { info() {}, warn() {}, error() {} },
    // Deliberately omit llmService: the shared wiring supplies the real LLM service.
  });

  const result = await runtime.monitorCheckService.run({
    _id: "monitor-id",
    workspace_id: "workspace-id",
    name: "Synthetic API",
    expected_status_code: 200,
    max_response_time_ms: 3000,
    expect_records: false,
  });
  assert.equal(result.status, "healthy");
  assert.equal(typeof apiApp, "function", "api/index.js imports the Express app and its real route wiring");

  const serverSource = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(serverSource, /createMonitorCheckRuntime\(/);
  assert.match(serverSource, /llmService:\s*\{\s*generateAlertMessage\s*\}/);
});
