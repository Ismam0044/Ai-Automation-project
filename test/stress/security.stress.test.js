import assert from "node:assert/strict";
import test from "node:test";
import { createCookieOriginGuard } from "../../src/middleware/cookieOriginGuard.js";
import { createWorkspaceAuth } from "../../src/middleware/workspaceAuth.js";

const workspaceId = "0123456789abcdef01234567";
const cookie = `workspace_${workspaceId}=${"k".repeat(43)}`;
const origins = [
  ["same configured origin", "https://status.example.org", true],
  ["local dev client", "http://localhost:5173", true],
  ["local dev same host", "http://localhost:3000", true],
  ["missing origin", null, false], ["malformed origin", "not-an-origin", false],
  ...Array.from({ length: 46 }, (_, index) => [`foreign origin ${index + 1}`, `https://attacker-${index + 1}.example.net`, false]),
];
for (const [name, origin, allowed] of origins) {
  test(`stress cookie Origin guard: ${name}`, () => {
    const guard = createCookieOriginGuard({ nodeEnv: "development", publicAppUrl: "https://status.example.org" });
    const request = { method: "POST", get(header) {
      return header === "cookie" ? cookie : header === "origin" ? origin : header === "host" ? "localhost:3000" : undefined;
    } };
    let error;
    guard(request, {}, (value) => { error = value; });
    assert.equal(error === undefined, allowed);
    if (!allowed) assert.equal(error.statusCode, 403);
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
