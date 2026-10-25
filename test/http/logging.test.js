import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import pino from "pino";

process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/mock_only";
const [{ createApp }, { serializeSafeError }] = await Promise.all([
  import("../../src/app.js"),
  import("../../src/config/logger.js"),
]);

test("request logs omit response headers, 4xx are warnings without stacks, and 5xx messages are sanitized", async () => {
  const lines = [];
  const output = new Writable({
    write(chunk, _encoding, callback) { lines.push(chunk.toString()); callback(); },
  });
  const logger = pino({ level: "trace", serializers: { err: serializeSafeError } }, output);
  const app = createApp({
    appLogger: logger,
    logRequests: true,
    workspaceService: {
      async createWorkspace() { throw new Error("Mongo failed at mongodb://synthetic-user:synthetic-password@fake-host/db"); },
    },
    monitorSettings: { allowPrivateTargets: false },
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const rejected = await fetch(`${base}/monitor`, {
      method: "POST", headers: { "content-type": "application/json", "x-test-response-header": "not-logged" }, body: "{}",
    });
    assert.equal(rejected.status, 400);
    const failed = await fetch(`${base}/workspaces`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Synthetic workspace" }),
    });
    assert.equal(failed.status, 500);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await new Promise((resolve) => output.end(resolve));
  }

  const entries = lines.filter(Boolean).map((line) => JSON.parse(line));
  const warning = entries.find((entry) => entry.msg === "Request rejected");
  const realError = entries.find((entry) => entry.msg === "Request failed");
  assert.equal(warning.level, 40);
  assert.equal(warning.statusCode, 400);
  assert.equal(Object.hasOwn(warning, "err"), false);
  assert.equal(realError.level, 50);
  assert.match(realError.err.message, /REDACTED_MONGODB_URI/);
  const serialized = JSON.stringify(entries);
  assert.doesNotMatch(serialized, /synthetic-password|x-test-response-header|not-logged/);
  for (const entry of entries.filter((item) => item.msg === "request completed")) {
    assert.equal(Object.hasOwn(entry.res ?? {}, "headers"), false);
    assert.deepEqual(Object.keys(entry.res ?? {}).sort(), ["statusCode"]);
  }
});
