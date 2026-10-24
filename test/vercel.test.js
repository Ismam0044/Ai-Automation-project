import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Server, createServer } from "node:http";

process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/vercel_mock_only";
process.env.NODE_ENV = "test";
process.env.VERCEL = "1";
process.env.TRUST_PROXY = "1";

let importListenCalls = 0;
const originalListen = Server.prototype.listen;
Server.prototype.listen = function (...args) { importListenCalls += 1; return originalListen.apply(this, args); };
let modules;
try {
  modules = await Promise.all([
    import("../api/index.js"),
    import("../src/controllers/cronController.js"),
    import("../src/services/mongoRateLimitStore.js"),
    import("../src/db/mongoose.js"),
    import("../src/config/env.js"),
  ]);
} finally { Server.prototype.listen = originalListen; }
const [{ default: apiApp }, { createCronController }, { MongoRateLimitStore }, { connectToDatabase }, { env }] = modules;

test("Vercel entry exports the Express app without listening", () => {
  assert.equal(typeof apiApp, "function");
  assert.equal(importListenCalls, 0);
});

test("Vercel defaults to one trusted proxy hop for the Vercel edge client address", () => {
  assert.equal(env.isVercel, true);
  assert.equal(env.trustProxy, 1);
});

test("the single Vercel entry rewrites route query data into Express API paths", async () => {
  const { createApp } = await import("../src/app.js");
  const app = createApp({ connectDatabase: async () => {}, logRequests: false, clientDirectory: "missing-client-dist" });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/index?route=%2Fapi%2Fhealth`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable", database: "disconnected" });
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

async function invoke(controller, action, authorization) {
  let statusCode = 200; let payload;
  const response = { status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; } };
  const request = { get(name) { return name.toLowerCase() === "authorization" ? authorization : undefined; } };
  let forwarded;
  await controller[action](request, response, (error) => { forwarded = error; });
  return { statusCode, payload, forwarded };
}

test("cron endpoints reject missing and incorrect bearer secrets", async () => {
  const controller = createCronController({ secret: "expected", scheduler: { async runDueOnce() { return {}; } }, purgeService: { async purgeInactiveWorkspaces() { return 0; } } });
  assert.equal((await invoke(controller, "runDue")).statusCode, 401);
  assert.equal((await invoke(controller, "purge", "Bearer wrong")).statusCode, 401);
});

test("cron endpoint refuses work when CRON_SECRET is unset", async () => {
  const controller = createCronController({ scheduler: { async runDueOnce() { throw new Error("must not run"); } } });
  const result = await invoke(controller, "runDue", "Bearer arbitrary");
  assert.equal(result.statusCode, 503);
  assert.equal(result.payload.error.code, "CRON_NOT_CONFIGURED");
});

test("run-due passes the configured time budget and returns counts only", async () => {
  let received;
  const controller = createCronController({ secret: "secret", timeBudgetMs: 32100, scheduler: { async runDueOnce(options) { received = options; return { claimed: 3, failed: 1 }; } } });
  const result = await invoke(controller, "runDue", "Bearer secret");
  assert.deepEqual(received, { timeBudgetMs: 32100, summary: true });
  assert.deepEqual(result.payload, { claimed: 3, failed: 1 });
});

test("run-due claims no work after its time budget is exhausted", async () => {
  let claims = 0;
  const { createMonitorScheduler } = await import("../src/services/monitorScheduler.js");
  const scheduler = createMonitorScheduler({
    monitorRepository: { async dueWorkspaceIds() { return ["workspace"]; }, async claimDueForWorkspace() { claims += 1; return null; } },
    monitorCheckService: { async run() {} },
    checkBudget: { async remaining() { return 10; }, async take() { return true; } },
  });
  assert.deepEqual(await scheduler.runDueOnce({ timeBudgetMs: 0, summary: true }), { claimed: 0, failed: 0 });
  assert.equal(claims, 0);
});

test("Mongoose connection is cached across concurrent serverless calls", async () => {
  const listeners = new Map(); let calls = 0; let resolveConnect;
  const fake = {
    connection: { readyState: 0, name: "mock", on(name, handler) { listeners.set(name, handler); } },
    async connect(_uri, options) { calls += 1; assert.equal(options.maxPoolSize, 5); await new Promise((resolve) => { resolveConnect = resolve; }); this.connection.readyState = 1; },
  };
  const uri = "mongodb://127.0.0.1:27017/test_db";
  const first = connectToDatabase(uri, { mongooseClient: fake, appLogger: { info() {}, warn() {}, error() {} }, serverless: true });
  const second = connectToDatabase(uri, { mongooseClient: fake, appLogger: { info() {}, warn() {}, error() {} }, serverless: true });
  assert.equal(calls, 1);
  resolveConnect();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(typeof listeners.get("disconnected"), "function");
});

test("Mongo rate limit buckets are shared between store instances", async () => {
  const buckets = new Map();
  const model = {
    async findOneAndUpdate(filter, update) {
      const id = `${filter.scope_key}:${filter.bucket_start.getTime()}`;
      const previous = buckets.get(id) ?? { hits: 0 };
      previous.hits += update.$inc.hits;
      buckets.set(id, previous);
      return previous;
    },
  };
  const a = new MongoRateLimitStore({ prefix: "api", Model: model, clock: () => 1000 });
  const b = new MongoRateLimitStore({ prefix: "api", Model: model, clock: () => 1000 });
  a.init({ windowMs: 60_000 }); b.init({ windowMs: 60_000 });
  assert.equal((await a.increment("client")).totalHits, 1);
  assert.equal((await b.increment("client")).totalHits, 2);
});

test("Vercel configuration is valid JSON and routes APIs before SPA fallback", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.outputDirectory, "client/dist");
  assert.equal(config.functions["api/*.js"].maxDuration, 60);
  assert.ok(config.rewrites.some((route) => route.source === "/monitor" && route.destination.includes("/api/index")));
  assert.ok(config.rewrites.some((route) => route.source === "/health"));
  assert.equal(config.rewrites.at(-1).destination, "/index.html");
  assert.match(config.headers[0].headers[0].value, /script-src 'self'/);
  assert.match(config.headers[0].headers[0].value, /style-src 'self' 'unsafe-inline'/);
  assert.deepEqual(config.crons, [{ path: "/api/cron/purge", schedule: "0 3 * * *" }]);
});

test("local start command remains the src/server.js entry point", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const localServer = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.equal(packageJson.scripts.start, "node src/server.js");
  assert.match(localServer, /app\.listen\(/);
});
