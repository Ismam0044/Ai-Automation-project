import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceService } from "../../src/services/workspaceService.js";
import { createMonitorRepository } from "../../src/services/monitorRepository.js";
import { Monitor } from "../../src/models/monitor.js";
import { Workspace } from "../../src/models/workspace.js";

test("workspace and monitor models keep monitor ownership explicit", () => {
  assert.equal(Workspace.schema.path("access_key_hash").options.select, false);
  assert.ok(Workspace.schema.indexes().some(([keys, options]) => keys.access_key_hash === 1 && options.unique));
  assert.equal(Monitor.schema.path("workspace_id").options.ref, "Workspace");
  assert.equal(Monitor.schema.path("workspace_id").isRequired, true);
  assert.ok(Monitor.schema.path("name"));
  assert.ok(Monitor.schema.path("url"));
  assert.ok(Monitor.schema.indexes().some(([keys]) => keys.workspace_id === 1 && keys.updatedAt === -1));
});

test("workspace service returns an unguessable key once and stores only its hash", async () => {
  let saved;
  const model = {
    async create(document) {
      saved = { _id: "a".repeat(24), ...document };
      return { _id: saved._id, name: saved.name };
    },
    findOne(filter) {
      return { select: async () => filter.access_key_hash === saved.access_key_hash && filter._id === saved._id
        ? { _id: saved._id }
        : null };
    },
  };
  const service = createWorkspaceService({ WorkspaceModel: model });
  const { workspace, accessKey } = await service.createWorkspace("Private team");

  assert.equal(workspace.name, "Private team");
  assert.match(accessKey, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(saved.access_key_hash, accessKey);
  assert.deepEqual(await service.authenticateWorkspace(workspace._id, accessKey), { _id: saved._id });
  assert.equal(await service.authenticateWorkspace(workspace._id, "wrong-key"), null);
});

test("monitor repository scopes every CRUD operation to its workspace", async () => {
  const calls = [];
  const model = {
    create: async (document) => { calls.push(["create", document]); return document; },
    find: (filter) => ({ sort: async (sort) => { calls.push(["list", filter, sort]); return []; } }),
    findOne: async (filter) => { calls.push(["get", filter]); return null; },
    findOneAndUpdate: async (filter, update, options) => { calls.push(["update", filter, update, options]); return null; },
    findOneAndDelete: async (filter) => { calls.push(["delete", filter]); return null; },
  };
  const repository = createMonitorRepository({ MonitorModel: model });
  const workspaceId = "a".repeat(24);
  const monitorId = "b".repeat(24);

  await repository.create(workspaceId, { name: "Public API", url: "https://public.example.org" });
  await repository.list(workspaceId);
  await repository.findById(workspaceId, monitorId);
  await repository.update(workspaceId, monitorId, { name: "Renamed" });
  await repository.remove(workspaceId, monitorId);

  assert.deepEqual(calls[0][1].workspace_id, workspaceId);
  assert.deepEqual(calls[1][1], { workspace_id: workspaceId });
  assert.deepEqual(calls[2][1], { _id: monitorId, workspace_id: workspaceId });
  assert.deepEqual(calls[3][1], { _id: monitorId, workspace_id: workspaceId });
  assert.deepEqual(calls[4][1], { _id: monitorId, workspace_id: workspaceId });
});
