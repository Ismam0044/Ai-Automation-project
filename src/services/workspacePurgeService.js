import { Monitor } from "../models/monitor.js";
import { Workspace } from "../models/workspace.js";
import { WorkspaceAccessLink } from "../models/workspaceAccessLink.js";
import { createMonitorRepository } from "./monitorRepository.js";

export function createWorkspacePurgeService({
  WorkspaceModel = Workspace,
  MonitorModel = Monitor,
  LinkModel = WorkspaceAccessLink,
  monitorRepository = createMonitorRepository({ MonitorModel, WorkspaceModel }),
  clock = () => new Date(),
} = {}) {
  async function purgeInactiveWorkspaces(inactiveDays) {
    if (!Number.isSafeInteger(inactiveDays) || inactiveDays < 1) {
      throw new TypeError("Inactive workspace retention must be a positive integer number of days");
    }
    const cutoff = new Date(clock().getTime() - inactiveDays * 86_400_000);
    const inactiveFilter = {
      $or: [
        { last_active_at: { $lt: cutoff } },
        { last_active_at: { $exists: false }, createdAt: { $lt: cutoff } },
      ],
    };
    const candidates = await WorkspaceModel.find(inactiveFilter).select("_id").lean();
    let purged = 0;
    for (const candidate of candidates) {
      const removed = await WorkspaceModel.findOneAndDelete({ _id: candidate._id, ...inactiveFilter });
      if (!removed) continue;
      await Promise.all([
        MonitorModel.deleteMany({ workspace_id: removed._id }),
        LinkModel.deleteMany({ workspace_id: removed._id }),
      ]);
      purged += 1;
    }

    const remaining = await WorkspaceModel.find({}).select("_id").lean();
    const activeIds = remaining.map(({ _id }) => _id);
    await Promise.all([
      MonitorModel.deleteMany({ workspace_id: { $nin: activeIds } }),
      LinkModel.deleteMany({ workspace_id: { $nin: activeIds } }),
    ]);
    await monitorRepository.reconcileCounters();
    return purged;
  }

  return { purgeInactiveWorkspaces };
}

const defaultService = createWorkspacePurgeService();
export const purgeInactiveWorkspaces = defaultService.purgeInactiveWorkspaces;
