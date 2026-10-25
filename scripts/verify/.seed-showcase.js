import { spawn } from "node:child_process";

const app = "http://127.0.0.1:3000";
const mockUrl = "http://127.0.0.1:4010/healthy";

async function call(path, { method = "GET", key, body, extraHeaders = {} } = {}) {
  const response = await fetch(new URL(path, app), {
    method,
    headers: {
      accept: "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
const prefix = `Showcase${timestamp}`;
const cases = Array.from({ length: 50 }, (_, index) => {
  const mode = index % 5;
  return {
    api_name: `${prefix}API${String(index + 1).padStart(2, "0")}`,
    response_time_ms: mode === 3 ? 1200 : mode === 4 ? 4200 : 5500,
    status_code: mode === 2 ? 404 : mode === 3 ? 200 : mode === 4 ? 429 : mode === 1 ? 503 : 500,
    records_returned: 0,
  };
});

const shared = await call("/monitor", { method: "POST", body: cases });
if (shared.response.status !== 200 || shared.payload.results?.length !== 50) {
  console.log(JSON.stringify({ stage: "shared alerts", status: shared.response.status, result_count: shared.payload.results?.length ?? 0, error_code: shared.payload.error?.code ?? null }));
  process.exit(1);
}
const sharedCreated = shared.payload.results.filter((result) => result.status === "created").length;
const sharedUpdated = shared.payload.results.filter((result) => result.status === "updated").length;
const ids = new Set(shared.payload.results.map((result) => String(result.alert_id)).filter((id) => id !== "null"));
const listed = await call("/alerts?limit=50");
const alerts = (listed.payload.alerts ?? []).filter((alert) => ids.has(String(alert._id)));
const sources = alerts.reduce((counts, alert) => {
  const source = alert.message_source === "model" ? "model" : alert.message_source === "fallback" ? "fallback" : "unknown";
  counts[source] = (counts[source] ?? 0) + 1;
  return counts;
}, {});
console.log(JSON.stringify({ stage: "shared alerts", submitted: 50, created: sharedCreated, updated: sharedUpdated, visible: alerts.length, message_sources: sources }));
if (alerts.length !== 50 || sharedCreated + sharedUpdated !== 50) process.exit(1);

const workspaceResult = await call("/workspaces", {
  method: "POST",
  body: { name: `Synthetic Demo ${timestamp}` },
  extraHeaders: { "x-return-workspace-key": "true" },
});
const workspace = workspaceResult.payload.workspace;
const key = workspaceResult.payload.access_key;
if (workspaceResult.response.status !== 201 || !workspace?.id || !key) {
  console.log(JSON.stringify({ stage: "workspace", status: workspaceResult.response.status, error_code: workspaceResult.payload.error?.code ?? null }));
  process.exit(1);
}

const createdMonitors = [];
for (let index = 1; index <= 30; index += 1) {
  const result = await call(`/workspaces/${workspace.id}/monitors`, {
    method: "POST",
    key,
    body: {
      name: `Synthetic Monitor ${String(index).padStart(2, "0")}`,
      url: mockUrl,
      interval_seconds: 86400,
      timeout_ms: 3000,
      expected_status_code: 200,
      max_response_time_ms: 5000,
      expect_records: false,
    },
  });
  if (result.response.status !== 201 || !result.payload.monitor?._id) {
    for (const monitor of createdMonitors) {
      await call(`/workspaces/${workspace.id}/monitors/${monitor}`, { method: "DELETE", key });
    }
    console.log(JSON.stringify({ stage: "monitor creation", created: createdMonitors.length, status: result.response.status, error_code: result.payload.error?.code ?? null }));
    process.exit(1);
  }
  createdMonitors.push(String(result.payload.monitor._id));
}

let healthyChecks = 0;
for (const monitorId of createdMonitors) {
  const checked = await call(`/workspaces/${workspace.id}/monitors/${monitorId}/check`, { method: "POST", key });
  if (checked.response.status === 200 && checked.payload.result?.status === "healthy") healthyChecks += 1;
}
const accessLink = await call(`/workspaces/${workspace.id}/access-links`, { method: "POST", key });
let browserStarted = false;
if (accessLink.response.status === 201 && typeof accessLink.payload.access_link === "string") {
  const child = spawn("powershell.exe", ["-NoProfile", "-Command", `Start-Process -FilePath '${accessLink.payload.access_link}'`], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  browserStarted = true;
}
console.log(JSON.stringify({ stage: "workspace monitors", created: createdMonitors.length, healthy_checks: healthyChecks, workspace_link_opened_in_browser: browserStarted, workspace_name: workspace.name }));
if (createdMonitors.length !== 30 || healthyChecks !== 30 || !browserStarted) process.exitCode = 1;
