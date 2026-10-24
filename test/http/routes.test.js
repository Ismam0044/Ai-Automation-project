import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/mock_only";
const { createApp } = await import("../../src/app.js");
const { createLlmService } = await import("../../src/services/llmService.js");

const quietLogger = {
  info() {},
  warn() {},
  error() {},
};

function makeMemoryAlertService() {
  const records = [];
  let nextId = 1;
  const keyFor = (detection, scope = {}) => `${scope.workspaceId ?? "shared"}|${scope.monitorId ?? "demo"}|${detection.api_name ?? "unknown"}|${[...detection.anomaly_types].sort().join("|")}`;
  return {
    records,
    async findActiveAlertForDetection(detection, scope = {}) {
      return records.find((record) => record.status === "active" && record.dedupe_key === keyFor(detection, scope)) ?? null;
    },
    async saveAlert(detection, inputSnapshot, message, messageSource, scope = {}) {
      const existing = await this.findActiveAlertForDetection(detection, scope);
      if (existing) {
        existing.input_snapshot = inputSnapshot;
        existing.message = message;
        existing.message_source = messageSource;
        existing.occurrence_count += 1;
        existing.updatedAt = new Date();
        return existing;
      }
      const now = new Date();
      const record = {
        _id: String(nextId++).padStart(24, "0"),
        api_name: detection.api_name ?? "unknown",
        anomaly_types: [...detection.anomaly_types].sort(),
        severity: detection.severity,
        message,
        message_source: messageSource,
        workspace_id: scope.workspaceId ?? null,
        monitor_id: scope.monitorId ?? null,
        input_snapshot: inputSnapshot,
        status: "active",
        dedupe_key: keyFor(detection, scope),
        occurrence_count: 1,
        createdAt: now,
        updatedAt: now,
      };
      records.push(record);
      return record;
    },
    async listActiveAlerts({ workspaceId = null } = {}) {
      return records.filter((record) => record.status === "active" && record.workspace_id === workspaceId)
        .sort((left, right) => right.createdAt - left.createdAt);
    },
    async listAlerts({ status, page, limit, apiName, severity, workspaceId = null }) {
      const search = apiName ? apiName.toLowerCase() : "";
      const matchingStatus = records.filter((record) => record.status === status && record.workspace_id === workspaceId
        && (!search || record.api_name.toLowerCase().includes(search)));
      const matching = matchingStatus.filter((record) => severity === "all" || record.severity === severity);
      matching.sort((left, right) => status === "resolved"
        ? right.updatedAt - left.updatedAt
        : (left.severity === "critical" ? 0 : 1) - (right.severity === "critical" ? 0 : 1)
          || right.updatedAt - left.updatedAt);
      const offset = (page - 1) * limit;
      return {
        alerts: matching.slice(offset, offset + limit),
        pagination: { page, limit, total: matching.length, total_pages: Math.ceil(matching.length / limit) },
        summary: {
          total: matchingStatus.length,
          critical: matchingStatus.filter((item) => item.severity === "critical").length,
          warning: matchingStatus.filter((item) => item.severity === "warning").length,
        },
      };
    },
    async resolveAlertById(id, { workspaceId = null } = {}) {
      const record = records.find((item) => item._id === id && item.status === "active" && item.workspace_id === workspaceId);
      if (record) {
        record.status = "resolved";
        record.updatedAt = new Date();
      }
      return record ?? null;
    },
    async resolveMonitorAlerts(workspaceId, monitorId, reason) {
      for (const record of records) {
        if (record.status === "active" && record.workspace_id === workspaceId && record.monitor_id === monitorId) {
          record.status = "resolved";
          record.resolution_reason = reason;
          record.updatedAt = new Date();
        }
      }
    },
  };
}

async function withServer(options, run) {
  const app = createApp({
    appLogger: quietLogger,
    logRequests: false,
    llmService: { async generateAlertMessage() { return { message: "Mock alert message.", source: "fallback" }; } },
    checkHistoryService: { async summary() { return { state: "not_checked_yet" }; }, async summaries() { return new Map(); }, async list() { return { checks: [], pagination: {} }; } },
    ...options,
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const sample = [
  { api_name: "PatientDataAPI", response_time_ms: 1200, status_code: 200, records_returned: 50 },
  { api_name: "AppointmentAPI", response_time_ms: 5500, status_code: 500, records_returned: 0 },
];

test("GET /health keeps its existing disconnected response shape", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable", database: "disconnected" });
  });
});

test("POST /monitor handles the assessment sample and skips healthy items", async () => {
  const alertService = makeMemoryAlertService();
  let llmCalls = 0;
  await withServer({
    alertService,
    llmService: { async generateAlertMessage() { llmCalls += 1; return { message: "AppointmentAPI failed.", source: "model" }; } },
  }, async (base) => {
    const response = await fetch(`${base}/monitor`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sample),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      total_items: 2,
      healthy_count: 1,
      anomalies_created: 1,
      anomalies_updated: 0,
      failed_items: 0,
      results: [
        { api_name: "PatientDataAPI", status: "healthy", severity: "none", alert_id: null },
        { api_name: "AppointmentAPI", status: "created", severity: "critical", alert_id: "000000000000000000000001" },
      ],
    });
  });
  assert.equal(llmCalls, 1);
  assert.equal(alertService.records.length, 1);
});

test("POST /monitor rejects non-array input with consistent JSON error", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/monitor`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_name: "x" }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: { code: "INVALID_BATCH", message: "Request body must be a JSON array." } });
  });
});

test("mixed batch saves a malformed item as validation anomaly and continues", async () => {
  const alertService = makeMemoryAlertService();
  await withServer({ alertService, llmService: { async generateAlertMessage() { return { message: "Fallback.", source: "fallback" }; } } }, async (base) => {
    const response = await fetch(`${base}/monitor`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify([sample[0], null, { ...sample[1], api_name: "OtherAPI" }]),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.total_items, 3);
    assert.equal(result.healthy_count, 1);
    assert.equal(result.failed_items, 0);
    assert.equal(result.anomalies_created, 2);
    assert.equal(result.results[1].status, "created");
    assert.equal(result.results[1].api_name, null);
    assert.ok(alertService.records.some((alert) => alert.anomaly_types.includes("validation_anomaly")));
  });
});

test("duplicate submission increments occurrence count without another LLM call", async () => {
  const alertService = makeMemoryAlertService();
  let llmCalls = 0;
  await withServer({
    alertService,
    llmService: { async generateAlertMessage() { llmCalls += 1; return { message: "Saved message.", source: "model" }; } },
  }, async (base) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${base}/monitor`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([sample[1]]),
      });
      const summary = await response.json();
      assert.equal(response.status, 200);
      assert.equal(summary[attempt === 0 ? "anomalies_created" : "anomalies_updated"], 1);
    }
  });
  assert.equal(llmCalls, 1);
  assert.equal(alertService.records[0].occurrence_count, 2);
});

test("an active fallback alert retries Gemini on update, then reuses the model message", async () => {
  const alertService = makeMemoryAlertService();
  const fallbackAlert = await alertService.saveAlert({
    api_name: "AppointmentAPI",
    anomaly_types: [
      "http_status_failure_critical",
      "records_returned_anomaly",
      "response_time_critical",
    ],
    severity: "critical",
  }, sample[1], "Old fallback message.", "fallback");
  let llmCalls = 0;

  await withServer({
    alertService,
    llmService: { async generateAlertMessage() {
      llmCalls += 1;
      return { message: "Fresh model message.", source: "model" };
    } },
  }, async (base) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(base + "/monitor", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([sample[1]]),
      });
      const summary = await response.json();
      assert.equal(response.status, 200);
      assert.equal(summary.anomalies_updated, 1);
      assert.equal(summary.results[0].alert_id, fallbackAlert._id);
    }
  });

  assert.equal(llmCalls, 1);
  assert.equal(fallbackAlert.occurrence_count, 3);
  assert.equal(fallbackAlert.message, "Fresh model message.");
  assert.equal(fallbackAlert.message_source, "model");
});

test("POST /monitor respects configured concurrency and preserves input order", async () => {
  let active = 0;
  let maximumActive = 0;
  const checks = Array.from({ length: 10 }, (_, index) => ({
    api_name: `API${index}`, response_time_ms: 6000, status_code: 200, records_returned: 1,
  }));
  const alertService = makeMemoryAlertService();
  await withServer({
    alertService,
    monitorSettings: { concurrency: 3 },
    llmService: { async generateAlertMessage() {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 8));
      active -= 1;
      return { message: "Slow response.", source: "fallback" };
    } },
  }, async (base) => {
    const response = await fetch(`${base}/monitor`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(checks),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(result.results.map((item) => item.api_name), checks.map((item) => item.api_name));
  });
  assert.equal(maximumActive, 3);
});

test("GET /alerts returns active alert list newest first", async () => {
  const alertService = makeMemoryAlertService();
  const old = await alertService.saveAlert({ api_name: "Old", anomaly_types: ["records_returned_anomaly"], severity: "warning" }, {}, "Old.", "fallback");
  await new Promise((resolve) => setTimeout(resolve, 2));
  const newest = await alertService.saveAlert({ api_name: "New", anomaly_types: ["records_returned_anomaly"], severity: "warning" }, {}, "New.", "fallback");
  await withServer({ alertService }, async (base) => {
    const response = await fetch(`${base}/alerts`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ["alerts"], "bare GET /alerts keeps the existing response shape");
    assert.deepEqual(body.alerts.map((item) => item._id), [newest._id, old._id]);
    assert.equal(body.alerts[0].status, "active");
  });
});

test("GET /alerts can explicitly read the shared demo list while a workspace cookie is present", async () => {
  const workspaceId = "a".repeat(24);
  const alertService = makeMemoryAlertService();
  const shared = await alertService.saveAlert({ api_name: "SharedDemo", anomaly_types: ["http_status_failure_warning"], severity: "warning" }, {}, "Shared", "fallback");
  await alertService.saveAlert({ api_name: "PrivateAPI", anomaly_types: ["http_status_failure_critical"], severity: "critical" }, {}, "Private", "fallback", { workspaceId, monitorId: "b".repeat(24) });
  const workspaceService = {
    async authenticateWorkspace(id, key) { return id === workspaceId && key === "k".repeat(43) ? { _id: id } : null; },
  };
  await withServer({ alertService, workspaceService }, async (base) => {
    const response = await fetch(`${base}/alerts?scope=shared&status=active` , {
      headers: { cookie: `workspace_${workspaceId}=${"k".repeat(43)}; workspace_active=${workspaceId}` },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.alerts.map((alert) => alert._id), [shared._id]);
    assert.deepEqual(Object.keys(body), ["alerts", "pagination", "summary"]);
  });
});

test("GET /workspaces/current returns cookie-authenticated workspace identity without its key", async () => {
  const workspaceId = "a".repeat(24);
  const accessKey = "k".repeat(43);
  const workspaceService = {
    async authenticateWorkspace(id, key) { return id === workspaceId && key === accessKey ? { _id: id } : null; },
    async getWorkspace(id) { return { _id: id, name: "Private demo" }; },
  };
  await withServer({ workspaceService }, async (base) => {
    const response = await fetch(`${base}/workspaces/current`, {
      headers: { cookie: `workspace_${workspaceId}=${accessKey}; workspace_active=${workspaceId}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { workspace: { id: workspaceId, name: "Private demo" } });
  });
});

test("cookie-authenticated POST, PATCH, and DELETE reject cross-site Origin; local Vite POST is accepted", async () => {
  const workspaceId = "a".repeat(24);
  const workspaceService = {
    async createWorkspace(name) { return { workspace: { _id: workspaceId, name }, accessKey: "k".repeat(43) }; },
  };
  await withServer({ workspaceService, monitorSettings: { nodeEnv: "development", publicAppUrl: "http://localhost:3000" } }, async (base) => {
    const cookie = `workspace_${workspaceId}=${"k".repeat(43)}; workspace_active=${workspaceId}`;
    const blocked = await fetch(`${base}/workspaces`, {
      method: "POST", headers: { cookie, origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ name: "No" }),
    });
    assert.equal(blocked.status, 403);
    assert.deepEqual(await blocked.json(), { error: { code: "CROSS_SITE_REQUEST", message: "This request could not be verified. Reload the page and try again." } });
    for (const method of ["PATCH", "DELETE"]) {
      const response = await fetch(`${base}/workspaces/${workspaceId}/monitors/${"b".repeat(24)}`, {
        method, headers: { cookie, origin: "https://attacker.example", "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(response.status, 403, `${method} must reject a cross-site Origin`);
      assert.equal((await response.json()).error.code, "CROSS_SITE_REQUEST");
    }
    const allowed = await fetch(`${base}/workspaces`, {
      method: "POST", headers: { cookie, origin: "http://127.0.0.1:5173", "content-type": "application/json" },
      body: JSON.stringify({ name: "Same site" }),
    });
    assert.equal(allowed.status, 201);
  });
});

test("workspace bearer scopes GET /alerts and resolve while anonymous callers stay on shared alerts", async () => {
  const workspaceId = "a".repeat(24);
  const otherWorkspaceId = "c".repeat(24);
  const keyA = "a".repeat(43);
  const keyB = "b".repeat(43);
  const alertService = makeMemoryAlertService();
  const shared = await alertService.saveAlert({ api_name: "SharedDemo", anomaly_types: ["http_status_failure_warning"], severity: "warning" }, {}, "Shared", "fallback");
  const scoped = await alertService.saveAlert({ api_name: "PrivateAPI", anomaly_types: ["http_status_failure_critical"], severity: "critical" }, {}, "Private", "fallback", { workspaceId, monitorId: "d".repeat(24) });
  const workspaceService = {
    async authenticateAccessKey(key) {
      if (key === keyA) return { _id: workspaceId };
      if (key === keyB) return { _id: otherWorkspaceId };
      return null;
    },
    async authenticateWorkspace(id, key) {
      return (id === workspaceId && key === keyA) ? { _id: workspaceId } : null;
    },
  };
  await withServer({ alertService, workspaceService }, async (base) => {
    const anonymous = await fetch(`${base}/alerts`);
    assert.deepEqual((await anonymous.json()).alerts.map((alert) => alert._id), [shared._id]);
    const privateResponse = await fetch(`${base}/alerts`, { headers: { authorization: `Bearer ${keyA}` } });
    assert.deepEqual((await privateResponse.json()).alerts.map((alert) => alert._id), [scoped._id]);
    const otherWorkspace = await fetch(`${base}/alerts`, { headers: { authorization: `Bearer ${keyB}` } });
    assert.deepEqual((await otherWorkspace.json()).alerts, []);
    const cannotResolve = await fetch(`${base}/alerts/${scoped._id}/resolve`, {
      method: "PATCH", headers: { authorization: `Bearer ${keyB}` },
    });
    assert.equal(cannotResolve.status, 404);
    const canResolve = await fetch(`${base}/alerts/${scoped._id}/resolve`, {
      method: "PATCH", headers: { authorization: `Bearer ${keyA}` },
    });
    assert.equal(canResolve.status, 200);
  });
});

test("monitor history routes require workspace auth and preserve the workspace scope", async () => {
  const workspaceId = "a".repeat(24);
  const monitorId = "b".repeat(24);
  const accessKey = "k".repeat(43);
  const calls = [];
  const workspaceService = {
    async authenticateWorkspace(id, key) { return id === workspaceId && key === accessKey ? { _id: workspaceId } : null; },
  };
  const monitorRepository = {
    async findById(ownerId, id) { return ownerId === workspaceId && id === monitorId ? { _id: monitorId, workspace_id: workspaceId } : null; },
  };
  const checkHistoryService = {
    async list(ownerId, id, query) { calls.push(["list", ownerId, id, query]); return { checks: [], pagination: { page: query.page, limit: query.limit, total: 0, total_pages: 0 } }; },
    async summary(ownerId, monitor, id) { calls.push(["summary", ownerId, id]); return { state: "up" }; },
  };
  const path = `/workspaces/${workspaceId}/monitors/${monitorId}`;
  await withServer({ workspaceService, monitorRepository, checkHistoryService }, async (base) => {
    assert.equal((await fetch(`${base}${path}/checks`)).status, 401);
    const headers = { authorization: `Bearer ${accessKey}` };
    const checks = await fetch(`${base}${path}/checks?page=2&limit=10`, { headers });
    assert.equal(checks.status, 200);
    assert.deepEqual(calls[0], ["list", workspaceId, monitorId, { page: 2, limit: 10 }]);
    const invalid = await fetch(`${base}${path}/checks?limit=500`, { headers });
    assert.equal(invalid.status, 400);
    const summary = await fetch(`${base}${path}/summary`, { headers });
    assert.deepEqual(await summary.json(), { summary: { state: "up" } });
  });
});

test("check now endpoint is limited per workspace and per monitor", async () => {
  const workspaceId = "a".repeat(24);
  const monitorId = "b".repeat(24);
  const accessKey = "k".repeat(43);
  let runs = 0;
  const workspaceService = {
    async authenticateWorkspace(id, key) { return id === workspaceId && key === accessKey ? { _id: workspaceId } : null; },
  };
  const monitorCheckService = {
    async runNow(ownerId, id) { runs += 1; return { outcome: "ok", status: "healthy", alert_id: null, check: { status_code: 200 } }; },
  };
  await withServer({
    workspaceService,
    monitorCheckService,
    monitorSettings: {
      checkNowWorkspaceMax: 1, checkNowWorkspaceWindowMs: 60_000,
      checkNowMonitorMax: 1, checkNowMonitorWindowMs: 60_000,
    },
  }, async (base) => {
    const endpoint = `${base}/workspaces/${workspaceId}/monitors/${monitorId}/check`;
    const options = { method: "POST", headers: { authorization: `Bearer ${accessKey}` } };
    assert.equal((await fetch(endpoint, options)).status, 200);
    const limited = await fetch(endpoint, options);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, "RATE_LIMITED");
    assert.equal(runs, 1);
  });
});

test("GET /alerts status filter and pagination return newest resolved pages", async () => {
  const alertService = makeMemoryAlertService();
  const older = await alertService.saveAlert({ api_name: "AppointmentAPI", anomaly_types: ["records_returned_anomaly"], severity: "critical" }, {}, "Old", "fallback");
  const newer = await alertService.saveAlert({ api_name: "BillingAPI", anomaly_types: ["records_returned_anomaly"], severity: "warning" }, {}, "New", "fallback");
  const active = await alertService.saveAlert({ api_name: "BillingAPI", anomaly_types: ["http_status_failure_warning"], severity: "warning" }, {}, "Active", "fallback");
  older.status = "resolved";
  newer.status = "resolved";
  older.updatedAt = new Date("2026-10-20T10:00:00Z");
  newer.updatedAt = new Date("2026-10-22T10:00:00Z");

  await withServer({ alertService }, async (base) => {
    const first = await fetch(`${base}/alerts?status=resolved&limit=1&page=1`);
    const firstBody = await first.json();
    assert.equal(first.status, 200);
    assert.deepEqual(firstBody.alerts.map((item) => item._id), [newer._id]);
    assert.deepEqual(firstBody.pagination, { page: 1, limit: 1, total: 2, total_pages: 2 });

    const second = await fetch(`${base}/alerts?status=resolved&limit=1&page=1&api_name=Appointment&severity=critical`);
    const secondBody = await second.json();
    assert.equal(second.status, 200);
    assert.deepEqual(secondBody.alerts.map((item) => item._id), [older._id]);
    assert.deepEqual(secondBody.pagination, { page: 1, limit: 1, total: 1, total_pages: 1 });

    const activeResponse = await fetch(`${base}/alerts?status=active`);
    const activeBody = await activeResponse.json();
    assert.deepEqual(activeBody.alerts.map((item) => item._id), [active._id]);
  });
});

test("GET /alerts keeps critical alerts ahead across active pages", async () => {
  const alertService = makeMemoryAlertService();
  const warning = await alertService.saveAlert({ api_name: "BillingAPI", anomaly_types: ["records_returned_anomaly"], severity: "warning" }, {}, "Warning", "fallback");
  const critical = await alertService.saveAlert({ api_name: "AppointmentAPI", anomaly_types: ["http_status_failure_critical"], severity: "critical" }, {}, "Critical", "fallback");
  warning.updatedAt = new Date("2026-10-24T12:00:00Z");
  critical.updatedAt = new Date("2026-10-24T11:00:00Z");

  await withServer({ alertService }, async (base) => {
    const response = await fetch(`${base}/alerts?status=active&limit=1&page=1`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).alerts.map((item) => item._id), [critical._id]);
  });
});

test("GET /alerts rejects invalid query values with a consistent 400 error", async () => {
  await withServer({}, async (base) => {
    for (const query of ["status=archived", "limit=51", "limit=0", "page=1.5", "page=9007199254740991", "severity=urgent"]) {
      const response = await fetch(`${base}/alerts?${query}`);
      const body = await response.json();
      assert.equal(response.status, 400, query);
      assert.equal(body.error.code, "INVALID_ALERT_QUERY", query);
      assert.equal(typeof body.error.message, "string", query);
    }
  });
});

test("monitor rate limit returns the standard JSON 429 error", async () => {
  await withServer({ monitorSettings: { monitorRateLimitMax: 1, monitorRateLimitWindowMs: 60000 } }, async (base) => {
    const first = await fetch(`${base}/monitor`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "[]",
    });
    const limited = await fetch(`${base}/monitor`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "[]",
    });
    assert.equal(first.status, 200);
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), {
      error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
    });
    assert.ok(limited.headers.has("ratelimit-limit"));
  });
});

test("Gemini daily cap uses fallback and does not block saving the alert", async () => {
  const alertService = makeMemoryAlertService();
  let providerCalls = 0;
  const llmService = createLlmService({
    client: { models: { async generateContent() { providerCalls += 1; return { text: "must not be called" }; } } },
    apiKey: "test-key",
    model: "mock-model",
    usageService: { async reserveGeminiCall() { return { allowed: false, day: "2026-10-24", logRequired: true }; } },
    findActiveAlert: async () => null,
    logger: quietLogger,
  });

  await withServer({ alertService, llmService }, async (base) => {
    const response = await fetch(`${base}/monitor`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([sample[1]]),
    });
    const summary = await response.json();
    assert.equal(response.status, 200);
    assert.equal(summary.anomalies_created, 1);
    assert.equal(summary.failed_items, 0);
  });

  assert.equal(providerCalls, 0);
  assert.equal(alertService.records.length, 1);
  assert.equal(alertService.records[0].message_source, "fallback");
  assert.match(alertService.records[0].message, /AppointmentAPI/);
});

test("Helmet headers permit the built client assets from the Express server", async () => {
  await withServer({}, async (base) => {
    const page = await fetch(`${base}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
    assert.match(page.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.equal(page.headers.get("x-frame-options"), "SAMEORIGIN");
    const assetPath = html.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(assetPath, "production HTML should point to a built JavaScript asset");
    const asset = await fetch(new URL(assetPath, base));
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /javascript/);
    assert.ok(asset.headers.has("content-security-policy"));
  });
});

test("PATCH resolve succeeds, unknown id is 404, and malformed id is 400", async () => {
  const alertService = makeMemoryAlertService();
  const saved = await alertService.saveAlert({ api_name: "ResolveMe", anomaly_types: ["records_returned_anomaly"], severity: "warning" }, {}, "Resolve me.", "fallback");
  await withServer({ alertService }, async (base) => {
    const resolved = await fetch(`${base}/alerts/${saved._id}/resolve`, { method: "PATCH" });
    assert.equal(resolved.status, 200);
    assert.equal((await resolved.json()).alert.status, "resolved");
    const unknown = await fetch(`${base}/alerts/000000000000000000000099/resolve`, { method: "PATCH" });
    assert.equal(unknown.status, 404);
    const invalid = await fetch(`${base}/alerts/not-an-id/resolve`, { method: "PATCH" });
    assert.equal(invalid.status, 400);
  });
});

test("workspace provisioning sets a secure HTTP-only cookie and reveals keys only by explicit request", async () => {
  const workspaceId = "a".repeat(24);
  const accessKey = "k".repeat(43);
  const workspaceService = {
    async createWorkspace(name) { return { workspace: { _id: workspaceId, name }, accessKey }; },
    async authenticateWorkspace(id, key) { return id === workspaceId && key === accessKey ? { _id: id } : null; },
  };

  await withServer({ workspaceService, monitorSettings: { nodeEnv: "production" } }, async (base) => {
    const invalid = await fetch(`${base}/workspaces`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "  " }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "INVALID_WORKSPACE");

    const created = await fetch(`${base}/workspaces`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Private team" }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), {
      workspace: { id: workspaceId, name: "Private team" },
    });
    const cookie = created.headers.get("set-cookie");
    assert.match(cookie, new RegExp(`workspace_${workspaceId}=${accessKey}`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /Path=\//);

    const cli = await fetch(`${base}/workspaces`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-return-workspace-key": "true" },
      body: JSON.stringify({ name: "CLI team" }),
    });
    assert.equal((await cli.json()).access_key, accessKey);
  });
});

test("workspace monitor CRUD requires its bearer key and scopes every operation", async () => {
  const workspaceId = "a".repeat(24);
  const otherWorkspaceId = "c".repeat(24);
  const monitorId = "b".repeat(24);
  const accessKey = "k".repeat(43);
  const records = [];
  const workspaceService = {
    async createWorkspace() { throw new Error("not used"); },
    async authenticateWorkspace(id, key) { return id === workspaceId && key === accessKey ? { _id: id } : null; },
  };
  const monitorRepository = {
    async create(ownerId, data) {
      const record = { _id: monitorId, workspace_id: ownerId, ...data, createdAt: new Date(), updatedAt: new Date() };
      records.push(record);
      return record;
    },
    async list(ownerId) { return records.filter((record) => record.workspace_id === ownerId); },
    async findById(ownerId, id) { return records.find((record) => record.workspace_id === ownerId && record._id === id) ?? null; },
    async update(ownerId, id, data) {
      const record = records.find((item) => item.workspace_id === ownerId && item._id === id);
      if (!record) return null;
      Object.assign(record, data, { updatedAt: new Date() });
      return record;
    },
    async remove(ownerId, id) {
      const index = records.findIndex((item) => item.workspace_id === ownerId && item._id === id);
      return index < 0 ? null : records.splice(index, 1)[0];
    },
  };
  const publicUrlValidator = async (url) => {
    if (url.includes("private.test")) throw new TypeError("URL host must resolve only to public IP addresses.");
    return new URL(url).toString();
  };
  const path = `/workspaces/${workspaceId}/monitors`;
  const headers = { authorization: `Bearer ${accessKey}`, "content-type": "application/json" };

  await withServer({ workspaceService, monitorRepository, publicUrlValidator }, async (base) => {
    const unauthorized = await fetch(`${base}${path}`);
    assert.equal(unauthorized.status, 401);

    const created = await fetch(`${base}${path}`, {
      method: "POST", headers, body: JSON.stringify({ name: "Public API", url: "https://api.example.org/health" }),
    });
    assert.equal(created.status, 201);
    const monitor = (await created.json()).monitor;
    assert.equal(monitor.workspace_id, workspaceId);

    const invalidMonitors = [
      { name: "x".repeat(101), url: "https://api.example.org" },
      { name: "URL", url: "https://api.example.org", interval_seconds: "60" },
      { name: "URL", url: "https://api.example.org", interval_seconds: 59 },
      { name: "URL", url: "https://api.example.org", timeout_ms: 30001 },
      { name: "URL", url: "https://api.example.org", records_field: "data.__proto__.items" },
      { name: "URL", url: "https://api.example.org", method: "TRACE" },
    ];
    for (const invalidBody of invalidMonitors) {
      const invalid = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(invalidBody) });
      assert.equal(invalid.status, 400, JSON.stringify(invalidBody));
      assert.equal((await invalid.json()).error.code, "INVALID_MONITOR");
    }
    assert.equal(records.length, 1, "invalid monitor definitions are not persisted");

    const listed = await fetch(`${base}${path}`, { headers });
    assert.equal((await listed.json()).monitors.length, 1);
    const cookieListed = await fetch(`${base}${path}`, { headers: { cookie: `workspace_${workspaceId}=${accessKey}` } });
    assert.equal(cookieListed.status, 200, "browser cookie authentication is accepted alongside bearer authentication");

    const fetched = await fetch(`${base}${path}/${monitorId}`, { headers });
    assert.equal((await fetched.json()).monitor.name, "Public API");

    const updated = await fetch(`${base}${path}/${monitorId}`, {
      method: "PATCH", headers, body: JSON.stringify({ name: "Updated API" }),
    });
    assert.equal((await updated.json()).monitor.name, "Updated API");

    const blockedUrl = await fetch(`${base}${path}/${monitorId}`, {
      method: "PATCH", headers, body: JSON.stringify({ url: "http://private.test/" }),
    });
    assert.equal(blockedUrl.status, 400);
    assert.equal((await blockedUrl.json()).error.code, "INVALID_MONITOR");

    const otherWorkspace = await fetch(`${base}/workspaces/${otherWorkspaceId}/monitors/${monitorId}`, { headers });
    assert.equal(otherWorkspace.status, 401);

    const deleted = await fetch(`${base}${path}/${monitorId}`, { method: "DELETE", headers });
    assert.deepEqual(await deleted.json(), { deleted: true, monitor_id: monitorId });
    const missing = await fetch(`${base}${path}/${monitorId}`, { headers });
    assert.equal(missing.status, 404);
  });
});

test("workspace transfer links require a confirmation POST, issue a cookie, expire, and are single use", async () => {
  const workspaceId = "a".repeat(24);
  const initialKey = "i".repeat(43);
  const deviceKey = "d".repeat(43);
  const linkToken = "t".repeat(43);
  let consumed = false;
  const workspaceService = {
    async createWorkspace() { throw new Error("not used"); },
    async authenticateWorkspace(id, key) { return id === workspaceId && key === initialKey ? { _id: id } : null; },
    async addAccessKey(id) { return id === workspaceId ? { workspace: { _id: id }, accessKey: deviceKey } : null; },
  };
  const workspaceAccessLinkService = {
    async create(id, ttlMinutes) {
      assert.equal(id, workspaceId);
      assert.equal(ttlMinutes, 15);
      return { token: linkToken, expiresAt: new Date(Date.now() + 900_000) };
    },
    async consume(id, token) {
      if (id !== workspaceId || token !== linkToken || consumed) return null;
      consumed = true;
      return { workspace_id: id };
    },
  };

  await withServer({ workspaceService, workspaceAccessLinkService }, async (base) => {
    const created = await fetch(`${base}/workspaces/${workspaceId}/access-links`, {
      method: "POST", headers: { authorization: `Bearer ${initialKey}` },
    });
    assert.equal(created.status, 201);
    const link = await created.json();
    const accessUrl = new URL(link.access_link);
    assert.equal(accessUrl.pathname, `/workspaces/${workspaceId}/open`);
    assert.equal(accessUrl.searchParams.get("token"), linkToken);

    const open = await fetch(`${base}${accessUrl.pathname}${accessUrl.search}`);
    assert.equal(open.status, 200);
    assert.match(await open.text(), /method="post" action=/);
    assert.equal(consumed, false, "a link scanner's GET does not consume the one-time token");

    const claim = await fetch(`${base}/workspaces/${workspaceId}/claim`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: linkToken }),
      redirect: "manual",
    });
    assert.equal(claim.status, 303);
    assert.equal(claim.headers.get("location"), "/");
    assert.match(claim.headers.get("set-cookie"), new RegExp(`workspace_${workspaceId}=${deviceKey}`));
    assert.match(claim.headers.get("set-cookie"), /HttpOnly/);

    const repeated = await fetch(`${base}/workspaces/${workspaceId}/claim`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: linkToken }),
    });
    assert.equal(repeated.status, 410);
  });
});

test("workspace and monitor creation limits are configurable and return the standard 429 error", async () => {
  const workspaceId = "a".repeat(24);
  const accessKey = "k".repeat(43);
  const workspaceService = {
    async createWorkspace(name) { return { workspace: { _id: workspaceId, name }, accessKey }; },
    async authenticateWorkspace(id, key) { return id === workspaceId && key === accessKey ? { _id: id } : null; },
  };
  const monitorRepository = {
    async create(_workspaceId, data) { return { _id: "b".repeat(24), ...data }; },
  };

  await withServer({
    workspaceService,
    monitorRepository,
    publicUrlValidator: async (url) => url,
    monitorSettings: {
      workspaceCreateRateLimitMax: 1,
      workspaceCreateRateLimitWindowMs: 60000,
      monitorCreateRateLimitMax: 1,
      monitorCreateRateLimitWindowMs: 60000,
    },
  }, async (base) => {
    const workspaceRequest = () => fetch(`${base}/workspaces`, {
      method: "POST", headers: { "content-type": "application/json", "x-return-workspace-key": "true" },
      body: JSON.stringify({ name: "Rate limited" }),
    });
    assert.equal((await workspaceRequest()).status, 201);
    const blockedWorkspace = await workspaceRequest();
    assert.equal(blockedWorkspace.status, 429);
    assert.equal((await blockedWorkspace.json()).error.code, "RATE_LIMITED");

    const monitorRequest = () => fetch(`${base}/workspaces/${workspaceId}/monitors`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessKey}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "API", url: "https://api.example.org" }),
    });
    assert.equal((await monitorRequest()).status, 201);
    const blockedMonitor = await monitorRequest();
    assert.equal(blockedMonitor.status, 429);
    assert.deepEqual(await blockedMonitor.json(), {
      error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
    });
  });
});

test("POST /monitor enforces the configured maximum batch size", async () => {
  await withServer({ monitorSettings: { maxBatchSize: 1 } }, async (base) => {
    const response = await fetch(`${base}/monitor`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([sample[0], sample[0]]),
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, "BATCH_TOO_LARGE");
  });
});

test("POST /monitor enforces the configured request body size", async () => {
  await withServer({ monitorSettings: { bodyLimit: "1b" } }, async (base) => {
    const response = await fetch(`${base}/monitor`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "[]",
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, "BODY_TOO_LARGE");
  });
});
