import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspacePurgeService } from "../../src/services/workspacePurgeService.js";

test("workspace purge removes inactive workspaces, their monitors and links, then reconciles caps", async () => {
  const inactive = { _id: "a".repeat(24), last_active_at: new Date("2026-07-20T00:00:00Z") };
  const active = { _id: "b".repeat(24), last_active_at: new Date("2026-10-23T00:00:00Z") };
  const deletedChildren = [];
  let reconciled = false;
  const workspaces = {
    async findOneAndDelete(filter) {
      assert.equal(filter._id, inactive._id);
      return inactive;
    },
    find(filter) {
      if (filter.$or) return { select: () => ({ lean: async () => [inactive] }) };
      return { select: () => ({ lean: async () => [active] }) };
    },
  };
  const monitors = {
    async deleteMany(filter) { deletedChildren.push(["monitors", filter]); return { deletedCount: 1 }; },
  };
  const links = {
    async deleteMany(filter) { deletedChildren.push(["links", filter]); return { deletedCount: 2 }; },
  };
  const purge = createWorkspacePurgeService({
    WorkspaceModel: workspaces,
    MonitorModel: monitors,
    LinkModel: links,
    monitorRepository: { async reconcileCounters() { reconciled = true; } },
    clock: () => new Date("2026-10-24T00:00:00Z"),
  });

  assert.equal(await purge.purgeInactiveWorkspaces(90), 1);
  assert.deepEqual(deletedChildren, [
    ["monitors", { workspace_id: inactive._id }],
    ["links", { workspace_id: inactive._id }],
    ["monitors", { workspace_id: { $nin: [active._id] } }],
    ["links", { workspace_id: { $nin: [active._id] } }],
  ]);
  assert.equal(reconciled, true);
});
