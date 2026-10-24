import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceService } from "../../src/services/workspaceService.js";
import { createMonitorRepository } from "../../src/services/monitorRepository.js";
import { Monitor } from "../../src/models/monitor.js";
import { Workspace } from "../../src/models/workspace.js";

test("workspace and monitor models keep monitor ownership explicit", () => {
  assert.equal(Workspace.schema.path("access_key_hashes").options.select, false);
  assert.equal(Monitor.schema.path("workspace_id").options.ref, "Workspace");
  assert.equal(Monitor.schema.path("workspace_id").isRequired, true);
  assert.ok(Monitor.schema.path("name"));
  assert.ok(Monitor.schema.path("url"));
  assert.equal(Monitor.schema.path("interval_seconds").options.min, 60);
  assert.equal(Monitor.schema.path("timeout_ms").options.max, 30000);
  assert.equal(Monitor.schema.path("method").options.enum.includes("GET"), true);
  assert.ok(Monitor.schema.indexes().some(([keys]) => keys.workspace_id === 1 && keys.updatedAt === -1));
});

test("monitor schema rejects out-of-range intervals, timeouts, names, methods, URLs, and unsafe record paths", () => {
  const valid = {
    workspace_id: new Workspace()._id,
    name: "Health API",
    url: "https://api.example.org/health",
  };
  const invalidCases = [
    [{ ...valid, interval_seconds: 59 }, "interval_seconds"],
    [{ ...valid, interval_seconds: 60.5 }, "interval_seconds"],
    [{ ...valid, timeout_ms: 30001 }, "timeout_ms"],
    [{ ...valid, timeout_ms: 100.5 }, "timeout_ms"],
    [{ ...valid, name: "x".repeat(101) }, "name"],
    [{ ...valid, method: "TRACE" }, "method"],
    [{ ...valid, url: "file:///etc/passwd" }, "url"],
    [{ ...valid, records_field: "data.__proto__.items" }, "records_field"],
  ];
  for (const [data, field] of invalidCases) {
    const error = new Monitor(data).validateSync();
    assert.ok(error?.errors[field], `expected a schema error for ${field}`);
  }
});

test("workspace service returns an unguessable key once and stores only its hash", async () => {
  let saved;
  const model = {
    async create(document) {
      saved = { _id: "a".repeat(24), ...document };
      return { _id: saved._id, name: saved.name };
    },
    findById() {
      return { select: async () => ({ _id: saved._id, access_key_hashes: saved.access_key_hashes }) };
    },
    findOneAndUpdate(filter) {
      return { select: async () => filter.access_key_hashes === saved.access_key_hashes[0]
        ? { _id: saved._id }
        : null };
    },
  };
  const service = createWorkspaceService({ WorkspaceModel: model });
  const { workspace, accessKey } = await service.createWorkspace("Private team");

  assert.equal(workspace.name, "Private team");
  assert.match(accessKey, /^[A-Za-z0-9_-]{43}$/);
  assert.notDeepEqual(saved.access_key_hashes, [accessKey]);
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
  const workspaceModel = {
    findOneAndUpdate: async (filter, update, options) => { calls.push(["workspace-update", filter, update, options]); return { _id: "a".repeat(24) }; },
    exists: async () => true,
  };
  const capacityModel = {
    findOneAndUpdate: async (filter, update, options) => { calls.push(["capacity-update", filter, update, options]); return { _id: "global", count: 1 }; },
  };
  const repository = createMonitorRepository({ MonitorModel: model, WorkspaceModel: workspaceModel, CapacityModel: capacityModel });
  const workspaceId = "a".repeat(24);
  const monitorId = "b".repeat(24);

  await repository.create(workspaceId, { name: "Public API", url: "https://public.example.org" });
  await repository.list(workspaceId);
  await repository.findById(workspaceId, monitorId);
  await repository.update(workspaceId, monitorId, { name: "Renamed" });
  await repository.remove(workspaceId, monitorId);

  assert.deepEqual(calls.find(([kind]) => kind === "create")[1].workspace_id, workspaceId);
  assert.deepEqual(calls.find(([kind]) => kind === "list")[1], { workspace_id: workspaceId });
  assert.deepEqual(calls.find(([kind]) => kind === "get")[1], { _id: monitorId, workspace_id: workspaceId });
  assert.deepEqual(calls.find(([kind]) => kind === "update")[1], { _id: monitorId, workspace_id: workspaceId });
  assert.deepEqual(calls.find(([kind]) => kind === "delete")[1], { _id: monitorId, workspace_id: workspaceId });
});

test("monitor repository enforces per-workspace and total monitor caps", async () => {
  const workspaceCounts = new Map();
  let total = 0;
  const saved = [];
  const workspaceModel = {
    async findOneAndUpdate(filter, update) {
      const id = String(filter._id);
      const current = workspaceCounts.get(id) ?? 0;
      const change = update.$inc.monitor_count;
      if (change > 0 && current >= 1) return null;
      workspaceCounts.set(id, current + change);
      return { _id: id };
    },
    async exists() { return true; },
  };
  const capacityModel = {
    async findOneAndUpdate(_filter, update) {
      const change = update.$inc.count;
      if (change > 0 && total >= 1) return null;
      total += change;
      return { _id: "global", count: total };
    },
  };
  const monitorModel = {
    async create(document) { saved.push(document); return document; },
  };
  const repository = createMonitorRepository({
    MonitorModel: monitorModel,
    WorkspaceModel: workspaceModel,
    CapacityModel: capacityModel,
    maxMonitorsPerWorkspace: 1,
    maxTotalMonitors: 1,
  });

  await repository.create("workspace-a", { name: "one", url: "https://one.example.org" });
  await assert.rejects(repository.create("workspace-a", { name: "two", url: "https://two.example.org" }), { code: "MONITOR_LIMIT_REACHED" });
  await assert.rejects(repository.create("workspace-b", { name: "two", url: "https://two.example.org" }), { code: "MONITOR_LIMIT_REACHED" });
  assert.equal(saved.length, 1);
  assert.equal(total, 1);
  assert.equal(workspaceCounts.get("workspace-b"), 0, "failed total-cap reservation releases the workspace counter");
});
