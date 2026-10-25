import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const APP_BASE_URL = "http://127.0.0.1:3000";
const MOCK_BASE_URL = "http://127.0.0.1:4010";
const PROOF_PATH = new URL("../../PROOF.md", import.meta.url);
const SAMPLE_PATH = new URL("../../sample-data/api-responses.json", import.meta.url);
const SAMPLE_TYPES = ["http_status_failure_critical", "records_returned_anomaly", "response_time_critical"];
const PRIVATE_TARGET_FIX = "$env:ALLOW_PRIVATE_TARGETS='true'; npm.cmd run dev";

function isLoopbackBase(value) {
  const parsed = new URL(value);
  return ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
}

function safeText(value) {
  return String(value ?? "").replace(/\r|\n|\t/g, " ")
    .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "[redacted connection string]")
    .replace(/\b(?:AQ\.[A-Za-z0-9._-]+|AIza[A-Za-z0-9_-]{20,}|ya29\.[A-Za-z0-9._-]+)\b/g, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(token|access_key|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 150);
}

export function createProofClient(fetchImpl, baseUrl = APP_BASE_URL) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  if (!isLoopbackBase(baseUrl)) throw new TypeError("Proof verification only allows loopback URLs.");
  const origin = new URL(baseUrl).origin;
  return async function request(route, { method = "GET", body, headers = {} } = {}) {
    if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) {
      throw new TypeError("Route must be same-origin.");
    }
    const response = await fetchImpl(new URL(route, origin), {
      method,
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
    });
    let payload = null;
    try { payload = await response.json(); } catch { /* The proof stores only status and selected fields. */ }
    return { status: response.status, ok: response.ok, payload };
  };
}

export function renderProofTable(rows) {
  const lines = ["| Scenario | Result | Evidence |", "|---|---|---|"];
  for (const row of rows) {
    const name = safeText(row.name).replaceAll("|", "\\|");
    const evidence = safeText(row.evidence).replaceAll("|", "\\|");
    lines.push(`| ${name} | ${row.status} | ${evidence} |`);
  }
  return lines.join("\n");
}

export function makeProofDocument({ timestamp, rows, cleanup }) {
  return `# Local application proof\n\nTimestamp (UTC): ${timestamp}\n\n${renderProofTable(rows)}\n\nCleanup: ${safeText(cleanup)}\n`;
}

function matchesTypes(alert, types) {
  return Array.isArray(alert?.anomaly_types)
    && JSON.stringify([...alert.anomaly_types].sort()) === JSON.stringify([...types].sort());
}

export async function runProof({
  fetchImpl = globalThis.fetch,
  appBaseUrl = APP_BASE_URL,
  mockBaseUrl = MOCK_BASE_URL,
  sample,
  timestamp = new Date().toISOString(),
  writeDocument = async (document) => writeFile(PROOF_PATH, document, "utf8"),
} = {}) {
  const request = createProofClient(fetchImpl, appBaseUrl);
  const rows = [];
  const add = (name, status, evidence) => rows.push({ name, status, evidence: safeText(evidence) });
  let workspace = null;
  let monitorId = null;
  let sharedAlertId = null;
  let sharedAlertCreated = false;
  let mockResponded = false;
  let privateTargets = "unknown";
  let cleanupMessage = "No workspace or monitor was created.";
  let serverReachable = false;
  let proofWritten = false;
  let result;

  try {
    let health;
    try {
      health = await request("/health");
      serverReachable = true;
    } catch {
      add("server reachable", "Fail", "No response from 127.0.0.1:3000; start the local app with npm.cmd run dev.");
      result = { timestamp, rows, cleanup: cleanupMessage, serverReachable, get proofWritten() { return proofWritten; } };
      return result;
    }
    privateTargets = health.payload?.private_targets ?? "unknown";
    const healthPass = health.status === 200 && health.payload?.status === "ok"
      && health.payload?.database === "connected" && ["enabled", "disabled"].includes(privateTargets);
    add("health and private_targets", healthPass ? "Pass" : "Fail",
      `HTTP ${health.status}; database=${health.payload?.database ?? "unknown"}; private_targets=${privateTargets}`);
    if (!healthPass) {
      add("live proof flow", "Skipped", "Local server responded, but GET /health is not ready.");
      result = { timestamp, rows, cleanup: cleanupMessage, serverReachable, get proofWritten() { return proofWritten; } };
      return result;
    }

    const checks = sample ?? JSON.parse(await readFile(SAMPLE_PATH, "utf8"));
    const existingResponse = await request("/alerts");
    const activeBefore = Array.isArray(existingResponse.payload?.alerts) ? existingResponse.payload.alerts : [];
    const priorSampleAlert = activeBefore.find((alert) => alert.api_name === "AppointmentAPI" && matchesTypes(alert, SAMPLE_TYPES));
    const baselineOccurrence = Number(priorSampleAlert?.occurrence_count ?? 0);
    if (existingResponse.status !== 200 || !Array.isArray(existingResponse.payload?.alerts)) {
      add("sample submitted twice", "Fail", `GET /alerts returned HTTP ${existingResponse.status}.`);
    } else if (priorSampleAlert) {
      add("sample submitted twice", "Skipped", "An active matching shared alert already exists; preserving it to avoid changing prior data.");
    } else {
      const first = await request("/monitor", { method: "POST", body: checks });
      const firstItem = first.payload?.results?.find((item) => item.api_name === "AppointmentAPI");
      const patient = first.payload?.results?.find((item) => item.api_name === "PatientDataAPI");
      const firstPass = first.status === 200 && first.payload?.total_items === 2 && first.payload?.healthy_count === 1
        && first.payload?.failed_items === 0 && patient?.status === "healthy" && patient.alert_id === null
        && firstItem?.status === "created" && firstItem?.severity === "critical" && typeof firstItem.alert_id === "string";
      if (firstPass) {
        sharedAlertId = firstItem.alert_id;
        sharedAlertCreated = true;
      }
      const firstAlerts = firstPass ? await request("/alerts") : null;
      const firstActive = firstAlerts?.payload?.alerts?.filter((alert) => String(alert._id) === sharedAlertId && alert.status === "active") ?? [];
      const firstCount = Number(firstActive[0]?.occurrence_count);
      const firstCountPass = firstAlerts?.status === 200 && firstActive.length === 1 && firstCount === baselineOccurrence + 1;

      const second = firstPass ? await request("/monitor", { method: "POST", body: checks }) : null;
      const secondItem = second?.payload?.results?.find((item) => item.api_name === "AppointmentAPI");
      const secondAlerts = second?.status === 200 ? await request("/alerts") : null;
      const secondActive = secondAlerts?.payload?.alerts?.filter((alert) => String(alert._id) === sharedAlertId && alert.status === "active") ?? [];
      const secondCount = Number(secondActive[0]?.occurrence_count);
      const oneAlert = secondActive.length === 1;
      const pass = firstPass && firstCountPass && second?.status === 200
        && secondItem?.status === "updated" && secondItem.alert_id === sharedAlertId
        && secondActive.length === 1 && secondCount === baselineOccurrence + 2;
      add("sample created then updated; one alert; occurrence rose", pass ? "Pass" : "Fail",
        pass ? `created then updated; one alert; occurrence_count ${firstCount} to ${secondCount}`
          : `first HTTP ${first.status}; second HTTP ${second?.status ?? "not sent"}; one matching active alert=${oneAlert}`);
      const source = secondActive[0]?.message_source;
      const sourcePass = ["model", "fallback"].includes(source);
      add("sample alert message_source", sourcePass ? "Pass" : "Fail", `message_source=${sourcePass ? source : "missing or invalid"}`);
    }

    const mockHealth = await fetchImpl(new URL("/healthy", mockBaseUrl), { redirect: "manual" }).catch(() => null);
    mockResponded = mockHealth?.status === 200;
    const workspaceResponse = await request("/workspaces", {
      method: "POST", body: { name: `Local proof ${timestamp}` }, headers: { "x-return-workspace-key": "true" },
    }).catch(() => null);
    const accessKey = workspaceResponse?.payload?.access_key;
    if (workspaceResponse?.status === 201 && typeof accessKey === "string" && workspaceResponse.payload?.workspace?.id) {
      workspace = { id: workspaceResponse.payload.workspace.id, key: accessKey };
      cleanupMessage = "Workspace remains (no delete route); no monitor created yet.";
    }

    if (!workspace) {
      add("workspace monitor failure and recovery", "Fail", `Workspace creation returned HTTP ${workspaceResponse?.status ?? "no response"}.`);
      for (const name of ["monitor alert message_source", "automatic recovery", "unsafe monitor URL rejections", "400 responses"]) {
        add(name, "Skipped", "Workspace authentication was unavailable.");
      }
    } else {
      const auth = { authorization: `Bearer ${workspace.key}` };
      if (!mockResponded) {
        add("workspace monitor failure and recovery", "Skipped", "Mock not responding; start with node scripts/demo/mock-apis.js.");
        add("monitor alert message_source", "Skipped", "Mock-dependent monitor check was skipped.");
      } else if (privateTargets !== "enabled") {
        add("workspace monitor failure and recovery", "Skipped", `private_targets=${privateTargets}; fix: ${PRIVATE_TARGET_FIX}`);
        add("monitor alert message_source", "Skipped", "Mock-dependent monitor check was skipped.");
      } else {
        const controlFail = await fetchImpl(new URL("/control", mockBaseUrl), {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: "failing", mode: "failing" }), redirect: "manual",
        }).catch(() => null);
        const controlPass = controlFail?.status === 200;
        const monitorResponse = controlPass ? await request(`/workspaces/${workspace.id}/monitors`, {
          method: "POST", headers: auth, body: {
            name: `Proof monitor ${timestamp}`, url: `${mockBaseUrl}/failing`, interval_seconds: 60,
            timeout_ms: 3000, expected_status_code: 200, max_response_time_ms: 5000, expect_records: false,
          },
        }).catch(() => null) : null;
        if (monitorResponse?.status === 201 && monitorResponse.payload?.monitor?._id) {
          monitorId = String(monitorResponse.payload.monitor._id);
          cleanupMessage = "Monitor cleanup pending; workspace remains (no delete route).";
          const checkPath = `/workspaces/${workspace.id}/monitors/${monitorId}`;
          const failedCheck = await request(`${checkPath}/check`, { method: "POST", headers: auth }).catch(() => null);
          const failed = failedCheck?.payload?.result?.outcome !== "ok"
            ? failedCheck?.payload?.result?.status === "created"
            : failedCheck?.payload?.result?.check?.status_code === 500;
          const failedHistory = await request(`${checkPath}/checks`, { headers: auth }).catch(() => null);
          const activeAlerts = await request("/alerts", { headers: auth }).catch(() => null);
          const monitorAlert = activeAlerts?.payload?.alerts?.find((alert) => String(alert.monitor_id) === monitorId && alert.status === "active");
          const firstPass = failedCheck?.status === 200 && failed && failedHistory?.status === 200
            && failedHistory.payload?.pagination?.total >= 1 && Boolean(monitorAlert);
          add("workspace monitor failure and history", firstPass ? "Pass" : "Fail",
            `check HTTP ${failedCheck?.status ?? "no response"}; history rows=${failedHistory?.payload?.pagination?.total ?? 0}; active alert=${Boolean(monitorAlert)}`);
          const sourcePass = ["model", "fallback"].includes(monitorAlert?.message_source);
          add("monitor alert message_source", sourcePass ? "Pass" : "Fail",
            `message_source=${sourcePass ? monitorAlert.message_source : "missing or invalid"}`);

          const controlHealthy = await fetchImpl(new URL("/control", mockBaseUrl), {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: "failing", mode: "healthy" }), redirect: "manual",
          }).catch(() => null);
          const recoveryChecks = [];
          if (controlHealthy?.status === 200) {
            recoveryChecks.push(await request(`${checkPath}/check`, { method: "POST", headers: auth }).catch(() => null));
            recoveryChecks.push(await request(`${checkPath}/check`, { method: "POST", headers: auth }).catch(() => null));
          }
          const activeAfter = await request("/alerts", { headers: auth }).catch(() => null);
          const resolvedAfter = await request("/alerts?status=resolved", { headers: auth }).catch(() => null);
          const resolvedAlert = resolvedAfter?.payload?.alerts?.find((alert) => String(alert.monitor_id) === monitorId && alert.status === "resolved");
          const recoveryPass = controlHealthy?.status === 200 && recoveryChecks.length === 2
            && recoveryChecks.every((response) => response?.status === 200 && response.payload?.result?.status === "healthy")
            && !activeAfter?.payload?.alerts?.some((alert) => String(alert.monitor_id) === monitorId)
            && Boolean(resolvedAlert);
          add("automatic recovery after two healthy checks", recoveryPass ? "Pass" : "Fail",
            recoveryPass ? "2 healthy checks; alert resolved and absent from active list"
              : `healthy checks=${recoveryChecks.filter((response) => response?.payload?.result?.status === "healthy").length}; resolved=${Boolean(resolvedAlert)}`);
        } else {
          const createStatus = monitorResponse?.status ?? "no response";
          const skipped = createStatus === 400 && privateTargets !== "enabled";
          add("workspace monitor failure and history", skipped ? "Skipped" : "Fail",
            `monitor create HTTP ${createStatus}; ${skipped ? `fix: ${PRIVATE_TARGET_FIX}` : "expected HTTP 201"}`);
          add("monitor alert message_source", "Skipped", "Monitor creation did not succeed.");
          add("automatic recovery after two healthy checks", "Skipped", "Monitor creation did not succeed.");
        }
      }

      const unsafeCases = [
        ["cloud metadata address", "http://169.254.169.254/"],
        ["private IPv4 address", "http://10.0.0.1/"],
        ["credentialed URL", "https://user:pass@example.com/"],
        ["FTP scheme", "ftp://example.com/"],
        ["file scheme", "file:///etc/passwd"],
        ["malformed URL", "not a URL"],
        ["oversized URL", `https://example.com/${"x".repeat(2050)}`],
      ];
      for (const [name, url] of unsafeCases) {
        const response = await request(`/workspaces/${workspace.id}/monitors`, {
          method: "POST", headers: auth, body: { name: `Rejected ${name}`, url },
        }).catch(() => null);
        const safeError = response?.payload?.error?.code === "INVALID_MONITOR"
          && typeof response.payload.error.message === "string"
          && !/stack|mongodb:\/\/|user:pass|169\.254|10\.0\.0\.1/i.test(response.payload.error.message);
        add(`unsafe URL rejected: ${name}`, response?.status === 400 && safeError ? "Pass" : "Fail",
          `HTTP ${response?.status ?? "no response"}; standard INVALID_MONITOR error=${safeError}`);
      }

      const nonArray = await request("/monitor", { method: "POST", body: { invalid: true } }).catch(() => null);
      add("400 non-array POST /monitor", nonArray?.status === 400 && nonArray.payload?.error?.code === "INVALID_BATCH" ? "Pass" : "Fail",
        `HTTP ${nonArray?.status ?? "no response"}; INVALID_BATCH=${nonArray?.payload?.error?.code === "INVALID_BATCH"}`);
      const invalidFields = await request(`/workspaces/${workspace.id}/monitors`, {
        method: "POST", headers: auth, body: { name: "Bad interval", url: "https://example.com/", interval_seconds: 59 },
      }).catch(() => null);
      add("400 invalid monitor schema", invalidFields?.status === 400 && invalidFields.payload?.error?.code === "INVALID_MONITOR" ? "Pass" : "Fail",
        `HTTP ${invalidFields?.status ?? "no response"}; INVALID_MONITOR=${invalidFields?.payload?.error?.code === "INVALID_MONITOR"}`);
    }
  } catch (error) {
    add("proof runner", "Fail", error instanceof SyntaxError ? "Sample JSON could not be read." : "A local proof step failed unexpectedly.");
  } finally {
    if (monitorId && workspace) {
      const deleted = await request(`/workspaces/${workspace.id}/monitors/${monitorId}`, {
        method: "DELETE", headers: { authorization: `Bearer ${workspace.key}` },
      }).catch(() => null);
      cleanupMessage = deleted?.status === 200 && deleted.payload?.deleted === true
        ? "Created monitor deleted; workspace remains because no workspace-delete route exists."
        : "Workspace remains; monitor cleanup did not confirm deletion.";
    }
    if (workspace && mockResponded) {
      await fetchImpl(new URL("/control", mockBaseUrl), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: "failing", mode: "healthy" }), redirect: "manual",
      }).catch(() => null);
    }
    if (sharedAlertCreated && sharedAlertId) {
      const resolved = await request(`/alerts/${encodeURIComponent(sharedAlertId)}/resolve`, { method: "PATCH" }).catch(() => null);
      cleanupMessage += resolved?.payload?.alert?.status === "resolved" ? " Created shared sample alert resolved." : " Shared sample alert cleanup not confirmed.";
    }
    const document = makeProofDocument({ timestamp, rows, cleanup: cleanupMessage });
    try {
      await writeDocument(document);
      proofWritten = true;
    } catch {
      proofWritten = false;
    }
  }
    result = { timestamp, rows, cleanup: cleanupMessage, serverReachable, get proofWritten() { return proofWritten; } };
    return result;
}

export function printProof({ timestamp, rows, cleanup, proofWritten = true }) {
  console.log(`Local proof timestamp (UTC): ${timestamp}`);
  console.log("SCENARIO                                      RESULT   EVIDENCE");
  for (const row of rows) console.log(`${row.name.padEnd(46)} ${row.status.padEnd(8)} ${safeText(row.evidence)}`);
  console.log(`Cleanup: ${safeText(cleanup)}`);
  console.log(`Proof file: ${proofWritten ? "PROOF.md" : "write failed"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runProof();
  printProof(result);
  if (!result.serverReachable || !result.proofWritten || result.rows.some((row) => row.status === "Fail")) process.exitCode = 1;
}
