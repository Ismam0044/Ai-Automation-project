import { MonitorCheck } from "../models/monitorCheck.js";

function isHealthy(check, monitor) {
  return check.outcome === "ok"
    && check.status_code === monitor.expected_status_code
    && check.response_time_ms <= monitor.max_response_time_ms
    && (!monitor.expect_records || (typeof check.records_returned === "number" && check.records_returned > 0));
}

function percentage(checks, monitor) {
  if (checks.length === 0) return null;
  return Math.round((checks.filter((check) => isHealthy(check, monitor)).length / checks.length) * 10000) / 100;
}

function percentile95(values) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)];
}

export function createCheckHistoryService({ CheckModel = MonitorCheck, clock = () => new Date(), retentionDays = 14 } = {}) {
  async function record(workspaceId, monitorId, result) {
    const checkedAt = clock();
    const expiresAt = new Date(checkedAt.getTime() + retentionDays * 86_400_000);
    return CheckModel.create({
      workspace_id: workspaceId,
      monitor_id: monitorId,
      status_code: result.status_code,
      response_time_ms: result.response_time_ms,
      records_returned: result.records_returned,
      outcome: result.outcome,
      checked_at: checkedAt,
      expires_at: expiresAt,
    });
  }

  async function list(workspaceId, monitorId, { page = 1, limit = 20 } = {}) {
    const filter = { workspace_id: workspaceId, monitor_id: monitorId };
    const [checks, total] = await Promise.all([
      CheckModel.find(filter).sort({ checked_at: -1 }).skip((page - 1) * limit).limit(limit),
      CheckModel.countDocuments(filter),
    ]);
    return { checks, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  async function summary(workspaceId, monitor, monitorId = monitor._id) {
    const now = clock();
    const [latestRows, recent24h, recent7d] = await Promise.all([
      CheckModel.find({ workspace_id: workspaceId, monitor_id: monitorId }).sort({ checked_at: -1 }).limit(1),
      CheckModel.find({ workspace_id: workspaceId, monitor_id: monitorId, checked_at: { $gte: new Date(now.getTime() - 86_400_000) } }),
      CheckModel.find({ workspace_id: workspaceId, monitor_id: monitorId, checked_at: { $gte: new Date(now.getTime() - 7 * 86_400_000) } }),
    ]);
    const latest = latestRows[0] ?? null;
    const state = !latest ? "down"
      : isHealthy(latest, monitor) ? "up"
        : latest.status_code === 0 || latest.status_code >= 500 ? "down" : "degraded";
    const timings = recent7d.map((check) => check.response_time_ms).filter((value) => Number.isFinite(value) && value >= 0);
    return {
      monitor_id: String(monitorId),
      state,
      last_check_at: latest?.checked_at ?? null,
      last_response_time_ms: latest?.response_time_ms ?? null,
      uptime_percent: {
        last_24_hours: percentage(recent24h, monitor),
        last_7_days: percentage(recent7d, monitor),
      },
      average_response_time_ms: timings.length ? Math.round(timings.reduce((sum, value) => sum + value, 0) / timings.length) : null,
      p95_response_time_ms: percentile95(timings),
    };
  }

  return { record, list, summary };
}

const defaultService = createCheckHistoryService();
export const recordMonitorCheck = defaultService.record;
export const listMonitorChecks = defaultService.list;
export const summarizeMonitorChecks = defaultService.summary;
