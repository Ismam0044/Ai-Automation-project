import test from "node:test";
import assert from "node:assert/strict";
import { createJsonClient, runLiveVerification } from "../../scripts/verify/live.js";

const sample = [
  { api_name: "PatientDataAPI", response_time_ms: 1200, status_code: 200, records_returned: 50 },
  { api_name: "AppointmentAPI", response_time_ms: 5500, status_code: 500, records_returned: 0 },
];

test("live verifier JSON helper sends same-origin JSON and parses only the response object", async () => {
  const calls = [];
  const request = createJsonClient(async (url, options) => {
    calls.push({ url: String(url), options });
    return { status: 200, ok: true, async json() { return { safe: true }; } };
  }, "http://localhost:3000");

  const result = await request("/monitor", { method: "POST", body: sample });
  assert.equal(calls[0].url, "http://localhost:3000/monitor");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.equal(calls[0].options.body, JSON.stringify(sample));
  assert.deepEqual(result, { status: 200, ok: true, payload: { safe: true } });
});

test("live verifier runs sample, duplicate, invalid-body, and resolve checks with mocked fetch", async () => {
  let occurrenceCount = 0;
  let active = false;
  const alertId = "0123456789abcdef01234567";
  const mockedFetch = async (url, options) => {
    const route = new URL(url).pathname;
    if (route === "/monitor" && options.method === "POST") {
      const body = JSON.parse(options.body);
      if (!Array.isArray(body)) {
        return { status: 400, ok: false, async json() { return { error: { code: "INVALID_BATCH" } }; } };
      }
      occurrenceCount += 1;
      active = true;
      return {
        status: 200,
        ok: true,
        async json() {
          return {
            total_items: 2,
            healthy_count: 1,
            anomalies_created: occurrenceCount === 1 ? 1 : 0,
            anomalies_updated: occurrenceCount === 1 ? 0 : 1,
            failed_items: 0,
            results: [
              { api_name: "PatientDataAPI", status: "healthy", severity: "none", alert_id: null },
              { api_name: "AppointmentAPI", status: occurrenceCount === 1 ? "created" : "updated", severity: "critical", alert_id: alertId },
            ],
          };
        },
      };
    }
    if (route === "/alerts" && options.method === "GET") {
      return {
        status: 200,
        ok: true,
        async json() {
          return { alerts: active ? [{ _id: alertId, api_name: "AppointmentAPI", status: "active", occurrence_count: occurrenceCount, message_source: "fallback" }] : [] };
        },
      };
    }
    if (route === `/alerts/${alertId}/resolve` && options.method === "PATCH") {
      active = false;
      return { status: 200, ok: true, async json() { return { alert: { status: "resolved" } }; } };
    }
    throw new Error("Unexpected mocked request");
  };

  const result = await runLiveVerification({ fetchImpl: mockedFetch, baseUrl: "http://localhost:3000", sample });
  assert.deepEqual(result.rows.map((row) => row.status), ["Pass", "Pass", "Pass", "Pass"]);
  assert.equal(result.messageSource, "fallback");
  assert.equal(occurrenceCount, 2);
});

test("live verifier refuses credentialed base URLs and cross-origin routes", async () => {
  assert.throws(() => createJsonClient(async () => {}, "http://user:fake-secret@localhost:3000"), /without credentials/);
  const request = createJsonClient(async () => { throw new Error("should not be called"); });
  await assert.rejects(request("//example.org/monitor"), /same-origin/);
});
