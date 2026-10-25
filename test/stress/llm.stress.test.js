import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackMessage, cleanModelOutput, createLlmService } from "../../src/services/llmService.js";

const kinds = [
  ["http_status_failure_warning", "failed with status 400"],
  ["records_returned_anomaly", "returned 0 records"],
  ["response_time_warning", "responded slowly (3001 ms)"],
  ["validation_anomaly", "sent invalid data"],
  ["invalid_json", "reported an anomaly"],
  ["response_too_large", "reported an anomaly"],
];
const cases = Array.from({ length: 50 }, (_, index) => {
  const [type, phrase] = kinds[index % kinds.length];
  const apiName = `Synthetic API ${index + 1}`;
  const fact = { api_name: apiName, status_code: type.startsWith("http_status") ? 400 : 200,
    response_time_ms: type.startsWith("response_time") ? 3001 : 100,
    records_returned: type.startsWith("records") ? 0 : 1, anomaly_types: [type] };
  return { name: `${type} fallback case ${index + 1}`, input: fact,
    expected: `${apiName} ${phrase}. Possible outage or data issue.` };
});

for (const entry of cases) {
  test(`stress LLM fallback: ${entry.name}`, () => {
    assert.equal(buildFallbackMessage(entry.input), entry.expected);
  });
}

const cleanerCases = [
  ["bold", "**hello**", "hello"], ["italic", "_hello_", "hello"], ["strike", "~~hello~~", "hello"],
  ["heading", "## hello", "hello"], ["bullet dash", "- hello", "hello"], ["bullet star", "* hello", "hello"],
  ["ordered list", "1. hello", "hello"], ["blockquote", "> hello", "hello"], ["code fence", "```text\nhello\n```", "hello"],
  ["link", "[hello](https://example.invalid)", "hello"], ["emoji", "hello ✅", "hello"],
  ["whitespace", "  hello   there  ", "hello there"], ["control char", "hello\nthere", "hello there"],
];
for (const [name, input, expected] of cleanerCases) {
  test(`stress LLM output cleaning: ${name}`, () => assert.equal(cleanModelOutput(input), expected));
}

const modelCases = Array.from({ length: 50 }, (_, index) => {
  const mode = index % 4;
  const apiName = `Operations ${index + 1}`;
  const check = { api_name: apiName, status_code: 503, response_time_ms: index + 1, records_returned: index,
    private_extra: "synthetic-secret-must-not-be-prompted" };
  const detection = { anomaly_types: ["synthetic_anomaly"], severity: "critical" };
  return { name: `${["success", "retry then success", "two failures", "daily cap"][mode]} ${index + 1}`,
    input: { check, detection, mode }, expected: {
      source: mode === 2 || mode === 3 ? "fallback" : "model",
      calls: mode === 0 ? 1 : mode === 1 ? 2 : mode === 2 ? 2 : 0,
      reservations: mode === 0 ? 1 : mode === 1 ? 2 : mode === 2 ? 2 : 1,
      message: mode === 2 || mode === 3
        ? `${apiName} reported an anomaly. Possible outage or data issue.`
        : `${apiName} failed with status 503.`,
    } };
});
for (const entry of modelCases) {
  test(`stress LLM mocked generation: ${entry.name}`, async () => {
    let modelCalls = 0;
    let reservationCalls = 0;
    let capturedFacts;
    const service = createLlmService({
      client: { models: { async generateContent(request) {
        modelCalls += 1;
        capturedFacts = JSON.parse(request.contents.split("Facts (JSON): ")[1]);
        if (entry.input.mode === 1 && modelCalls === 1) throw Object.assign(new Error("synthetic timeout"), { name: "TimeoutError" });
        if (entry.input.mode === 2) throw new Error("synthetic provider failure");
        return { text: `**${entry.input.check.api_name}** failed with status 503.` };
      } } },
      apiKey: "synthetic-only-key", model: "mocked-model", timeoutMs: 20,
      usageService: { async reserveGeminiCall() {
        reservationCalls += 1;
        return { allowed: entry.input.mode !== 3, day: "synthetic-day", logRequired: false };
      } },
      findActiveAlert: async () => null,
      logger: { info() {}, warn() {}, error() {} },
    });
    const result = await service.generateAlertMessage(entry.input.check, entry.input.detection);
    assert.deepEqual({ source: result.source, calls: modelCalls, message: result.message }, {
      source: entry.expected.source, calls: entry.expected.calls, message: entry.expected.message,
    });
    assert.deepEqual(Object.keys(capturedFacts ?? {
      api_name: null, status_code: null, response_time_ms: null, records_returned: null, anomaly_types: [], severity: "warning",
    }).sort(), ["anomaly_types", "api_name", "records_returned", "response_time_ms", "severity", "status_code"]);
    assert.equal(JSON.stringify(capturedFacts ?? {}).includes("synthetic-secret-must-not-be-prompted"), false);
    assert.equal(reservationCalls, entry.expected.reservations);
  });
}

const responseEdgeCases = Array.from({ length: 50 }, (_, index) => {
  const isEmpty = index % 2 === 0;
  const apiName = `Edge API ${index + 1}`;
  return { name: `${isEmpty ? "empty" : "overlong"} provider response ${index + 1}`,
    input: { check: { api_name: apiName, status_code: 200, response_time_ms: 100, records_returned: 1 }, detection: { anomaly_types: ["unknown_anomaly"], severity: "warning" } },
    providerText: isEmpty ? "  " : "x".repeat(281),
    expected: { source: "fallback", failure: isEmpty ? "EMPTY_RESPONSE" : "RESPONSE_TOO_LONG",
      message: `${apiName} reported an anomaly. Possible outage or data issue.`, calls: 1 } };
});
for (const entry of responseEdgeCases) {
  test(`stress LLM response boundary: ${entry.name}`, async () => {
    let calls = 0;
    const service = createLlmService({
      client: { models: { async generateContent() { calls += 1; return { text: entry.providerText }; } } },
      apiKey: "synthetic-key", model: "mock", timeoutMs: 10,
      usageService: { async reserveGeminiCall() { return { allowed: true }; } },
      findActiveAlert: async () => null, logger: { info() {}, warn() {}, error() {} },
    });
    const result = await service.generateAlertMessage(entry.input.check, entry.input.detection);
    assert.equal(result.source, entry.expected.source);
    assert.equal(result.failureReason.reasonCode, entry.expected.failure);
    assert.equal(result.message, entry.expected.message);
    assert.equal(calls, entry.expected.calls);
  });
}

const anomalyKinds = [
  ["http_status_failure_critical", "failed with status 503"],
  ["records_returned_anomaly", "returned 0 records"],
  ["response_time_critical", "responded slowly (5500 ms)"],
  ["validation_anomaly", "sent invalid data"],
];
const combinationCases = Array.from({ length: 50 }, (_, index) => {
  const mask = index % 15 + 1;
  const details = anomalyKinds.filter((_item, bit) => mask & (1 << bit)).map(([, phrase]) => phrase);
  const detailText = details.length === 1 ? details[0] : details.length === 2
    ? `${details[0]} and ${details[1]}` : `${details.slice(0, -1).join(", ")}, and ${details.at(-1)}`;
  const apiName = `Combined API ${index + 1}`;
  return { name: `fallback combination ${index + 1}`, input: {
    api_name: apiName, status_code: 503, response_time_ms: 5500, records_returned: 0,
    anomaly_types: anomalyKinds.filter((_item, bit) => mask & (1 << bit)).map(([type]) => type),
  }, expected: `${apiName} ${detailText}. Possible outage or data issue.` };
});
for (const entry of combinationCases) {
  test(`stress LLM combined fallback: ${entry.name}`, () => assert.equal(buildFallbackMessage(entry.input), entry.expected));
}
