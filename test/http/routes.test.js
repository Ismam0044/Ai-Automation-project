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
  const keyFor = (detection) => `${detection.api_name ?? "unknown"}|${[...detection.anomaly_types].sort().join("|")}`;
  return {
    records,
    async findActiveAlertForDetection(detection) {
      return records.find((record) => record.status === "active" && record.dedupe_key === keyFor(detection)) ?? null;
    },
    async saveAlert(detection, inputSnapshot, message, messageSource) {
      const existing = await this.findActiveAlertForDetection(detection);
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
        input_snapshot: inputSnapshot,
        status: "active",
        dedupe_key: keyFor(detection),
        occurrence_count: 1,
        createdAt: now,
        updatedAt: now,
      };
      records.push(record);
      return record;
    },
    async listActiveAlerts() {
      return records.filter((record) => record.status === "active")
        .sort((left, right) => right.createdAt - left.createdAt);
    },
    async listAlerts({ status, page, limit, apiName, severity }) {
      const search = apiName ? apiName.toLowerCase() : "";
      const matchingStatus = records.filter((record) => record.status === status
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
    async resolveAlertById(id) {
      const record = records.find((item) => item._id === id && item.status === "active");
      if (record) {
        record.status = "resolved";
        record.updatedAt = new Date();
      }
      return record ?? null;
    },
  };
}

async function withServer(options, run) {
  const app = createApp({ appLogger: quietLogger, logRequests: false, ...options });
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

test("workspace provisioning returns a bearer key once and validates the workspace name", async () => {
  const workspaceId = "a".repeat(24);
  const accessKey = "k".repeat(43);
  const workspaceService = {
    async createWorkspace(name) { return { workspace: { _id: workspaceId, name }, accessKey }; },
    async authenticateWorkspace(id, key) { return id === workspaceId && key === accessKey ? { _id: id } : null; },
  };

  await withServer({ workspaceService }, async (base) => {
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
      access_key: accessKey,
    });
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

    const listed = await fetch(`${base}${path}`, { headers });
    assert.equal((await listed.json()).monitors.length, 1);

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
