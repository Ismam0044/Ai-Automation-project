import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackMessage, cleanModelOutput } from "../../src/services/llmService.js";

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
