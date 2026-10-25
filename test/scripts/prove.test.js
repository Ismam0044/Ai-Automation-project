import assert from "node:assert/strict";
import test from "node:test";
import { createProofClient, makeProofDocument, renderProofTable, runProof } from "../../scripts/verify/prove.js";

const sample = [
  { api_name: "PatientDataAPI", response_time_ms: 1200, status_code: 200, records_returned: 50 },
  { api_name: "AppointmentAPI", response_time_ms: 5500, status_code: 500, records_returned: 0 },
];

test("proof client sends JSON to loopback only and returns status with parsed payload", async () => {
  let called;
  const request = createProofClient(async (url, options) => {
    called = { url: String(url), options };
    return { status: 400, ok: false, async json() { return { error: { code: "INVALID_BATCH" } }; } };
  });
  const result = await request("/monitor", { method: "POST", body: { sample: true } });
  assert.equal(called.url, "http://127.0.0.1:3000/monitor");
  assert.equal(called.options.headers["content-type"], "application/json");
  assert.equal(called.options.body, JSON.stringify({ sample: true }));
  assert.deepEqual(result, { status: 400, ok: false, payload: { error: { code: "INVALID_BATCH" } } });
  assert.throws(() => createProofClient(async () => {}, "https://example.com"), /loopback/);
  await assert.rejects(request("//example.com/monitor"), /same-origin/);
});

test("proof table and document redact credentials, tokens, and connection strings", () => {
  const rows = [{ name: "safe case", status: "Pass", evidence: "HTTP 200 Bearer secret-token mongodb://user:pass@host/db token=abc123" }];
  const table = renderProofTable(rows);
  const document = makeProofDocument({ timestamp: "2026-10-25T00:00:00.000Z", rows, cleanup: "workspace remains" });
  assert.match(document, /2026-10-25T00:00:00\.000Z/);
  assert.match(table, /\| safe case \| Pass \|/);
  assert.doesNotMatch(document, /secret-token|user:pass|abc123|mongodb:\/\//);
});

test("proof runner clearly fails and writes a timestamped report when the app is unreachable", async () => {
  let document;
  const result = await runProof({
    fetchImpl: async () => { throw new Error("synthetic connection failure"); },
    timestamp: "2026-10-25T01:02:03.000Z",
    writeDocument: async (value) => { document = value; },
  });
  assert.equal(result.serverReachable, false);
  assert.deepEqual(result.rows, [{
    name: "server reachable", status: "Fail",
    evidence: "No response from 127.0.0.1:3000; start the local app with npm.cmd run dev.",
  }]);
  assert.match(document, /2026-10-25T01:02:03\.000Z/);
  assert.match(document, /\| server reachable \| Fail \|/);
});

test("proof runner reports private-target state and stops before mutations when health is unready", async () => {
  let document;
  let requestCount = 0;
  const result = await runProof({
    fetchImpl: async () => {
      requestCount += 1;
      return { status: 503, async json() { return { status: "unavailable", database: "disconnected", private_targets: "disabled" }; } };
    },
    writeDocument: async (value) => { document = value; },
  });
  assert.equal(requestCount, 1);
  assert.deepEqual(result.rows.map(({ status }) => status), ["Fail", "Skipped"]);
  assert.match(result.rows[0].evidence, /private_targets=disabled/);
  assert.match(document, /private_targets=disabled/);
});

test("mocked full proof verifies sample dedupe, message source, monitor failure/recovery, unsafe URLs, and 400s", async () => {
  const workspaceId = "a".repeat(24);
  const monitorId = "b".repeat(24);
  const sharedAlertId = "c".repeat(24);
  const monitorAlertId = "d".repeat(24);
  const workspaceKey = "synthetic-workspace-key-not-for-output";
  let sharedOccurrence = 0;
  let workspaceAlertStatus = "active";
  let mockMode = "healthy";
  let checkCount = 0;
  let monitorDeleted = false;
  const writes = [];

  const json = (status, payload) => ({ status, async json() { return payload; } });
  const mockedFetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.port === "4010") {
      if (url.pathname === "/healthy") return json(200, [{ id: 1 }]);
      if (url.pathname === "/control") {
        const body = JSON.parse(options.body);
        mockMode = body.mode;
        return json(200, { ok: true });
      }
      if (url.pathname === "/failing") return json(mockMode === "failing" ? 500 : 200, mockMode === "failing" ? { error: "synthetic" } : [{ id: 1 }]);
    }
    const body = options.body ? JSON.parse(options.body) : undefined;
    const auth = options.headers?.authorization;
    if (url.pathname === "/health") return json(200, { status: "ok", database: "connected", private_targets: "enabled" });
    if (url.pathname === "/alerts" && options.method === "GET") {
      const status = url.searchParams.get("status") ?? "active";
      const alerts = [];
      if (sharedOccurrence && status === "active") alerts.push({
        _id: sharedAlertId, api_name: "AppointmentAPI", anomaly_types: [...sampleTypes], status: "active",
        occurrence_count: sharedOccurrence, message_source: "model",
      });
      if (workspaceAlertStatus === status) alerts.push({
        _id: monitorAlertId, api_name: "Proof monitor", monitor_id: monitorId, anomaly_types: ["http_status_failure_critical"],
        status: workspaceAlertStatus, occurrence_count: 1, message_source: "fallback",
      });
      return json(200, { alerts, pagination: { page: 1, limit: 20, total: alerts.length, total_pages: alerts.length ? 1 : 0 } });
    }
    if (url.pathname === "/monitor" && options.method === "POST") {
      if (!Array.isArray(body)) return json(400, { error: { code: "INVALID_BATCH" } });
      sharedOccurrence += 1;
      return json(200, { total_items: 2, healthy_count: 1, failed_items: 0, results: [
        { api_name: "PatientDataAPI", status: "healthy", severity: "none", alert_id: null },
        { api_name: "AppointmentAPI", status: sharedOccurrence === 1 ? "created" : "updated", severity: "critical", alert_id: sharedAlertId },
      ] });
    }
    if (url.pathname === "/workspaces" && options.method === "POST") {
      return json(201, { workspace: { id: workspaceId, name: "Proof" }, access_key: workspaceKey });
    }
    if (url.pathname === `/workspaces/${workspaceId}/monitors` && options.method === "POST") {
      if (!auth) return json(401, { error: { code: "WORKSPACE_ACCESS_REQUIRED" } });
      if (body.url === "https://example.com/" && body.interval_seconds === 59) return json(400, { error: { code: "INVALID_MONITOR" } });
      if (body.url.includes("169.254") || body.url.includes("10.0.0.1") || body.url.includes("user:pass")
        || body.url.startsWith("ftp:") || body.url.startsWith("file:") || body.url === "not a URL" || body.url.length > 2048) {
        return json(400, { error: { code: "INVALID_MONITOR", message: "URL is not allowed." } });
      }
      return json(201, { monitor: { _id: monitorId, ...body } });
    }
    if (url.pathname === `/workspaces/${workspaceId}/monitors/${monitorId}/check` && options.method === "POST") {
      checkCount += 1;
      if (mockMode === "failing") return json(200, { result: { outcome: "ok", status: "created", check: { status_code: 500 }, alert_id: monitorAlertId } });
      workspaceAlertStatus = "resolved";
      return json(200, { result: { outcome: "ok", status: "healthy", check: { status_code: 200 }, alert_id: null } });
    }
    if (url.pathname === `/workspaces/${workspaceId}/monitors/${monitorId}/checks`) {
      return json(200, { checks: Array.from({ length: checkCount }, () => ({})), pagination: { total: checkCount } });
    }
    if (url.pathname === `/workspaces/${workspaceId}/monitors/${monitorId}` && options.method === "DELETE") {
      monitorDeleted = true;
      return json(200, { deleted: true, monitor_id: monitorId });
    }
    if (url.pathname === `/alerts/${sharedAlertId}/resolve` && options.method === "PATCH") {
      return json(200, { alert: { status: "resolved" } });
    }
    return json(404, { error: { code: "NOT_FOUND" } });
  };

  const sampleTypes = ["http_status_failure_critical", "records_returned_anomaly", "response_time_critical"];
  const result = await runProof({ fetchImpl: mockedFetch, sample, timestamp: "2026-10-25T05:00:00.000Z", writeDocument: async (value) => writes.push(value) });
  assert.equal(result.rows.every((row) => row.status === "Pass"), true, JSON.stringify(result.rows));
  assert.equal(result.rows.filter((row) => row.name.startsWith("unsafe URL rejected:")).length, 7);
  assert.ok(result.rows.some((row) => row.name === "sample alert message_source" && row.evidence === "message_source=model"));
  assert.ok(result.rows.some((row) => row.name === "monitor alert message_source" && row.evidence === "message_source=fallback"));
  assert.equal(sharedOccurrence, 2);
  assert.equal(monitorDeleted, true);
  assert.equal(mockMode, "healthy");
  assert.equal(writes.length, 1);
  assert.doesNotMatch(writes[0], /synthetic-workspace-key|password|access_key=/i);
  assert.match(writes[0], /2026-10-25T05:00:00\.000Z/);
});
