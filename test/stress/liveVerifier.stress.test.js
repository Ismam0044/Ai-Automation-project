import assert from "node:assert/strict";
import test from "node:test";
import { createStressClient, evaluateHttp, runStress, safeScenarioEvidence } from "../../scripts/verify/stress.js";

for (let index = 1; index <= 50; index += 1) {
  test(`stress live-verifier helper: mock fetch scenario ${index}`, async () => {
    let captured;
    const client = createStressClient(async (url, options) => {
      captured = { url: String(url), options };
      return { status: 200 + (index % 5), ok: true, async json() { return { scenario: index }; } };
    });
    const body = { index, fields: ["only synthetic data"] };
    const result = await client(`/health?case=${index}`, { method: "POST", body });
    assert.equal(captured.url, `http://localhost:3000/health?case=${index}`);
    assert.equal(captured.options.headers["content-type"], "application/json");
    assert.equal(captured.options.body, JSON.stringify(body));
    assert.deepEqual(result, { status: 200 + (index % 5), ok: true, payload: { scenario: index } });
    assert.equal(evaluateHttp(result, 200 + (index % 5), (payload) => payload.scenario === index), true);
    assert.deepEqual(safeScenarioEvidence(result.status, result.status, `case ${index}`), {
      status: "Pass", evidence: `HTTP ${result.status}; case ${index}`,
    });
  });
}

test("stress live-verifier helper refuses non-loopback bases and cross-origin routes", async () => {
  assert.throws(() => createStressClient(async () => {}, "https://example.com"), /loopback/);
  const request = createStressClient(async () => assert.fail("fetch must not run"));
  await assert.rejects(request("//example.com/"), /same-origin/);
});

test("live stress verifier builds at least 50 safe rows with mocked fetch and skips absent demo setup", async () => {
  let monitorSubmissions = 0;
  let workspaceNumber = 0;
  const workspaceRows = [];
  let activeOccurrence = 0;
  const sampleAlertId = "0".repeat(24);
  const mockFetch = async (url, options) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const payload = options.body ? JSON.parse(options.body) : null;
    if (parsed.port === "4010") return { status: 404, async json() { return { body: "must not leak" }; } };
    if (path === "/health") return { status: 200, async json() { return { status: "ok", database: "connected" }; } };
    if (path === "/monitor" && options.method === "POST" && !Array.isArray(payload)) {
      return { status: 400, async json() { return { error: { code: "INVALID_BATCH" } }; } };
    }
    if (path === "/monitor" && options.method === "POST" && payload.length === 0) {
      return { status: 200, async json() { return { total_items: 0, results: [] }; } };
    }
    if (path === "/monitor" && options.method === "POST") {
      monitorSubmissions += 1;
      activeOccurrence += 1;
      return { status: 200, async json() { return {
        total_items: 2, healthy_count: 1, failed_items: 0,
        results: [
          { api_name: "PatientDataAPI", status: "healthy", severity: "none", alert_id: null },
          { api_name: "AppointmentAPI", status: monitorSubmissions === 1 ? "created" : "updated", severity: "critical", alert_id: sampleAlertId },
        ],
      }; } };
    }
    if (path === "/alerts" && options.method === "GET") {
      const invalid = parsed.searchParams.get("status") === "invalid" || parsed.searchParams.get("severity") === "urgent"
        || ["0", "999"].includes(parsed.searchParams.get("limit")) || ["0", "1.5"].includes(parsed.searchParams.get("page"));
      if (invalid) return { status: 400, async json() { return { error: { code: "INVALID_ALERT_QUERY" } }; } };
      const alerts = activeOccurrence && parsed.searchParams.get("status") !== "resolved"
        ? [{ _id: sampleAlertId, api_name: "AppointmentAPI", anomaly_types: ["http_status_failure_critical", "records_returned_anomaly", "response_time_critical"], occurrence_count: activeOccurrence, status: "active" }]
        : [];
      return { status: 200, async json() { return { alerts, pagination: { page: Number(parsed.searchParams.get("page") ?? 1) } }; } };
    }
    if (/^\/alerts\/[\da-f]{24}\/resolve$/.test(path) && options.method === "PATCH") {
      activeOccurrence = 0;
      return { status: 200, async json() { return { alert: { status: "resolved" } }; } };
    }
    if (path === "/workspaces" && options.method === "POST") {
      workspaceNumber += 1;
      const workspace = { id: String(workspaceNumber).padStart(24, "0"), key: `syntheticKey${String(workspaceNumber).padStart(40, "x")}` };
      workspaceRows.push(workspace);
      return { status: 201, async json() { return { workspace: { id: workspace.id, name: "synthetic" }, access_key: workspace.key }; } };
    }
    if (path === "/workspaces/current") {
      if (!options.headers.authorization) return { status: 401, async json() { return { error: { code: "WORKSPACE_ACCESS_REQUIRED" } }; } };
      const workspace = workspaceRows.find((row) => options.headers.authorization === `Bearer ${row.key}`);
      return workspace
        ? { status: 200, async json() { return { workspace: { id: workspace.id } }; } }
        : { status: 401, async json() { return { error: { code: "WORKSPACE_ACCESS_REQUIRED" } }; } };
    }
    if (/\/access-links$/.test(path)) {
      return { status: 201, async json() { return { access_link: "https://local.invalid/link?token=synthetic-token", expires_at: "2026-10-25T00:15:00.000Z" }; } };
    }
    if (/\/monitors$/.test(path) && options.method === "GET") {
      const workspace = workspaceRows.find((row) => options.headers.authorization === `Bearer ${row.key}`);
      return workspace && path === `/workspaces/${workspace.id}/monitors`
        ? { status: 200, async json() { return { monitors: [] }; } }
        : { status: 401, async json() { return { error: { code: "WORKSPACE_ACCESS_REQUIRED" } }; } };
    }
    if (/\/monitors$/.test(path) && options.method === "POST") return { status: 400, async json() { return { error: { code: "INVALID_MONITOR" } }; } };
    return { status: 404, async json() { return { error: { code: "NOT_FOUND" } }; } };
  };
  const result = await runStress({ fetchImpl: mockFetch, baseUrl: "http://localhost:3000" });
  assert.ok(result.rows.length >= 50);
  assert.equal(result.rows.some((row) => row.status === "Fail"), false);
  assert.ok(result.rows.some((row) => row.status === "Skipped" && row.evidence.includes("ALLOW_PRIVATE_TARGETS")));
  assert.equal(JSON.stringify(result).includes("syntheticKey"), false);
  assert.equal(JSON.stringify(result).includes("synthetic-token"), false);
});
