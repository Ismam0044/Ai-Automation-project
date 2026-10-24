import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const samplePath = new URL("../../sample-data/api-responses.json", import.meta.url);

function safeBaseUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new TypeError("LIVE_BASE_URL must be an HTTP(S) URL without credentials.");
  }
  return parsed.origin;
}

export function createJsonClient(fetchImpl, baseUrl = "http://localhost:3000") {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const origin = safeBaseUrl(baseUrl);

  return async function requestJson(route, { method = "GET", body } = {}) {
    if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) {
      throw new TypeError("Route must be a same-origin absolute path.");
    }
    const response = await fetchImpl(new URL(route, origin), {
      method,
      headers: body === undefined ? { accept: "application/json" } : {
        accept: "application/json",
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // The verifier reports only status and safe summary facts, never response text.
    }
    return { status: response.status, ok: response.ok, payload };
  };
}

function addResult(results, name, passed, evidence) {
  results.push({ name, status: passed ? "Pass" : "Fail", evidence });
}

function rowFailure(results, name, error) {
  const status = Number.isInteger(error?.status) ? `HTTP ${error.status}` : "request or response error";
  addResult(results, name, false, status);
}

export async function runLiveVerification({
  fetchImpl = globalThis.fetch,
  baseUrl = process.env.LIVE_BASE_URL ?? "http://localhost:3000",
  sample,
} = {}) {
  const checks = sample ?? JSON.parse(await readFile(samplePath, "utf8"));
  const requestJson = createJsonClient(fetchImpl, baseUrl);
  const rows = [];
  let messageSource = "unavailable";
  let alertId = null;
  let baselineOccurrence = null;
  let secondOccurrence = null;

  let firstSummary;
  try {
    const response = await requestJson("/monitor", { method: "POST", body: checks });
    if (!response.ok) throw Object.assign(new Error(), { status: response.status });
    firstSummary = response.payload;
    const patient = firstSummary?.results?.find((item) => item.api_name === "PatientDataAPI");
    const appointment = firstSummary?.results?.find((item) => item.api_name === "AppointmentAPI");
    alertId = appointment?.alert_id ?? null;
    const passed = firstSummary?.total_items === 2
      && firstSummary?.healthy_count === 1
      && firstSummary?.failed_items === 0
      && patient?.status === "healthy"
      && patient?.severity === "none"
      && patient?.alert_id === null
      && ["created", "updated"].includes(appointment?.status)
      && appointment?.severity === "critical"
      && typeof alertId === "string";
    addResult(rows, "section 5 sample", passed, passed
      ? "2 checks; PatientDataAPI healthy; AppointmentAPI critical"
      : "sample summary did not match expected health and critical anomaly");
  } catch (error) {
    rowFailure(rows, "section 5 sample", error);
  }

  try {
    if (!alertId) throw new Error("sample did not return an alert id");
    const before = await requestJson("/alerts");
    if (!before.ok || !Array.isArray(before.payload?.alerts)) throw Object.assign(new Error(), { status: before.status });
    const activeBefore = before.payload.alerts.filter((alert) => String(alert._id) === alertId && alert.status === "active");
    const item = activeBefore[0];
    const patientAlerts = before.payload.alerts.filter((alert) => alert.api_name === "PatientDataAPI");
    if (!item || activeBefore.length !== 1 || patientAlerts.length !== 0) {
      throw new Error("active alert list did not contain the expected unique alert");
    }
    baselineOccurrence = Number(item.occurrence_count);
    messageSource = item.message_source === "model" || item.message_source === "fallback"
      ? item.message_source
      : "unknown";

    const repeat = await requestJson("/monitor", { method: "POST", body: checks });
    if (!repeat.ok) throw Object.assign(new Error(), { status: repeat.status });
    const repeatedAppointment = repeat.payload?.results?.find((result) => result.api_name === "AppointmentAPI");
    const after = await requestJson("/alerts");
    if (!after.ok || !Array.isArray(after.payload?.alerts)) throw Object.assign(new Error(), { status: after.status });
    const matching = after.payload.alerts.filter((alert) => String(alert._id) === alertId && alert.status === "active");
    secondOccurrence = Number(matching[0]?.occurrence_count);
    const passed = repeatedAppointment?.status === "updated"
      && matching.length === 1
      && secondOccurrence === baselineOccurrence + 1;
    addResult(rows, "duplicate submission", passed, passed
      ? `one active alert; occurrence_count ${baselineOccurrence} to ${secondOccurrence}`
      : "repeat did not increment the single active alert exactly once");
  } catch (error) {
    rowFailure(rows, "duplicate submission", error);
  }

  try {
    const response = await requestJson("/monitor", { method: "POST", body: { api_name: "not-an-array" } });
    const passed = response.status === 400 && response.payload?.error?.code === "INVALID_BATCH";
    addResult(rows, "non-array request", passed, passed ? "HTTP 400 INVALID_BATCH" : `HTTP ${response.status}`);
  } catch (error) {
    rowFailure(rows, "non-array request", error);
  }

  try {
    if (!alertId) throw new Error("sample did not return an alert id");
    const resolved = await requestJson(`/alerts/${encodeURIComponent(alertId)}/resolve`, { method: "PATCH", body: {} });
    if (!resolved.ok || resolved.payload?.alert?.status !== "resolved") {
      throw Object.assign(new Error(), { status: resolved.status });
    }
    const active = await requestJson("/alerts");
    const absent = active.ok && Array.isArray(active.payload?.alerts)
      && !active.payload.alerts.some((alert) => String(alert._id) === alertId);
    addResult(rows, "resolve and active alerts", absent, absent
      ? "resolved alert is absent from default GET /alerts"
      : `HTTP ${active.status}; resolved alert still present or response invalid`);
  } catch (error) {
    rowFailure(rows, "resolve and active alerts", error);
  }

  return { rows, messageSource };
}

function printTable({ rows, messageSource }) {
  const nameWidth = Math.max(22, ...rows.map((row) => row.name.length));
  console.log(`${"CHECK".padEnd(nameWidth)}  RESULT  EVIDENCE`);
  for (const row of rows) console.log(`${row.name.padEnd(nameWidth)}  ${row.status.padEnd(6)}  ${row.evidence}`);
  console.log(`INFO   message_source=${messageSource}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // This module is also imported by tests; the CLI path is invoked by npm run verify:live.
  const result = await runLiveVerification();
  printTable(result);
  if (result.rows.some((row) => row.status !== "Pass")) process.exitCode = 1;
}
