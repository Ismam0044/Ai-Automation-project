import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { summarizeEnvironment } from "../../src/config/checkEnv.js";

test("environment summary prints safe MongoDB and Gemini facts but no secrets", () => {
  const fakeUri = "mongodb://demo-user:fake-uri-password@fake-host-a:27017,fake-host-b:27017/appdb/?retryWrites=true&w=majority";
  const fakeApiKey = "fake-gemini-api-key-should-not-appear";
  const result = summarizeEnvironment({
    MONGODB_URI: fakeUri,
    GEMINI_API_KEY: fakeApiKey,
    GEMINI_MODEL: "test-model",
    PORT: "4321",
    MONITOR_CONCURRENCY: "7",
  });
  const output = JSON.stringify(result);
  assert.equal(result.required.MONGODB_URI, "present");
  assert.deepEqual(result.mongodb, {
    present: true,
    scheme: "mongodb",
    hosts: 2,
    databaseName: "appdb",
    hadTrailingSlash: true,
    optionNames: ["retryWrites", "w"],
  });
  assert.equal(result.gemini.GEMINI_API_KEY, "present");
  assert.equal(result.gemini.GEMINI_API_KEY_length, fakeApiKey.length);
  assert.equal(result.gemini.GEMINI_MODEL, "test-model");
  assert.equal(result.numericSettings.PORT, 4321);
  assert.equal(result.numericSettings.MONITOR_CONCURRENCY, 7);
  assert.equal(output.includes(fakeUri), false);
  assert.equal(output.includes("fake-uri-password"), false);
  assert.equal(output.includes("fake-host-a"), false);
  assert.equal(output.includes(fakeApiKey), false);
});

test("environment summary reports missing MongoDB URI without exposing unrelated values", () => {
  const result = summarizeEnvironment({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" });
  assert.equal(result.required.MONGODB_URI, "missing");
  assert.equal(result.mongodb.present, false);
  assert.equal(result.valid, false);
  assert.equal(JSON.stringify(result).includes("test-key"), false);
});

test("check-env CLI output contains no URI, credentials, hosts, or API key", () => {
  const fakeUri = "mongodb+srv://demo-user:cli-fake-password@cli-fake-host.example/appdb/?retryWrites=true";
  const fakeKey = "cli-fake-gemini-key";
  const child = spawnSync(process.execPath, ["scripts/check-env.js"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      DOTENV_CONFIG_PATH: path.join(tmpdir(), `nonexistent-${randomUUID()}`),
      NODE_OPTIONS: "",
      MONGODB_URI: fakeUri,
      GEMINI_API_KEY: fakeKey,
      GEMINI_MODEL: "fake-model",
      PORT: "3000",
    },
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.includes(fakeUri), false);
  assert.equal(child.stdout.includes("cli-fake-password"), false);
  assert.equal(child.stdout.includes("cli-fake-host"), false);
  assert.equal(child.stdout.includes(fakeKey), false);
  const result = JSON.parse(child.stdout);
  assert.equal(result.mongodb.databaseName, "appdb");
  assert.equal(result.mongodb.hadTrailingSlash, true);
  assert.equal(result.gemini.GEMINI_API_KEY_length, fakeKey.length);
});
