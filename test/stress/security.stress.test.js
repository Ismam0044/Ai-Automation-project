import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createCookieOriginGuard } from "../../src/middleware/cookieOriginGuard.js";
import { createWorkspaceAuth } from "../../src/middleware/workspaceAuth.js";
import { createWorkspaceController } from "../../src/controllers/workspaceController.js";
import { createWorkspaceService } from "../../src/services/workspaceService.js";
import { createWorkspaceAccessLinkService } from "../../src/services/workspaceAccessLinkService.js";
import { createRateLimiters } from "../../src/middleware/rateLimits.js";

const workspaceId = "0123456789abcdef01234567";
const cookie = `workspace_${workspaceId}=${"k".repeat(43)}`;
const origins = [
  ["same configured origin", "https://status.example.org", true],
  ["local dev client", "http://localhost:5173", true],
  ["local dev same host", "http://localhost:3000", true],
  ["missing origin", null, false], ["malformed origin", "not-an-origin", false],
  ...Array.from({ length: 46 }, (_, index) => [`foreign origin ${index + 1}`, `https://attacker-${index + 1}.example.net`, false]),
];
for (const [index, [name, origin, allowed]] of origins.entries()) {
  test(`stress cookie Origin guard: ${name}`, () => {
    const guard = createCookieOriginGuard({ nodeEnv: "development", publicAppUrl: "https://status.example.org" });
    const method = ["POST", "PATCH", "DELETE"][index % 3];
    const request = { method, get(header) {
      return header === "cookie" ? cookie : header === "origin" ? origin : header === "host" ? "localhost:3000" : undefined;
    } };
    let error;
    guard(request, {}, (value) => { error = value; });
    assert.equal(error === undefined, allowed);
    if (!allowed) assert.equal(error.statusCode, 403);
  });
}

for (let index = 1; index <= 50; index += 1) {
  test(`stress workspace cookie flags: case ${index}`, async () => {
    const workspaceId = String(index).padStart(24, "0");
    const accessKey = `key${String(index).padStart(40, "x")}`;
    const secure = index % 2 === 0;
    const controller = createWorkspaceController({
      async createWorkspace(name) { return { workspace: { _id: workspaceId, name }, accessKey }; },
    }, { secureCookies: secure });
    const cookies = [];
    let body;
    const response = {
      append(name, value) { if (name.toLowerCase() === "set-cookie") cookies.push(value); },
      status(code) { assert.equal(code, 201); return this; },
      json(value) { body = value; return this; },
    };
    await controller.create({ body: { name: `Workspace ${index}` }, get() { return undefined; } }, response, (error) => { throw error; });
    assert.deepEqual(body, { workspace: { id: workspaceId, name: `Workspace ${index}` } });
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every((value) => value.includes("HttpOnly") && value.includes("SameSite=Lax") && value.includes("Path=/")));
    assert.equal(cookies.every((value) => value.includes("Secure")), secure);
  });
}

for (let index = 0; index < 50; index += 1) {
  test(`stress workspace auth: invalid bearer shape ${index + 1}`, async () => {
    let passed = false;
    const middleware = createWorkspaceAuth({ async authenticateWorkspace() { passed = true; return { _id: workspaceId }; } });
    const invalidToken = `${"x".repeat(index % 43)}!${"y".repeat(42 - (index % 43))}`;
    const request = { params: { workspaceId }, get(name) { return name === "authorization" ? `Bearer ${invalidToken}` : ""; } };
    let error;
    await new Promise((resolve) => middleware(request, {}, (value) => { error = value; resolve(); }));
    assert.equal(passed, false);
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "WORKSPACE_ACCESS_REQUIRED");
  });
}

for (let index = 1; index <= 50; index += 1) {
  test(`stress workspace hashed key comparison: case ${index}`, async () => {
    const workspaceId = String(index).padStart(24, "0");
    const accessKey = `workspace-key-${String(index).padStart(32, "x")}`;
    const hash = createHash("sha256").update(accessKey).digest("hex");
    const workspace = { _id: workspaceId, access_key_hashes: [hash] };
    const model = {
      findById() { return { select: async () => workspace }; },
      findOneAndUpdate(filter) { return { select: async () => filter.access_key_hashes === hash ? { _id: workspaceId, name: "private" } : null }; },
    };
    const service = createWorkspaceService({ WorkspaceModel: model });
    const correct = await service.authenticateWorkspace(workspaceId, accessKey);
    const incorrect = await service.authenticateWorkspace(workspaceId, `${accessKey}x`);
    assert.deepEqual(correct, { _id: workspaceId, name: "private" });
    assert.equal(incorrect, null);
    assert.equal(workspace.access_key_hashes[0], hash);
    assert.notEqual(workspace.access_key_hashes[0], accessKey);
  });
}

for (let index = 1; index <= 50; index += 1) {
  test(`stress workspace link expiry and single use: case ${index}`, async () => {
    let now = new Date("2026-10-25T00:00:00.000Z");
    let saved;
    const linkModel = {
      async create(document) { saved = { ...document }; },
      async findOneAndUpdate(filter, update) {
        if (!saved || saved.workspace_id !== filter.workspace_id || saved.token_hash !== filter.token_hash
            || saved.consumed_at !== null || saved.expires_at <= filter.expires_at.$gt) return null;
        Object.assign(saved, update.$set);
        return { ...saved };
      },
    };
    const service = createWorkspaceAccessLinkService({ LinkModel: linkModel, clock: () => now });
    const minutes = index % 60 + 1;
    const { token, expiresAt } = await service.create(`workspace-${index}`, minutes);
    assert.equal(expiresAt.getTime(), now.getTime() + minutes * 60_000);
    assert.notEqual(saved.token_hash, token);
    if (index % 2 === 0) now = new Date(expiresAt.getTime() + 1);
    const first = await service.consume(`workspace-${index}`, token);
    const expected = index % 2 === 0 ? null : saved;
    assert.equal(first === null, expected === null);
    if (expected) assert.ok(first.consumed_at instanceof Date);
    assert.equal(await service.consume(`workspace-${index}`, token), null);
  });
}

for (let limit = 1; limit <= 50; limit += 1) {
  test(`stress workspace scoped rate limit: limit ${limit}`, () => {
    const limiters = createRateLimiters({
      monitorRateLimitWindowMs: 60_000, monitorRateLimitMax: 10,
      apiRateLimitWindowMs: 60_000, apiRateLimitMax: 100,
      workspaceCreateRateLimitWindowMs: 60_000, workspaceCreateRateLimitMax: 5,
      monitorCreateRateLimitWindowMs: 60_000, monitorCreateRateLimitMax: 30,
      checkNowWorkspaceWindowMs: 60_000, checkNowWorkspaceMax: limit,
      checkNowMonitorWindowMs: 60_000, checkNowMonitorMax: limit,
    });
    let passed = 0;
    let responseStatus;
    let responseBody;
    const request = { workspaceId: `workspace-${limit}`, params: { monitorId: `monitor-${limit}` } };
    const response = { status(code) { responseStatus = code; return this; }, json(body) { responseBody = body; return this; } };
    for (let index = 0; index < limit; index += 1) limiters.checkNowWorkspace(request, response, () => { passed += 1; });
    limiters.checkNowWorkspace(request, response, () => { passed += 1; });
    assert.equal(passed, limit);
    assert.equal(responseStatus, 429);
    assert.deepEqual(responseBody, { error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } });
  });
}
