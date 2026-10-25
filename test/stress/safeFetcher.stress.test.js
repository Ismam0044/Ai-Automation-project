import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createSafeFetcher } from "../../src/services/safeFetcher.js";

const silent = { info() {}, warn() {}, error() {} };
async function withServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await callback(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

const statusCases = Array.from({ length: 40 }, (_, index) => ({
  name: `HTTP response status ${200 + index}`, status: 200 + index,
}));
for (const entry of statusCases) {
  test(`stress safe fetcher: ${entry.name}`, async () => {
    await withServer((_request, response) => {
      response.writeHead(entry.status, { "content-type": "application/json" });
      response.end("{}");
    }, async (url) => {
      const result = await createSafeFetcher({ allowPrivateTargets: true, logger: silent }).fetchMonitor({
        _id: "stress-id", url, timeout_ms: 1000, method: "GET", records_field: null,
      });
      assert.equal(result.status_code, entry.status);
      assert.equal(result.outcome, entry.status === 204 ? "invalid_json" : "ok");
      assert.equal(result.records_returned, null);
      assert.ok(Number.isInteger(result.response_time_ms) && result.response_time_ms >= 0);
    });
  });
}

const behaviorCases = [
  ["top-level empty array", "[]", 0, "ok"], ["top-level two records", "[1,2]", 2, "ok"],
  ["nested records path", '{"data":{"rows":[1,2,3]}}', 3, "ok", "data.rows"],
  ["numeric count path", '{"count":8}', 8, "ok", "count"], ["missing count path", '{"data":{}}', null, "ok", "data.rows"],
  ["string count path", '{"count":"8"}', null, "ok", "count"], ["invalid JSON", "secret response body", null, "invalid_json"],
  ["empty body", "", null, "invalid_json"], ["oversized response", "x".repeat(200), null, "too_large"],
  ["redirect response", '{"redirected":true}', null, "ok", null, 302],
  ["delayed response times out", '{"late":true}', 0, "timeout", null, 504],
];
for (const [name, body, records, outcome, recordsField = null, status = 200] of behaviorCases) {
  test(`stress safe fetcher: ${name}`, async () => {
    const lines = [];
    await withServer((_request, response) => {
      if (status === 302) response.writeHead(302, { location: "http://127.0.0.1:1/private" });
      else response.writeHead(status, { "content-type": "application/json" });
      const send = () => response.end(body);
      if (status === 504) setTimeout(send, 40); else send();
    }, async (url) => {
      const result = await createSafeFetcher({ allowPrivateTargets: true, maxResponseBytes: 100, logger: {
        info(fields) { lines.push(JSON.stringify(fields)); }, warn() {}, error() {},
      } }).fetchMonitor({ _id: "safe-log-test", url: `${url}/synthetic?private_query=never_log`, timeout_ms: status === 504 ? 5 : 1000, method: "GET", records_field: recordsField });
      assert.equal(result.outcome, outcome);
      assert.equal(result.records_returned, records);
      assert.equal(result.status_code, status === 504 ? 0 : status);
      assert.equal(lines.length, 1);
      assert.doesNotMatch(lines[0], /private_query|never_log|synthetic\?|secret response body|\/synthetic/);
    });
  });
}

test("safe fetcher does not follow redirects to public addresses", async () => {
  let requests = 0;
  await withServer((_request, response) => {
    requests += 1;
    response.writeHead(302, { location: "https://8.8.8.8/private" });
    response.end("{}");
  }, async (url) => {
    const result = await createSafeFetcher({ allowPrivateTargets: true, logger: silent }).fetchMonitor({
      _id: "redirect-public", url, timeout_ms: 1000, method: "GET", records_field: null,
    });
    assert.equal(result.status_code, 302);
    assert.equal(result.outcome, "ok");
    assert.equal(requests, 1);
  });
});
