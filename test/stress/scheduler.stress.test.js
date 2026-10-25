import assert from "node:assert/strict";
import test from "node:test";
import { createMonitorScheduler } from "../../src/services/monitorScheduler.js";
import { createMonitorCheckBudget } from "../../src/services/monitorCheckBudget.js";
import { createMonitorRepository } from "../../src/services/monitorRepository.js";

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

for (let index = 1; index <= 50; index += 1) {
  test(`stress lease and crash recovery: case ${index}`, async () => {
    let now = new Date(`2026-10-25T00:${String(index % 60).padStart(2, "0")}:00.000Z`);
    const intervalSeconds = 60 + index;
    const leaseMs = 10_000 + index;
    const jitterMs = 1000 + index;
    const jitter = Math.floor(0.5 * jitterMs);
    const state = { _id: `monitor-${index}`, workspace_id: `workspace-${index}`, interval_seconds: intervalSeconds,
      next_check_at: new Date(now.getTime() - 1000), lease_until: null };
    let claims = 0;
    const model = {
      findOne(filter) {
        const due = state.next_check_at <= filter.next_check_at.$lte;
        const available = !state.lease_until || state.lease_until <= filter.$or[2].lease_until.$lte;
        return { sort() { return this; }, lean: async () => due && available ? { ...state } : null };
      },
      async findOneAndUpdate(filter, update) {
        const due = state.next_check_at <= filter.next_check_at.$lte;
        const available = !state.lease_until || state.lease_until <= filter.$or[2].lease_until.$lte;
        if (!due || !available) return null;
        claims += 1;
        Object.assign(state, update.$set);
        return { ...state };
      },
    };
    const repository = createMonitorRepository({ MonitorModel: model });
    const first = await repository.claimDueForWorkspace(state.workspace_id, { now, leaseMs, jitterMs, random: () => 0.5 });
    assert.equal(first._id, state._id);
    assert.equal(claims, 1);
    assert.equal(state.lease_until.getTime(), now.getTime() + leaseMs);
    assert.equal(state.next_check_at.getTime(), now.getTime() + intervalSeconds * 1000 + jitter);
    assert.equal(await repository.claimDueForWorkspace(state.workspace_id, { now, leaseMs, jitterMs, random: () => 0.5 }), null);
    now = new Date(state.next_check_at.getTime() - 1);
    assert.equal(await repository.claimDueForWorkspace(state.workspace_id, { now, leaseMs, jitterMs, random: () => 0.5 }), null);
    // A worker crash leaves the lease until its expiry; the monitor becomes claimable once due.
    now = new Date(state.lease_until.getTime() + intervalSeconds * 1000 + jitter + 1);
    const recovered = await repository.claimDueForWorkspace(state.workspace_id, { now, leaseMs, jitterMs, random: () => 0.5 });
    assert.equal(recovered._id, state._id);
    assert.equal(claims, 2);
  });
}
