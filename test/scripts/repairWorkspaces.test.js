import assert from "node:assert/strict";
import test from "node:test";
import { inspectOrphanedWorkspaces } from "../../scripts/repair-workspaces.js";

test("workspace repair reports hashless workspaces and monitor counts without printing hashes", async () => {
  const lines = [];
  let query;
  const rows = [{ _id: "workspace-one", access_key_hash: "DO_NOT_PRINT" }, { _id: "workspace-two" }];
  const report = await inspectOrphanedWorkspaces({
    WorkspaceModel: {
      find(filter) {
        query = filter;
        return { select() { return this; }, async lean() { return rows.map(({ _id }) => ({ _id })); } };
      },
    },
    MonitorModel: { async countDocuments(filter) { return filter.workspace_id === "workspace-one" ? 2 : 0; } },
    write: (line) => lines.push(line),
  });
  assert.deepEqual(query, { $or: [{ access_key_hash: { $not: { $type: "string" } } }, { access_key_hash: "" }] });
  assert.deepEqual(report, [
    { workspace_id: "workspace-one", monitor_count: 2, deleted: false },
    { workspace_id: "workspace-two", monitor_count: 0, deleted: false },
  ]);
  assert.deepEqual(lines, [
    "workspace_id=workspace-one monitors=2 kept",
    "workspace_id=workspace-two monitors=0 kept",
  ]);
  assert.doesNotMatch(lines.join(" "), /DO_NOT_PRINT|hash=/i);
});

test("workspace repair deletes only hashless workspaces with no monitors", async () => {
  const deletedFilters = [];
  const report = await inspectOrphanedWorkspaces({
    WorkspaceModel: {
      find() { return { select() { return this; }, async lean() { return [{ _id: "has-monitors" }, { _id: "empty-orphan" }]; } }; },
      async deleteOne(filter) { deletedFilters.push(filter); return { deletedCount: 1 }; },
    },
    MonitorModel: { async countDocuments(filter) { return filter.workspace_id === "has-monitors" ? 1 : 0; } },
    deleteOrphans: true,
    write() {},
  });
  assert.equal(report[0].deleted, false);
  assert.equal(report[1].deleted, true);
  assert.equal(deletedFilters.length, 1);
  assert.equal(deletedFilters[0]._id, "empty-orphan");
  assert.deepEqual(deletedFilters[0].$and[1], { $or: [{ monitor_count: 0 }, { monitor_count: { $exists: false } }] });
});
