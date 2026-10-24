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

  async function runDueOnce({ timeBudgetMs = Infinity, summary = false } = {}) {
    if (running) return summary ? { claimed: 0, failed: 0 } : 0;
    running = true;
    const startedAt = Date.now();
    let claimedTotal = 0; let failed = 0;
    try {
      do {
        const now = clock();
        const allowance = Math.min(concurrency, await checkBudget.remaining());
        if (allowance <= 0) break;
        const workspaces = await monitorRepository.dueWorkspaceIds(now);
        if (workspaces.length === 0) break;
        const offset = cursor % workspaces.length;
        const fairOrder = [...workspaces.slice(offset), ...workspaces.slice(0, offset)];
        const claimed = []; let idleRounds = 0; let position = 0;
        while (claimed.length < allowance && idleRounds < fairOrder.length && Date.now() - startedAt < timeBudgetMs) {
          const workspaceId = fairOrder[position % fairOrder.length]; position += 1;
          cursor = (offset + position) % fairOrder.length;
          const monitor = await monitorRepository.claimDueForWorkspace(workspaceId, { now: clock(), leaseMs, jitterMs, random });
          if (!monitor) { idleRounds += 1; continue; }
          if (!(await checkBudget.take())) { await monitorRepository.releaseLease(monitor.workspace_id, monitor._id); break; }
          idleRounds = 0; claimed.push(monitor);
        }
        if (!claimed.length) break;
        claimedTotal += claimed.length;
        await Promise.all(claimed.map(async (monitor) => {
          try { await monitorCheckService.run(monitor); }
          catch { failed += 1; serviceLogger.error({ monitor_id: String(monitor._id) }, "Scheduled monitor check failed"); }
          finally { await monitorRepository.releaseLease(monitor.workspace_id, monitor._id).catch(() => serviceLogger.error({ monitor_id: String(monitor._id) }, "Could not release monitor lease")); }
        }));
      } while (Date.now() - startedAt < timeBudgetMs);
      return summary ? { claimed: claimedTotal, failed } : claimedTotal;
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

  async function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    while (running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return { start, stop, runDueOnce };
}
