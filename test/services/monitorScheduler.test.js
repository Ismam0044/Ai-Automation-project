import assert from "node:assert/strict";
import test from "node:test";
import { createMonitorScheduler } from "../../src/services/monitorScheduler.js";
import { createMonitorRepository } from "../../src/services/monitorRepository.js";
import { createMonitorCheckBudget } from "../../src/services/monitorCheckBudget.js";

const quietLogger = { error() {}, info() {}, warn() {} };

test("monitor scheduler rotates due workspaces and honors its global per-minute cap", async () => {
  let now = new Date("2026-10-24T00:00:00Z");
  const claimedWorkspaces = [];
  const repository = {
    async dueWorkspaceIds() { return ["w1", "w2", "w3"]; },
    async claimDueForWorkspace(workspaceId) { claimedWorkspaces.push(workspaceId); return { _id: workspaceId, workspace_id: workspaceId }; },
    async releaseLease() {},
  };
  const scheduler = createMonitorScheduler({
    monitorRepository: repository,
    monitorCheckService: { async run() {} },
    concurrency: 2,
    checkBudget: createMonitorCheckBudget({ maxPerMinute: 2, clock: () => now.getTime() }),
    clock: () => now,
    logger: quietLogger,
  });
  assert.equal(await scheduler.runDueOnce(), 2);
  assert.equal(await scheduler.runDueOnce(), 0, "the per-minute cap stops more outgoing work");
  now = new Date(now.getTime() + 60_001);
  assert.equal(await scheduler.runDueOnce(), 2);
  assert.deepEqual(claimedWorkspaces, ["w1", "w2", "w3", "w1"]);
});

test("monitor scheduler ignores overlapping ticks while a claimed check is running", async () => {
  let finish;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let claimed = false;
  const repo = {
    async dueWorkspaceIds() { return ["w1"]; },
    async claimDueForWorkspace(workspaceId) {
      if (claimed) return null;
      claimed = true;
      return { _id: "m1", workspace_id: workspaceId };
    },
    async releaseLease() {},
  };
  const scheduler = createMonitorScheduler({
    monitorRepository: repo,
    monitorCheckService: { run() { entered(); return new Promise((resolve) => { finish = resolve; }); } },
    logger: quietLogger,
  });
  const first = scheduler.runDueOnce();
  await started;
  assert.equal(await scheduler.runDueOnce(), 0);
  finish();
  assert.equal(await first, 1);
});

test("stopping the scheduler waits for an in-progress check to finish", async () => {
  let finish;
  let entered;
  let claimed = false;
  const started = new Promise((resolve) => { entered = resolve; });
  const scheduler = createMonitorScheduler({
    monitorRepository: {
      async dueWorkspaceIds() { return ["w1"]; },
      async claimDueForWorkspace(workspaceId) {
        if (claimed) return null;
        claimed = true;
        return { _id: "m1", workspace_id: workspaceId };
      },
      async releaseLease() {},
    },
    monitorCheckService: { run() { entered(); return new Promise((resolve) => { finish = resolve; }); } },
    logger: quietLogger,
  });
  const run = scheduler.runDueOnce();
  await started;
  let stopped = false;
  const stopping = scheduler.stop().then(() => { stopped = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(stopped, false);
  finish();
  await Promise.all([run, stopping]);
  assert.equal(stopped, true);
});

test("repository claims a due monitor atomically and excludes an active lease", async () => {
  const now = new Date("2026-10-24T00:00:00Z");
  let claimed = false;
  const updates = [];
  const model = {
    findOne(filter) {
      assert.equal(filter.paused.$ne, true);
      return { sort: () => ({ lean: async () => ({ _id: "m1", workspace_id: "w1", interval_seconds: 60 }) }) };
    },
    async findOneAndUpdate(filter, update) {
      updates.push([filter, update]);
      if (claimed) return null;
      claimed = true;
      return { _id: "m1" };
    },
  };
  const repository = createMonitorRepository({ MonitorModel: model });
  const options = { now, leaseMs: 10_000, jitterMs: 0 };
  assert.ok(await repository.claimDueForWorkspace("w1", options));
  assert.equal(await repository.claimDueForWorkspace("w1", options), null);
  assert.equal(updates.length, 2);
  assert.equal(updates[0][0]._id, "m1");
  assert.ok(updates[0][0].next_check_at.$lte);
  assert.equal(updates[0][1].$set.lease_until.getTime(), now.getTime() + 10_000);
  assert.equal(updates[0][1].$set.next_check_at.getTime(), now.getTime() + 60_000);
});
