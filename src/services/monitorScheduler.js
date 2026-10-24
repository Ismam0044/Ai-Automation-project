import { logger } from "../config/logger.js";
import { monitorCheckBudget } from "./monitorCheckBudget.js";

export function createMonitorScheduler({
  monitorRepository,
  monitorCheckService,
  tickIntervalMs = 5_000,
  concurrency = 5,
  checkBudget = monitorCheckBudget,
  leaseMs = 30_000,
  jitterMs = 5_000,
  clock = () => new Date(),
  random = Math.random,
  logger: serviceLogger = logger,
} = {}) {
  let timer = null;
  let running = false;
  let cursor = 0;

  async function runDueOnce() {
    if (running) return 0;
    running = true;
    const now = clock();
    try {
      const allowance = Math.min(concurrency, checkBudget.remaining());
      if (allowance <= 0) return 0;
      const workspaces = await monitorRepository.dueWorkspaceIds(now);
      if (workspaces.length === 0) return 0;
      const offset = cursor % workspaces.length;
      const fairOrder = [...workspaces.slice(offset), ...workspaces.slice(0, offset)];
      const claimed = [];
      let idleRounds = 0;
      let position = 0;
      while (claimed.length < allowance && idleRounds < fairOrder.length) {
        const workspaceId = fairOrder[position % fairOrder.length];
        position += 1;
        cursor = (offset + position) % fairOrder.length;
        const monitor = await monitorRepository.claimDueForWorkspace(workspaceId, {
          now: clock(), leaseMs, jitterMs, random,
        });
        if (!monitor) {
          idleRounds += 1;
          continue;
        }
        if (!checkBudget.take()) {
          await monitorRepository.releaseLease(monitor.workspace_id, monitor._id);
          break;
        }
        idleRounds = 0;
        claimed.push(monitor);
      }
      await Promise.all(claimed.map(async (monitor) => {
        try {
          await monitorCheckService.run(monitor);
        } catch {
          serviceLogger.error({ monitor_id: String(monitor._id) }, "Scheduled monitor check failed");
        } finally {
          await monitorRepository.releaseLease(monitor.workspace_id, monitor._id)
            .catch(() => serviceLogger.error({ monitor_id: String(monitor._id) }, "Could not release monitor lease"));
        }
      }));
      return claimed.length;
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return stop;
    void runDueOnce().catch(() => serviceLogger.error("Monitor scheduler tick failed"));
    timer = setInterval(() => {
      void runDueOnce().catch(() => serviceLogger.error("Monitor scheduler tick failed"));
    }, tickIntervalMs);
    timer.unref?.();
    return stop;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, runDueOnce };
}
