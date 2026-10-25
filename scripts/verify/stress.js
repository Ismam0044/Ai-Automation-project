import { pathToFileURL } from "node:url";

const DEMO_BASE = process.env.STRESS_DEMO_URL ?? "http://127.0.0.1:4010";

function localBase(value) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.replace(/^\[|\]$/g, ""))) {
    throw new TypeError("STRESS_BASE_URL must point to loopback.");
  }
  return parsed.origin;
}

export function safeScenarioEvidence(expectedStatus, actualStatus, hint = "") {
  return {
    status: expectedStatus === actualStatus ? "Pass" : "Fail",
    evidence: `HTTP ${actualStatus}${hint ? `; ${hint}` : ""}`.replace(/[\r\n\t]/g, " ").slice(0, 120),
  };
}

export function evaluateHttp(response, expectedStatus, predicate = () => true) {
  return response.status === expectedStatus && predicate(response.payload);
}

export function createStressClient(fetchImpl, baseUrl = "http://localhost:3000") {
  if (typeof fetchImpl !== "function") throw new TypeError("Built-in fetch is required.");
  const origin = localBase(baseUrl);
  return async function request(route, { method = "GET", body, headers = {} } = {}) {
    if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) {
      throw new TypeError("Route must be a same-origin path.");
    }
    const response = await fetchImpl(new URL(route, origin), {
      method,
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
    });
    let payload = null;
    try { payload = await response.json(); } catch { /* Never print or retain response text. */ }
    return { status: response.status, ok: response.ok, payload };
  };
}

export async function runStress({ fetchImpl = globalThis.fetch, baseUrl = process.env.STRESS_BASE_URL ?? "http://localhost:3000" } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Built-in fetch is required.");
  const base = localBase(baseUrl);
  const rows = [];
  const createdWorkspaces = [];
  const createdMonitors = [];
  const areas = { health: [], anonymous: [], alerts: [], workspaces: [], monitors: [], checks: [] };
  const request = createStressClient(fetchImpl, base);
  const add = (area, name, status, evidence) => {
    const row = { area, name, status, evidence: String(evidence).replace(/[\r\n\t]/g, " ").slice(0, 120) };
    rows.push(row); areas[area].push(row); return row;
  };
  const run = async (area, name, expectedStatus, route, options, predicate = () => true) => {
    try {
      const result = await request(route, options);
      const pass = evaluateHttp(result, expectedStatus, predicate);
      add(area, name, pass ? "Pass" : "Fail", `HTTP ${result.status}${pass ? "; expected shape matched" : "; response did not match expected status/shape"}`);
      return result;
    } catch {
      add(area, name, "Fail", "local request or response error");
      return null;
    }
  };

  // Health: ten distinct harmless query variants, exact status and JSON fields.
  for (let i = 1; i <= 10; i += 1) {
    await run("health", `health JSON check ${i}`, 200, `/health?case=${i}`, undefined,
      (payload) => payload?.status === "ok" && payload?.database === "connected");
  }

  let sample = [];
  try {
    const { readFile } = await import("node:fs/promises");
    sample = JSON.parse(await readFile(new URL("../../sample-data/api-responses.json", import.meta.url), "utf8"));
  } catch { /* The named sample cases fail below without exposing file contents. */ }
  let sampleAlertId = null;
  let sampleAlertCreated = false;
  for (let repeat = 1; repeat <= 2; repeat += 1) {
    const result = await run("anonymous", `assessment sample submission ${repeat}`, 200, "/monitor", { method: "POST", body: sample },
      (payload) => payload?.total_items === 2 && payload?.healthy_count === 1 && payload?.failed_items === 0
        && payload?.results?.find((item) => item.api_name === "PatientDataAPI")?.status === "healthy"
        && payload?.results?.find((item) => item.api_name === "AppointmentAPI")?.severity === "critical");
    const appointment = result?.payload?.results?.find((item) => item.api_name === "AppointmentAPI");
    if (appointment?.alert_id) {
      sampleAlertId = appointment.alert_id;
      if (repeat === 1 && appointment.status === "created") sampleAlertCreated = true;
    }
  }
  await run("anonymous", "non-array batch rejected", 400, "/monitor", { method: "POST", body: { invalid: true } },
    (payload) => payload?.error?.code === "INVALID_BATCH");
  await run("anonymous", "empty batch accepted", 200, "/monitor", { method: "POST", body: [] },
    (payload) => payload?.total_items === 0 && payload?.results?.length === 0);
  for (let i = 0; i < 12; i += 1) {
    const status = i % 2 ? "resolved" : "active";
    const result = await run("alerts", `alerts query page ${i + 1}`, 200,
      `/alerts?status=${status}&limit=${(i % 5) + 1}&page=${(i % 3) + 1}`, undefined,
      (payload) => Array.isArray(payload?.alerts) && payload?.pagination?.page === (i % 3) + 1);
  }
  for (const [index, query] of ["status=invalid", "limit=0", "limit=999", "page=0", "page=1.5", "severity=urgent"].entries()) {
    await run("alerts", `invalid alerts query ${index + 1}`, 400, `/alerts?${query}`, undefined,
      (payload) => payload?.error?.code === "INVALID_ALERT_QUERY");
  }

  const workspaces = [];
  for (let index = 1; index <= 2; index += 1) {
    const response = await run("workspaces", `create isolated workspace ${index}`, 201, "/workspaces", {
      method: "POST", body: { name: `Stress Workspace ${index}` }, headers: { "x-return-workspace-key": "true" },
    }, (payload) => typeof payload?.workspace?.id === "string" && typeof payload?.access_key === "string");
    if (response?.payload?.workspace?.id && response?.payload?.access_key) {
      const workspace = { id: response.payload.workspace.id, key: response.payload.access_key };
      workspaces.push(workspace); createdWorkspaces.push(workspace.id);
      response.payload.access_key = "[REDACTED]";
    }
  }
  await run("workspaces", "anonymous current workspace is rejected", 401, "/workspaces/current");
  const primary = workspaces[0];
  const secondary = workspaces[1];
  let monitor = null;
  if (primary) {
    const auth = { authorization: `Bearer ${primary.key}` };
    await run("workspaces", "current workspace is scoped", 200, "/workspaces/current", { headers: auth },
      (payload) => payload?.workspace?.id === primary.id);
    await run("workspaces", "empty monitor list shape", 200, `/workspaces/${primary.id}/monitors`, { headers: auth },
      (payload) => Array.isArray(payload?.monitors));
    const link = await run("workspaces", "one-time workspace link issuance", 201, `/workspaces/${primary.id}/access-links`, { method: "POST", headers: auth },
      (payload) => typeof payload?.access_link === "string" && typeof payload?.expires_at === "string");
    if (link?.payload?.access_link) link.payload.access_link = "[REDACTED]";
    if (secondary) await run("workspaces", "other workspace key cannot access first workspace", 401,
      `/workspaces/${primary.id}/monitors`, { headers: { authorization: `Bearer ${secondary.key}` } });
  }

  let demoAvailable = false;
  try {
    const demoCheck = await fetchImpl(new URL("/healthy", localBase(DEMO_BASE)), { redirect: "manual" });
    demoAvailable = demoCheck.status === 200;
  } catch { demoAvailable = false; }
  const demoNames = [
    "loopback monitor create", "monitor list after create", "monitor detail", "summary endpoint", "empty check history",
    "manual check now", "check history after manual run", "pause monitor", "paused state read", "resume monitor",
    "edit monitor name", "monitor scoped from another workspace", "monitor update rejects unsafe URL", "monitor delete",
    "monitor absent after delete", "monitor check rejected when paused",
  ];
  if (!primary || !demoAvailable) {
    const reason = !primary ? "workspace setup unavailable" : "requires loopback mock API on port 4010 and ALLOW_PRIVATE_TARGETS=true";
    for (const name of demoNames) add("monitors", name, "Skipped", reason);
    for (let index = 1; index <= 4; index += 1) add("checks", `demo check/history scenario ${index}`, "Skipped", reason);
  } else {
    const auth = { authorization: `Bearer ${primary.key}` };
    const created = await request(`/workspaces/${primary.id}/monitors`, { method: "POST", headers: auth, body: {
      name: "Stress Demo Monitor", url: `${new URL(DEMO_BASE).origin}/healthy`, interval_seconds: 60, timeout_ms: 3000,
      expected_status_code: 200, max_response_time_ms: 5000, expect_records: true,
    } }).catch(() => null);
    if (created?.status === 201 && created.payload?.monitor?._id) {
      monitor = created.payload.monitor;
      createdMonitors.push({ workspace: primary, id: String(monitor._id) });
      add("monitors", demoNames[0], "Pass", "HTTP 201; loopback monitor saved");
    } else {
      const unsafeConfig = created?.status === 400;
      const skipReason = unsafeConfig ? "requires ALLOW_PRIVATE_TARGETS=true in the app process" : "local monitor setup rejected";
      add("monitors", demoNames[0], unsafeConfig ? "Skipped" : "Fail", `HTTP ${created?.status ?? "network error"}; ${skipReason}`);
      for (const name of demoNames.slice(1)) add("monitors", name, "Skipped", skipReason);
      for (let index = 1; index <= 4; index += 1) add("checks", `demo check/history scenario ${index}`, "Skipped", skipReason);
    }
    if (monitor) {
      const path = `/workspaces/${primary.id}/monitors/${monitor._id}`;
      const list = await run("monitors", demoNames[1], 200, `/workspaces/${primary.id}/monitors`, { headers: auth }, (payload) => payload?.monitors?.some((item) => String(item._id) === String(monitor._id)));
      await run("monitors", demoNames[2], 200, path, { headers: auth }, (payload) => String(payload?.monitor?._id) === String(monitor._id));
      await run("monitors", demoNames[3], 200, `${path}/summary`, { headers: auth }, (payload) => payload?.summary?.monitor_id === String(monitor._id));
      await run("monitors", demoNames[4], 200, `${path}/checks`, { headers: auth }, (payload) => Array.isArray(payload?.checks));
      await run("checks", demoNames[5], 200, `${path}/check`, { method: "POST", headers: auth }, (payload) => payload?.result?.status === "healthy");
      await run("checks", demoNames[6], 200, `${path}/checks`, { headers: auth }, (payload) => payload?.pagination?.total >= 1);
      await run("monitors", demoNames[7], 200, path, { method: "PATCH", headers: auth, body: { paused: true } }, (payload) => payload?.monitor?.paused === true);
      await run("monitors", demoNames[8], 200, path, { headers: auth }, (payload) => payload?.monitor?.paused === true);
      await run("checks", "manual check on paused monitor rejected", 409, `${path}/check`, { method: "POST", headers: auth }, (payload) => payload?.error?.code === "MONITOR_PAUSED");
      await run("monitors", demoNames[9], 200, path, { method: "PATCH", headers: auth, body: { paused: false } }, (payload) => payload?.monitor?.paused === false);
      await run("monitors", demoNames[10], 200, path, { method: "PATCH", headers: auth, body: { name: "Stress Demo Edited" } }, (payload) => payload?.monitor?.name === "Stress Demo Edited");
      if (secondary) await run("monitors", demoNames[11], 401, path, { headers: { authorization: `Bearer ${secondary.key}` } });
      await run("monitors", demoNames[12], 400, path, { method: "PATCH", headers: auth, body: { url: "http://127.0.0.1:3000/health" } }, (payload) => payload?.error?.code === "INVALID_MONITOR");
      if (secondary) await run("checks", "other workspace cannot read check history", 401, `${path}/checks`, { headers: { authorization: `Bearer ${secondary.key}` } });
      await run("checks", "invalid history pagination is rejected", 400, `${path}/checks?page=0`, { headers: auth }, (payload) => payload?.error?.code === "INVALID_CHECK_QUERY");
      // remove and confirm disappearance; cleanup repeats in finally if either call fails.
      const deleted = await run("monitors", demoNames[13], 200, path, { method: "DELETE", headers: auth }, (payload) => payload?.deleted === true);
      if (deleted && deleted.status === 200) createdMonitors.length = 0;
      await run("monitors", demoNames[14], 404, path, { headers: auth }, (payload) => payload?.error?.code === "MONITOR_NOT_FOUND");
      await run("monitors", demoNames[15], 404, `${path}/check`, { method: "POST", headers: auth }, (payload) => payload?.error?.code === "MONITOR_NOT_FOUND");
    }
  }

  if (sampleAlertCreated && sampleAlertId) {
    await run("alerts", "resolve created assessment alert", 200, `/alerts/${sampleAlertId}/resolve`, { method: "PATCH" }, (payload) => payload?.alert?.status === "resolved");
    await run("alerts", "resolved assessment alert absent from active list", 200, "/alerts", undefined,
      (payload) => Array.isArray(payload?.alerts) && !payload.alerts.some((item) => String(item._id) === sampleAlertId));
  } else {
    add("alerts", "resolve assessment alert", "Skipped", "existing shared alerts are preserved by the verifier");
    add("alerts", "confirm resolved alert absent", "Skipped", "no new shared alert was created by this run");
  }

  // Cleanup is best effort and never writes identifiers or credentials to output.
  for (const item of [...createdMonitors]) {
    const result = await request(`/workspaces/${item.workspace.id}/monitors/${item.id}`, { method: "DELETE", headers: { authorization: `Bearer ${item.workspace.key}` } }).catch(() => null);
    if (result?.status === 200) createdMonitors.splice(createdMonitors.indexOf(item), 1);
  }
  if (sampleAlertCreated && sampleAlertId) {
    await request(`/alerts/${encodeURIComponent(sampleAlertId)}/resolve`, { method: "PATCH" }).catch(() => null);
  }
  return { rows, areas, remaining: { workspacesWithoutDeleteRoute: createdWorkspaces.length, monitors: createdMonitors.length, sampleAlertResolved: sampleAlertCreated && Boolean(sampleAlertId) } };
}

function printResult(result) {
  console.log("AREA         SCENARIO                                      RESULT  EVIDENCE");
  for (const row of result.rows) console.log(`${row.area.padEnd(12)} ${row.name.padEnd(44)} ${row.status.padEnd(7)} ${row.evidence}`);
  console.log("\nCounts by area:");
  for (const [area, rows] of Object.entries(result.areas)) {
    console.log(`${area}: ${rows.filter((row) => row.status === "Pass").length} Pass, ${rows.filter((row) => row.status === "Fail").length} Fail, ${rows.filter((row) => row.status === "Skipped").length} Skipped / ${rows.length}`);
  }
  console.log(`Cleanup: ${result.remaining.monitors} monitor(s) remain pending cleanup; ${result.remaining.workspacesWithoutDeleteRoute} workspace(s) created (no workspace delete route); sample alert resolved=${result.remaining.sampleAlertResolved}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const baseUrl = localBase(process.env.STRESS_BASE_URL ?? "http://localhost:3000");
    const result = await runStress({ baseUrl });
    printResult(result);
    if (result.rows.some((row) => row.status === "Fail")) process.exitCode = 1;
  } catch (error) {
    console.log(`Stress verification could not start: ${error instanceof TypeError ? "invalid local configuration" : "local verifier error"}`);
    process.exitCode = 1;
  }
}
