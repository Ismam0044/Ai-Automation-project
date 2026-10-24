import { Monitor } from "../models/monitor.js";

export function createMonitorRepository({ MonitorModel = Monitor } = {}) {
  return {
    create(workspaceId, data) {
      return MonitorModel.create({ workspace_id: workspaceId, ...data });
    },
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
    remove(workspaceId, monitorId) {
      return MonitorModel.findOneAndDelete({ _id: monitorId, workspace_id: workspaceId });
    },
  };
}

const defaultRepository = createMonitorRepository();
export const createMonitor = defaultRepository.create;
export const listMonitors = defaultRepository.list;
export const findMonitorById = defaultRepository.findById;
export const updateMonitor = defaultRepository.update;
export const deleteMonitor = defaultRepository.remove;
