import assert from "node:assert/strict";
import test from "node:test";
import { detectAnomalies, processBatch } from "../../src/services/detector.js";

const sampleChecks = [
  {
    api_name: "PatientDataAPI",
    response_time_ms: 1200,
    status_code: 200,
    records_returned: 50,
  },
  {
    api_name: "AppointmentAPI",
    response_time_ms: 5500,
    status_code: 500,
    records_returned: 0,
  },
];

test("assessment sample: healthy API has no anomaly and failed API is critical", () => {
  const [patient, appointment] = processBatch(sampleChecks);

  assert.deepEqual(patient, {
    api_name: "PatientDataAPI",
    anomaly_types: [],
    severity: "none",
  });
  assert.deepEqual(appointment, {
    api_name: "AppointmentAPI",
    anomaly_types: [
      "http_status_failure_critical",
      "records_returned_anomaly",
      "response_time_critical",
    ],
    severity: "critical",
  });
});

test("slow response with a successful status is a warning", () => {
  assert.deepEqual(detectAnomalies({
    api_name: "SlowAPI",
    response_time_ms: 3001,
    status_code: 200,
    records_returned: 1,
  }), {
    api_name: "SlowAPI",
    anomaly_types: ["response_time_warning"],
    severity: "warning",
  });
});

test("response above 5000 ms with a successful status is critical", () => {
  const result = detectAnomalies({
    api_name: "VerySlowAPI",
    response_time_ms: 5001,
    status_code: 200,
    records_returned: 1,
  });

  assert.deepEqual(result, {
    api_name: "VerySlowAPI",
    anomaly_types: ["response_time_critical"],
    severity: "critical",
  });
});

test("zero returned records is an anomaly", () => {
  const result = detectAnomalies({
    api_name: "EmptyAPI",
    response_time_ms: 100,
    status_code: 200,
    records_returned: 0,
  });

  assert.deepEqual(result.anomaly_types, ["records_returned_anomaly"]);
  assert.equal(result.severity, "warning");
});

test("4xx status is a warning failure", () => {
  const result = detectAnomalies({
    api_name: "ClientErrorAPI",
    response_time_ms: 100,
    status_code: 404,
    records_returned: 1,
  });

  assert.deepEqual(result.anomaly_types, ["http_status_failure_warning"]);
  assert.equal(result.severity, "warning");
});

test("threshold comparisons are strict: 3000 is normal and 5000 is a warning", () => {
  const atWarningBoundary = detectAnomalies({
    api_name: "BoundaryAPI",
    response_time_ms: 3000,
    status_code: 200,
    records_returned: 1,
  });
  const atCriticalBoundary = detectAnomalies({
    api_name: "BoundaryAPI",
    response_time_ms: 5000,
    status_code: 200,
    records_returned: 1,
  });

  assert.equal(atWarningBoundary.severity, "none");
  assert.deepEqual(atWarningBoundary.anomaly_types, []);
  assert.equal(atCriticalBoundary.severity, "warning");
  assert.deepEqual(atCriticalBoundary.anomaly_types, ["response_time_warning"]);
});

test("missing and wrong-typed values become validation anomalies without throwing", () => {
  const missing = detectAnomalies({ api_name: "MissingFieldsAPI" });
  const wrongTypes = detectAnomalies({
    api_name: 42,
    response_time_ms: "slow",
    status_code: "500",
    records_returned: "0",
  });
  const nonObject = detectAnomalies(null);

  assert.ok(missing.anomaly_types.includes("validation_anomaly"));
  assert.ok(missing.anomaly_types.includes("records_returned_anomaly"));
  assert.equal(missing.severity, "warning");
  assert.deepEqual(wrongTypes, {
    api_name: null,
    anomaly_types: ["records_returned_anomaly", "validation_anomaly"],
    severity: "warning",
  });
  assert.deepEqual(nonObject, {
    api_name: null,
    anomaly_types: ["validation_anomaly"],
    severity: "warning",
  });
});

test("an empty batch returns an empty result array", () => {
  assert.deepEqual(processBatch([]), []);
});

test("one malformed item does not stop processing a batch of 100", () => {
  const checks = Array.from({ length: 100 }, (_, index) => ({
    api_name: `API-${index}`,
    response_time_ms: 100,
    status_code: 200,
    records_returned: 1,
  }));
  checks[50] = { api_name: "BrokenAPI", response_time_ms: "bad" };

  const results = processBatch(checks);

  assert.equal(results.length, 100);
  assert.equal(results[49].api_name, "API-49");
  assert.deepEqual(results[50], {
    api_name: "BrokenAPI",
    anomaly_types: ["records_returned_anomaly", "validation_anomaly"],
    severity: "warning",
  });
  assert.deepEqual(results[51], {
    api_name: "API-51",
    anomaly_types: [],
    severity: "none",
  });
});

test("anomaly type sets are sorted deterministically", () => {
  const first = detectAnomalies(sampleChecks[1]);
  const second = detectAnomalies({
    ...sampleChecks[1],
    response_time_ms: 5501,
    records_returned: "0",
  });

  assert.deepEqual(first.anomaly_types, [...first.anomaly_types].sort());
  assert.deepEqual(second.anomaly_types, [...second.anomaly_types].sort());
});
