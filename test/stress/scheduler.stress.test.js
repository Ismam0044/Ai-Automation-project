import assert from "node:assert/strict";
import test from "node:test";
import { createMonitorScheduler } from "../../src/services/monitorScheduler.js";
import { createMonitorCheckBudget } from "../../src/services/monitorCheckBudget.js";

const cases = Array.from({ length: 50 }, (_, index) => ({
  name: `workspaces ${index % 9 + 1}, budget ${index % 7 + 1}, case ${index + 1}`,
  workspaceCount: index % 9 + 1,
  budget: index % 7 + 1,
  concurrency: index % 5 + 1,
  expected: Math.min(index % 9 + 1, index % 7 + 1),
}));
for (const entry of cases) {
  test(`stress scheduler claim and budget: ${entry.name}`, async () => {
    const seen = new Set();
    const releases = [];
    let completed = 0;
    const remaining = new Map(Array.from({ length: entry.workspaceCount }, (_, i) => [`w${i}`, 1]));
    const repo = {
      async dueWorkspaceIds() { return [...remaining].filter(([, count]) => count > 0).map(([id]) => id); },
      async claimDueForWorkspace(workspaceId, options) {
        assert.ok(options.leaseMs > 0);
        assert.ok(options.jitterMs >= 0);
        if (!remaining.get(workspaceId)) return null;
        remaining.set(workspaceId, 0);
        const id = `monitor-${workspaceId}`;
        assert.equal(seen.has(id), false, "a monitor is claimed no more than once");
        seen.add(id);
        return { _id: id, workspace_id: workspaceId };
      },
      async releaseLease(workspaceId, monitorId) { releases.push(`${workspaceId}:${monitorId}`); },
    };
    const scheduler = createMonitorScheduler({
      monitorRepository: repo,
      monitorCheckService: { async run() { completed += 1; } },
      checkBudget: createMonitorCheckBudget({ maxPerMinute: entry.budget }),
      concurrency: entry.concurrency,
      jitterMs: entry.name.length,
      logger: { info() {}, warn() {}, error() {} },
    });
    assert.equal(await scheduler.runDueOnce(), entry.expected);
    assert.equal(completed, entry.expected);
    assert.equal(releases.length, entry.expected);
    assert.equal(seen.size, entry.expected);
    assert.equal(await scheduler.runDueOnce(), 0);
  });
}
