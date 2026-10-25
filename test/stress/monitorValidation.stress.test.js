import assert from "node:assert/strict";
import test from "node:test";
import { Monitor } from "../../src/models/monitor.js";
import { createMonitorResourceController } from "../../src/controllers/monitorResourceController.js";

const base = { workspace_id: "0123456789abcdef01234567", name: "Monitor", url: "https://api.example.org/health" };
const cases = [
  ["name null", { name: null }, "name"], ["name array", { name: [] }, "name"], ["name blank", { name: " " }, "name"],
  ["name too long", { name: "x".repeat(101) }, "name"], ["url null", { url: null }, "url"], ["url relative", { url: "/health" }, "url"],
  ["url ftp", { url: "ftp://api.example.org" }, "url"], ["url credentials", { url: "https://user:pass@api.example.org" }, "url"],
  ["method post", { method: "POST" }, "method"], ["interval below minimum", { interval_seconds: 59 }, "interval_seconds"],
  ["interval text", { interval_seconds: "sixty" }, "interval_seconds"], ["interval fraction", { interval_seconds: 60.5 }, "interval_seconds"],
  ["interval over maximum", { interval_seconds: 86401 }, "interval_seconds"], ["timeout below minimum", { timeout_ms: 99 }, "timeout_ms"],
  ["timeout text", { timeout_ms: "five seconds" }, "timeout_ms"], ["timeout fraction", { timeout_ms: 1.5 }, "timeout_ms"],
  ["timeout over maximum", { timeout_ms: 30001 }, "timeout_ms"], ["records field array notation", { records_field: "rows[0]" }, "records_field"],
  ["records field prototype", { records_field: "data.__proto__.x" }, "records_field"], ["records field constructor", { records_field: "constructor.prototype" }, "records_field"],
  ["records field too long", { records_field: "a".repeat(129) }, "records_field"], ["expected status below range", { expected_status_code: 99 }, "expected_status_code"],
  ["expected status above range", { expected_status_code: 600 }, "expected_status_code"], ["expected status fraction", { expected_status_code: 200.5 }, "expected_status_code"],
  ["max response zero", { max_response_time_ms: 0 }, "max_response_time_ms"], ["max response above max", { max_response_time_ms: 300001 }, "max_response_time_ms"],
  ["expect records invalid boolean", { expect_records: "maybe" }, "expect_records"], ["paused invalid boolean", { paused: "maybe" }, "paused"],
  ["unsafe records path prototype", { records_field: "data.prototype.value" }, "records_field"],
  ["unsafe records path constructor nested", { records_field: "data.constructor.name" }, "records_field"],
];
for (let index = 0; cases.length < 50; index += 1) {
  const ranges = [{ interval_seconds: 60 - index - 1 }, { timeout_ms: 30_001 + index },
    { max_response_time_ms: 300_001 + index }, { expected_status_code: 600 + index }];
  const [patch, field] = Object.entries(ranges[index % ranges.length])[0] ? [ranges[index % ranges.length], Object.keys(ranges[index % ranges.length])[0]] : [{}, "name"];
  cases.push([`range edge ${index + 1}`, patch, field]);
}
for (const [name, patch, field] of cases) {
  test(`stress monitor schema: ${name}`, async () => {
    const monitor = new Monitor({ ...base, ...patch });
    await assert.rejects(monitor.validate(), (error) => Boolean(error?.errors?.[field]));
  });
}

test("stress monitor schema: baseline valid definition has exact default values", () => {
  const monitor = new Monitor(base);
  assert.equal(monitor.method, "GET");
  assert.equal(monitor.interval_seconds, 300);
  assert.equal(monitor.timeout_ms, 5000);
  assert.equal(monitor.expected_status_code, 200);
  assert.equal(monitor.max_response_time_ms, 3000);
  assert.equal(monitor.expect_records, false);
  assert.equal(monitor.paused, false);
});

const apiCases = Array.from({ length: 50 }, (_, index) => {
  const field = ["name", "url", "method", "interval_seconds", "timeout_ms", "records_field", "expected_status_code",
    "max_response_time_ms", "expect_records", "paused"][index % 10];
  const invalidValues = {
    name: ["", " ", "x".repeat(101), 9, null], url: ["", "relative/path", "ftp://host.test", "https://u:p@host.test", "x".repeat(2049)],
    method: ["POST", "TRACE", "DELETE", null, 2], interval_seconds: [59, 86401, 60.5, "60", null],
    timeout_ms: [99, 30001, 100.5, "100", null], records_field: ["a[0]", "__proto__.x", "a.constructor", "x".repeat(129), 2],
    expected_status_code: [99, 600, 200.5, "200", null], max_response_time_ms: [0, 300001, 1.5, "3000", null],
    expect_records: ["yes", 1, null, {}, []], paused: ["no", 1, null, {}, []],
  };
  return { name: `API rejects invalid ${field} variant ${index + 1}`, input: { ...base, [field]: invalidValues[field][Math.floor(index / 10)] }, expected: { status: 400, code: "INVALID_MONITOR" } };
});
for (const entry of apiCases) {
  test(`stress monitor API validation: ${entry.name}`, async () => {
    let persisted = false;
    let responseStatus;
    let responseBody;
    let caught;
    const controller = createMonitorResourceController({
      monitorRepository: { async create() { persisted = true; } },
      validatePublicUrl: async (url) => url,
      checkHistoryService: {}, monitorCheckService: {},
    });
    const response = { status(code) { responseStatus = code; return this; }, json(body) { responseBody = body; return this; } };
    await controller.create({ body: entry.input, workspaceId: "workspace-id" }, response, (error) => { caught = error; });
    assert.equal(caught.statusCode, entry.expected.status);
    assert.equal(caught.code, entry.expected.code);
    assert.equal(persisted, false);
    assert.equal(responseStatus, undefined);
    assert.equal(responseBody, undefined);
  });
}
