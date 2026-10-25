import assert from "node:assert/strict";
import test from "node:test";
import { detectAnomalies } from "../../src/services/detector.js";

const base = { api_name: "CaseAPI", response_time_ms: 100, status_code: 200, records_returned: 1 };
const cases = [];
const add = (name, input, anomalyTypes = [], severity = "none") => cases.push({
  name, input, expected: { api_name: typeof input?.api_name === "string" && input.api_name.trim() ? input.api_name : null,
    anomaly_types: [...anomalyTypes].sort(), severity },
});

for (const [ms, types, severity] of [
  [2999, [], "none"], [3000, [], "none"], [3001, ["response_time_warning"], "warning"],
  [4999, ["response_time_warning"], "warning"], [5000, ["response_time_warning"], "warning"],
  [5001, ["response_time_critical"], "critical"],
]) add(`latency boundary ${ms}ms`, { ...base, response_time_ms: ms }, types, severity);

for (const [status, types, severity] of [
  [100, ["http_status_failure_warning"], "warning"], [199, ["http_status_failure_warning"], "warning"],
  [200, [], "none"], [299, [], "none"], [300, ["http_status_failure_warning"], "warning"],
  [399, ["http_status_failure_warning"], "warning"], [400, ["http_status_failure_warning"], "warning"],
  [499, ["http_status_failure_warning"], "warning"], [500, ["http_status_failure_critical"], "critical"],
  [599, ["http_status_failure_critical"], "critical"],
]) add(`HTTP status ${status}`, { ...base, status_code: status }, types, severity);

for (const [records, types] of [
  [0, ["records_returned_anomaly"]], [1, []], [null, ["records_returned_anomaly", "validation_anomaly"]],
  [Number.NaN, ["records_returned_anomaly", "validation_anomaly"]], [-1, ["records_returned_anomaly", "validation_anomaly"]],
  [0.5, ["records_returned_anomaly", "validation_anomaly"]], ["0", ["records_returned_anomaly", "validation_anomaly"]],
  ["many", ["records_returned_anomaly", "validation_anomaly"]],
]) add(`record count ${String(records)}`, { ...base, records_returned: records }, types, types.length ? "warning" : "none");

add("missing records field", { api_name: "MissingRecords", response_time_ms: 100, status_code: 200 }, ["records_returned_anomaly", "validation_anomaly"], "warning");
add("combined critical status latency and records", { ...base, status_code: 503, response_time_ms: 5501, records_returned: 0 }, ["http_status_failure_critical", "records_returned_anomaly", "response_time_critical"], "critical");
add("combined warning status and records", { ...base, status_code: 404, records_returned: 0 }, ["http_status_failure_warning", "records_returned_anomaly"], "warning");
add("wrong API name type", { ...base, api_name: 42 }, ["validation_anomaly"], "warning");
add("blank API name", { ...base, api_name: "  " }, ["validation_anomaly"], "warning");
add("wrong response time type", { ...base, response_time_ms: "100" }, ["validation_anomaly"], "warning");
add("negative response time", { ...base, response_time_ms: -1 }, ["validation_anomaly"], "warning");
add("infinite response time", { ...base, response_time_ms: Infinity }, ["validation_anomaly"], "warning");
add("wrong status type", { ...base, status_code: "200" }, ["validation_anomaly"], "warning");
add("fractional status", { ...base, status_code: 200.5 }, ["validation_anomaly"], "warning");
add("zero status", { ...base, status_code: 0 }, ["http_status_failure_warning", "validation_anomaly"], "warning");
add("negative status", { ...base, status_code: -1 }, ["http_status_failure_warning", "validation_anomaly"], "warning");
add("status above range", { ...base, status_code: 600 }, ["http_status_failure_warning", "validation_anomaly"], "warning");
add("missing API name", { response_time_ms: 100, status_code: 200, records_returned: 1 }, ["validation_anomaly"], "warning");
add("missing response time", { api_name: "MissingLatency", status_code: 200, records_returned: 1 }, ["validation_anomaly"], "warning");
add("missing status", { api_name: "MissingStatus", response_time_ms: 100, records_returned: 1 }, ["validation_anomaly"], "warning");

for (let index = 0; cases.length < 50; index += 1) {
  const responseTime = 100 + index;
  add(`distinct healthy numeric input ${index + 1}`, {
    api_name: `Healthy${index + 1}`, response_time_ms: responseTime, status_code: 200, records_returned: index + 1,
  });
}

for (const entry of cases) {
  test(`stress detector: ${entry.name}`, () => {
    assert.deepEqual(detectAnomalies(entry.input), entry.expected);
  });
}
