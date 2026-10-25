import { pathToFileURL } from "node:url";

const NO_STRING_HASH = { $not: { $type: "string" } };
const NO_HASH_FILTER = {
  $or: [
    { access_key_hash: NO_STRING_HASH },
    { access_key_hash: "" },
  ],
};

export async function inspectOrphanedWorkspaces({
  WorkspaceModel,
  MonitorModel,
  deleteOrphans = false,
  write = (line) => console.log(line),
} = {}) {
  if (!WorkspaceModel || !MonitorModel) throw new TypeError("WorkspaceModel and MonitorModel are required.");
  const workspaces = await WorkspaceModel.find(NO_HASH_FILTER).select("_id").lean();
  const report = [];
  for (const workspace of workspaces) {
    const monitorCount = await MonitorModel.countDocuments({ workspace_id: workspace._id });
    let deleted = false;
    if (deleteOrphans && monitorCount === 0) {
      const result = await WorkspaceModel.deleteOne({
        _id: workspace._id,
        $and: [
          NO_HASH_FILTER,
          { $or: [{ monitor_count: 0 }, { monitor_count: { $exists: false } }] },
        ],
      });
      deleted = result.deletedCount === 1;
    }
    const row = { workspace_id: String(workspace._id), monitor_count: monitorCount, deleted };
    report.push(row);
    write(`workspace_id=${row.workspace_id} monitors=${monitorCount} ${deleted ? "deleted" : "kept"}`);
  }
  if (report.length === 0) write("No workspaces without a string access-key hash were found.");
  if (deleteOrphans) {
    const keptWithMonitors = report.filter((row) => row.monitor_count > 0).length;
    const keptRaceOrCounterMismatch = report.filter((row) => row.monitor_count === 0 && !row.deleted).length;
    write(`summary: inspected=${report.length} deleted=${report.filter((row) => row.deleted).length} kept_with_monitors=${keptWithMonitors} kept_if_workspace_changed=${keptRaceOrCounterMismatch}`);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--delete") || args.filter((arg) => arg === "--delete").length > 1) {
    console.error("Usage: npm run repair:workspaces [-- --delete]");
    process.exitCode = 2;
  } else {
    let mongooseClient;
    try {
      // Load dotenv only when the user runs this CLI, never when tests import its helper.
      await import("dotenv/config");
      const [{ env }, database, { Workspace }, { Monitor }] = await Promise.all([
        import("../src/config/env.js"),
        import("../src/db/mongoose.js"),
        import("../src/models/workspace.js"),
        import("../src/models/monitor.js"),
      ]);
      mongooseClient = database.mongoose;
      await database.connectToDatabase(env.mongoUri);
      await inspectOrphanedWorkspaces({ WorkspaceModel: Workspace, MonitorModel: Monitor, deleteOrphans: args.includes("--delete") });
    } catch {
      console.error("Workspace repair failed. Check MONGODB_URI, database connectivity, and permissions; details were suppressed.");
      process.exitCode = 1;
    } finally {
      await mongooseClient?.disconnect().catch(() => {});
    }
  }
}
