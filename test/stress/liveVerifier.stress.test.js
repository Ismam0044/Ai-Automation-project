import assert from "node:assert/strict";
import test from "node:test";
import { createStressClient, evaluateHttp, safeScenarioEvidence } from "../../scripts/verify/stress.js";

for (let index = 1; index <= 50; index += 1) {
  test(`stress live-verifier helper: mock fetch scenario ${index}`, async () => {
    let captured;
    const client = createStressClient(async (url, options) => {
      captured = { url: String(url), options };
      return { status: 200 + (index % 5), ok: true, async json() { return { scenario: index }; } };
    });
    const body = { index, fields: ["only synthetic data"] };
    const result = await client(`/health?case=${index}`, { method: "POST", body });
    assert.equal(captured.url, `http://localhost:3000/health?case=${index}`);
    assert.equal(captured.options.headers["content-type"], "application/json");
    assert.equal(captured.options.body, JSON.stringify(body));
    assert.deepEqual(result, { status: 200 + (index % 5), ok: true, payload: { scenario: index } });
    assert.equal(evaluateHttp(result, 200 + (index % 5), (payload) => payload.scenario === index), true);
    assert.deepEqual(safeScenarioEvidence(result.status, result.status, `case ${index}`), {
      status: "Pass", evidence: `HTTP ${result.status}; case ${index}`,
    });
  });
}

test("stress live-verifier helper refuses non-loopback bases and cross-origin routes", async () => {
  assert.throws(() => createStressClient(async () => {}, "https://example.com"), /loopback/);
  const request = createStressClient(async () => assert.fail("fetch must not run"));
  await assert.rejects(request("//example.com/"), /same-origin/);
});
