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
    async reconcileCounters() {
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
