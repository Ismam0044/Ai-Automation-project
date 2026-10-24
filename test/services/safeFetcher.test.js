import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createSafeFetcher, MONITOR_FETCH_USER_AGENT } from "../../src/services/safeFetcher.js";

async function withLocalServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try { await run(url, server); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function monitor(url, extra = {}) {
  return { _id: "monitor-test-id", name: "Synthetic", url, method: "GET", timeout_ms: 5_000, records_field: null, ...extra };
}

const silentLogger = { info() {}, warn() {}, error() {} };

test("safe fetcher pins a validated DNS answer when a later DNS answer changes", async () => {
  let lookups = 0;
  await withLocalServer((request, response) => response.end(JSON.stringify([{ id: 1 }])), async (localUrl) => {
    const port = new URL(localUrl).port;
    const validatorLookup = async () => {
      lookups += 1;
      return [{ address: lookups === 1 ? "127.0.0.1" : "169.254.169.254", family: 4 }];
    };
    const fetcher = createSafeFetcher({ lookup: validatorLookup, allowPrivateTargets: true, logger: silentLogger });
    const result = await fetcher.fetchMonitor(monitor(`http://changing.example.org:${port}/check`));
    assert.equal(result.outcome, "ok");
    assert.equal(result.records_returned, 1);
    assert.equal(lookups, 1, "the socket lookup uses the pinned validated address instead of resolving again");
  });
});

test("safe fetcher never opens a socket when URL validation rejects the target", async () => {
  let hits = 0;
  await withLocalServer((_request, response) => { hits += 1; response.end("[]"); }, async (url) => {
    const fetcher = createSafeFetcher({
      logger: silentLogger,
      validateUrl: async () => { throw new TypeError("blocked target"); },
    });
    const result = await fetcher.fetchMonitor(monitor(url));
    assert.deepEqual(result, { status_code: 0, response_time_ms: result.response_time_ms, records_returned: 0, outcome: "blocked" });
    assert.equal(hits, 0);
  });
});

test("safe fetcher does not follow redirects", async () => {
  let redirectedHits = 0;
  await withLocalServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
      response.end("[]");
    } else {
      redirectedHits += 1;
      response.end("[]");
    }
  }, async (url) => {
    const result = await createSafeFetcher({ allowPrivateTargets: true, logger: silentLogger })
      .fetchMonitor(monitor(`${url}/redirect`));
    assert.equal(result.status_code, 302);
    assert.equal(result.outcome, "ok");
    assert.equal(redirectedHits, 0);
  });
});

test("safe fetcher caps response bytes and classifies oversized data", async () => {
  await withLocalServer((_request, response) => response.end(JSON.stringify("x".repeat(200))), async (url) => {
    const result = await createSafeFetcher({ allowPrivateTargets: true, maxResponseBytes: 32, logger: silentLogger })
      .fetchMonitor(monitor(url));
    assert.equal(result.outcome, "too_large");
    assert.equal(result.records_returned, null);
  });
});

test("safe fetcher enforces the monitor timeout", async () => {
  await withLocalServer((_request, response) => setTimeout(() => {
    if (!response.destroyed) response.end("[]");
  }, 150), async (url) => {
    const result = await createSafeFetcher({ allowPrivateTargets: true, logger: silentLogger })
      .fetchMonitor(monitor(url, { timeout_ms: 30 }));
    assert.equal(result.status_code, 0);
    assert.equal(result.records_returned, 0);
    assert.equal(result.outcome, "timeout");
  });
});

test("safe fetcher labels malformed JSON without retaining it", async () => {
  await withLocalServer((_request, response) => response.end("synthetic private body"), async (url) => {
    const result = await createSafeFetcher({ allowPrivateTargets: true, logger: silentLogger })
      .fetchMonitor(monitor(url));
    assert.equal(result.outcome, "invalid_json");
    assert.equal(result.records_returned, null);
    assert.deepEqual(Object.keys(result).sort(), ["outcome", "records_returned", "response_time_ms", "status_code"]);
  });
});

test("safe fetcher counts top-level arrays, records_field arrays and numeric fields", async () => {
  await withLocalServer((request, response) => {
    if (request.url === "/field") return response.end(JSON.stringify({ data: { rows: [1, 2, 3] } }));
    if (request.url === "/number") return response.end(JSON.stringify({ count: 7 }));
    if (request.url === "/missing") return response.end(JSON.stringify({ data: {} }));
    return response.end(JSON.stringify([1, 2]));
  }, async (url) => {
    const fetcher = createSafeFetcher({ allowPrivateTargets: true, logger: silentLogger });
    assert.equal((await fetcher.fetchMonitor(monitor(url))).records_returned, 2);
    assert.equal((await fetcher.fetchMonitor(monitor(`${url}/field`, { records_field: "data.rows" }))).records_returned, 3);
    assert.equal((await fetcher.fetchMonitor(monitor(`${url}/number`, { records_field: "count" }))).records_returned, 7);
    assert.equal((await fetcher.fetchMonitor(monitor(`${url}/missing`, { records_field: "data.rows" }))).records_returned, null);
  });
});

test("safe fetcher logs only monitor id, hostname and outcome, and sends no credentials", async () => {
  let receivedHeaders;
  const lines = [];
  await withLocalServer((request, response) => {
    receivedHeaders = request.headers;
    response.end("[]");
  }, async (url) => {
    const fetcher = createSafeFetcher({
      allowPrivateTargets: true,
      logger: { info(fields) { lines.push(fields); }, warn() {}, error() {} },
    });
    await fetcher.fetchMonitor(monitor(`${url}/health?access_token=synthetic-secret`));
    assert.equal(receivedHeaders["user-agent"], MONITOR_FETCH_USER_AGENT);
    assert.equal(receivedHeaders["accept-encoding"], "identity");
    assert.equal(receivedHeaders.authorization, undefined);
    assert.equal(receivedHeaders.cookie, undefined);
    const line = JSON.stringify(lines[0]);
    assert.match(line, /monitor-test-id/);
    assert.match(line, /127\.0\.0\.1/);
    assert.match(line, /outcome/);
    assert.doesNotMatch(line, /access_token|synthetic-secret|health\?/);
    assert.deepEqual(Object.keys(lines[0]).sort(), ["host", "monitor_id", "outcome"]);
  });
});
