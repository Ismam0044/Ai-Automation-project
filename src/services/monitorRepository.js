import { Monitor } from "../models/monitor.js";
import { MonitorCapacity } from "../models/monitorCapacity.js";
import { Workspace } from "../models/workspace.js";
import { createHttpError } from "../middleware/httpError.js";

function limitError(message) {
  return createHttpError(429, "MONITOR_LIMIT_REACHED", message);
}

function isDuplicateKey(error) {
  return error?.code === 11000;
}

export function createMonitorRepository({
  MonitorModel = Monitor,
  WorkspaceModel = Workspace,
  CapacityModel = MonitorCapacity,
  maxMonitorsPerWorkspace = 50,
  maxTotalMonitors = 1000,
} = {}) {
  async function reserveGlobalCapacity() {
    const filter = { _id: "global", count: { $lt: maxTotalMonitors } };
    const update = { $inc: { count: 1 } };
    try {
      return await CapacityModel.findOneAndUpdate(filter, update, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: false,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return CapacityModel.findOneAndUpdate(filter, update, { new: true });
    }
  }

  async function decrementGlobalCapacity() {
    await CapacityModel.findOneAndUpdate(
      { _id: "global", count: { $gt: 0 } },
      { $inc: { count: -1 } },
      { new: true },
    );
  }

  async function releaseWorkspaceCapacity(workspaceId) {
    await WorkspaceModel.findOneAndUpdate(
      { _id: workspaceId, monitor_count: { $gt: 0 } },
      { $inc: { monitor_count: -1 } },
      { new: true },
    );
  }

  async function create(workspaceId, data) {
    const workspace = await WorkspaceModel.findOneAndUpdate(
      {
        _id: workspaceId,
        $or: [{ monitor_count: { $lt: maxMonitorsPerWorkspace } }, { monitor_count: { $exists: false } }],
      },
      { $inc: { monitor_count: 1 } },
      { new: true },
    );
    if (!workspace) {
      const exists = await WorkspaceModel.exists({ _id: workspaceId });
      if (!exists) throw createHttpError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found.");
      throw limitError("This workspace has reached its monitor limit.");
    }

    let globalCapacity;
    try {
      globalCapacity = await reserveGlobalCapacity();
    } catch (error) {
      await releaseWorkspaceCapacity(workspaceId);
      throw error;
    }
    if (!globalCapacity) {
      await releaseWorkspaceCapacity(workspaceId);
      throw limitError("The application has reached its total monitor limit.");
    }

    try {
      return await MonitorModel.create({ workspace_id: workspaceId, ...data });
    } catch (error) {
      await Promise.all([releaseWorkspaceCapacity(workspaceId), decrementGlobalCapacity()]);
      throw error;
    }
  }

  async function remove(workspaceId, monitorId) {
    const monitor = await MonitorModel.findOneAndDelete({ _id: monitorId, workspace_id: workspaceId });
    if (monitor) {
      await Promise.all([releaseWorkspaceCapacity(workspaceId), decrementGlobalCapacity()]);
    }
    return monitor;
  }

  function dueFilter(now = new Date()) {
    return {
      paused: { $ne: true },
      next_check_at: { $lte: now },
      $or: [{ lease_until: null }, { lease_until: { $exists: false } }, { lease_until: { $lte: now } }],
    };
  }

  async function claimCandidate(filter, { now, leaseMs, jitterMs, random = Math.random } = {}) {
    const candidate = await MonitorModel.findOne(filter).sort({ next_check_at: 1, _id: 1 }).lean();
    if (!candidate) return null;
    const jitter = Math.floor(Math.max(0, Math.min(0.999999, random())) * Math.max(0, jitterMs));
    const nextCheckAt = new Date(now.getTime() + candidate.interval_seconds * 1000 + jitter);
    return MonitorModel.findOneAndUpdate(
      { _id: candidate._id, ...filter },
      { $set: { lease_until: new Date(now.getTime() + leaseMs), next_check_at: nextCheckAt } },
      { new: true },
    );
  }

  async function claimDueForWorkspace(workspaceId, options = { now: new Date(), leaseMs: 30_000, jitterMs: 0 }) {
    return claimCandidate({ workspace_id: workspaceId, ...dueFilter(options.now) }, options);
  }

  async function claimById(workspaceId, monitorId, { now = new Date(), leaseMs = 30_000 } = {}) {
    return MonitorModel.findOneAndUpdate(
      {
        _id: monitorId,
        workspace_id: workspaceId,
        paused: { $ne: true },
        $or: [{ lease_until: null }, { lease_until: { $exists: false } }, { lease_until: { $lte: now } }],
      },
      { $set: { lease_until: new Date(now.getTime() + leaseMs) } },
      { new: true },
    );
  }

  async function dueWorkspaceIds(now = new Date()) {
    const rows = await MonitorModel.aggregate([
      { $match: dueFilter(now) },
      { $group: { _id: "$workspace_id", next_due: { $min: "$next_check_at" } } },
      { $sort: { next_due: 1, _id: 1 } },
    ]);
    return rows.map((row) => row._id);
  }

  async function releaseLease(workspaceId, monitorId) {
    return MonitorModel.updateOne({ _id: monitorId, workspace_id: workspaceId }, { $set: { lease_until: null } });
  }

  async function scheduleNextCheck(workspaceId, monitorId, { now = new Date(), intervalSeconds = 300 } = {}) {
    return MonitorModel.updateOne(
      { _id: monitorId, workspace_id: workspaceId },
      { $set: { next_check_at: new Date(now.getTime() + intervalSeconds * 1000) } },
    );
  }

  async function incrementHealthyCount(workspaceId, monitorId) {
    return MonitorModel.findOneAndUpdate(
      { _id: monitorId, workspace_id: workspaceId },
      { $inc: { consecutive_healthy_checks: 1 } },
      { new: true },
    );
  }

  async function resetHealthyCount(workspaceId, monitorId) {
    return MonitorModel.updateOne(
      { _id: monitorId, workspace_id: workspaceId },
      { $set: { consecutive_healthy_checks: 0 } },
    );
  }

  return {
    create,
    list(workspaceId) {
      return MonitorModel.find({ workspace_id: workspaceId }).sort({ updatedAt: -1 });
    },
    findById(workspaceId, monitorId) {
      return MonitorModel.findOne({ _id: monitorId, workspace_id: workspaceId });
    },
    update(workspaceId, monitorId, data) {
      return MonitorModel.findOneAndUpdate(
        { _id: monitorId, workspace_id: workspaceId },
        { $set: data },
        { new: true, runValidators: true },
      );
    },
    remove,
    dueWorkspaceIds,
    claimDueForWorkspace,
    claimById,
    releaseLease,
    scheduleNextCheck,
    incrementHealthyCount,
    resetHealthyCount,
    async reconcileCounters() {
      await MonitorModel.updateMany({ paused: { $exists: false } }, { $set: { paused: false } });
      await MonitorModel.updateMany({ next_check_at: { $exists: false } }, { $set: { next_check_at: new Date() } });
      await MonitorModel.updateMany({ expected_status_code: { $exists: false } }, { $set: { expected_status_code: 200 } });
      await MonitorModel.updateMany({ max_response_time_ms: { $exists: false } }, { $set: { max_response_time_ms: 3000 } });
      await MonitorModel.updateMany({ expect_records: { $exists: false } }, { $set: { expect_records: false } });
      await MonitorModel.updateMany({ consecutive_healthy_checks: { $exists: false } }, { $set: { consecutive_healthy_checks: 0 } });
      await MonitorModel.updateMany({ method: "HEAD" }, { $set: { method: "GET" } });
      const total = await MonitorModel.countDocuments({});
      await CapacityModel.findOneAndUpdate(
        { _id: "global" },
        { $set: { count: total } },
        { upsert: true, new: true, setDefaultsOnInsert: false },
      );
      const grouped = await MonitorModel.aggregate([
        { $group: { _id: "$workspace_id", count: { $sum: 1 } } },
      ]);
      await WorkspaceModel.updateMany({}, { $set: { monitor_count: 0 } });
      await Promise.all(grouped.map(({ _id, count }) => WorkspaceModel.updateOne(
        { _id },
        { $set: { monitor_count: count } },
      )));
    },
  };
}

const defaultRepository = createMonitorRepository();
export const createMonitor = defaultRepository.create;
export const listMonitors = defaultRepository.list;
export const findMonitorById = defaultRepository.findById;
export const updateMonitor = defaultRepository.update;
export const deleteMonitor = defaultRepository.remove;
export const reconcileMonitorCounters = defaultRepository.reconcileCounters;
