import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "../useWorkspace.js";
import { ConfirmDeleteDialog } from "./ui/alert-dialog.jsx";

const inputClass = "mt-1.5 min-h-11 w-full rounded-lg border border-[#3a4d58] bg-[#101820] px-3 py-2 text-sm text-[#d2e0e6] outline-none focus:border-[#5eead4] focus:ring-4 focus:ring-[#5eead4]/15";
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg border border-[#3a4d58] bg-[#101820] px-3 text-sm font-semibold text-[#b7c8d1] hover:bg-[#0b131a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] disabled:cursor-wait disabled:opacity-50";

function friendlyError(error) {
  if (error.code === "INVALID_MONITOR" && /url|host|public|address|resolve/i.test(error.message)) {
    return "This address can't be monitored. Use a public https or http address.";
  }
  if (error.status === 429) return "Too many requests. Please wait a little and try again.";
  if (error.status >= 500) return "The service is temporarily unavailable. Please try again.";
  return error.message || "We could not complete that request. Please try again.";
}

function timeAgo(value) {
  if (!value) return "Not checked yet";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function stateInfo(monitor) {
  if (monitor.paused) return { name: "Paused", symbol: "||", color: "border-[#3a4d58] bg-[#151f28] text-[#b7c8d1]" };
  if (!monitor.summary?.last_check_at) return { name: "Not checked yet", symbol: "?", color: "border-cyan-800/70 bg-cyan-950/30 text-cyan-200" };
  const state = monitor.summary?.state ?? "not_checked_yet";
  if (state === "up") return { name: "Up", symbol: "+", color: "border-emerald-800/70 bg-emerald-950/30 text-emerald-200" };
  if (state === "degraded") return { name: "Degraded", symbol: "!", color: "border-amber-800/70 bg-amber-950/30 text-amber-200" };
  if (state === "down") return { name: "Down", symbol: "x", color: "border-red-900/70 bg-red-950/35 text-red-200" };
  return { name: "Not checked yet", symbol: "?", color: "border-cyan-800/70 bg-cyan-950/30 text-cyan-200" };
}

function MonitorForm({ monitor, busy, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    name: monitor?.name ?? "",
    url: monitor?.url ?? "",
    interval_seconds: monitor?.interval_seconds ?? 300,
    timeout_ms: monitor?.timeout_ms ?? 5000,
    expected_status_code: monitor?.expected_status_code ?? 200,
    max_response_time_ms: monitor?.max_response_time_ms ?? 3000,
    records_field: monitor?.records_field ?? "",
    expect_records: monitor?.expect_records ?? false,
  }));
  const [error, setError] = useState("");
  function change(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    const body = {
      ...form,
      interval_seconds: Number(form.interval_seconds),
      timeout_ms: Number(form.timeout_ms),
      expected_status_code: Number(form.expected_status_code),
      max_response_time_ms: Number(form.max_response_time_ms),
      records_field: form.records_field.trim() || null,
    };
    try { await onSave(body); }
    catch (requestError) { setError(friendlyError(requestError)); }
  }
  return (
    <section className="rounded-2xl border border-[#293a45] bg-[#101820] p-5 shadow-sm sm:p-7" aria-labelledby="monitor-form-title">
      <div className="flex items-start justify-between gap-3">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#61d6cd]">Monitor setup</p><h3 id="monitor-form-title" className="m-0 text-xl font-bold text-[#e1eef3]">{monitor ? "Edit monitor" : "Add an API monitor"}</h3></div>
        <button className={buttonClass} type="button" onClick={onCancel}>Cancel</button>
      </div>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <div><label className="text-sm font-semibold text-[#d2e0e6]" htmlFor="monitor-name">Name</label><input className={inputClass} id="monitor-name" name="name" value={form.name} onChange={change} required maxLength={100} placeholder="Orders API" /><p className="mb-0 mt-1 text-xs text-[#81939e]">A short label shown in your monitor list.</p></div>
        <div><label className="text-sm font-semibold text-[#d2e0e6]" htmlFor="monitor-url">URL</label><input className={inputClass} id="monitor-url" name="url" type="url" value={form.url} onChange={change} required maxLength={2048} placeholder="https://api.example.com/health" /><p className="mb-0 mt-1 text-xs text-[#81939e]">Use a public HTTP or HTTPS endpoint that returns JSON.</p></div>
        <div><label className="text-sm font-semibold text-[#d2e0e6]" htmlFor="monitor-interval">Check interval (seconds)</label><input className={inputClass} id="monitor-interval" name="interval_seconds" type="number" value={form.interval_seconds} onChange={change} required min={60} max={86400} step={1} /><p className="mb-0 mt-1 text-xs text-[#81939e]">Minimum 60 seconds.</p></div>
        <div><label className="text-sm font-semibold text-[#d2e0e6]" htmlFor="monitor-timeout">Timeout (milliseconds)</label><input className={inputClass} id="monitor-timeout" name="timeout_ms" type="number" value={form.timeout_ms} onChange={change} required min={100} max={30000} step={1} /></div>
        <div><label className="text-sm font-semibold text-[#d2e0e6]" htmlFor="expected-status">Expected HTTP status</label><input className={inputClass} id="expected-status" name="expected_status_code" type="number" value={form.expected_status_code} onChange={change} required min={100} max={599} step={1} /></div>
        <div><label className="text-sm font-semibold text-[#d2e0e6]" htmlFor="max-response">Maximum response time (milliseconds)</label><input className={inputClass} id="max-response" name="max_response_time_ms" type="number" value={form.max_response_time_ms} onChange={change} required min={1} max={300000} step={1} /></div>
        <div><label className="text-sm font-semibold text-[#d2e0e6]" htmlFor="records-field">Records field (optional)</label><input className={inputClass} id="records-field" name="records_field" value={form.records_field} onChange={change} maxLength={128} pattern="[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*" title="Use a dotted JSON field path, such as data.items." placeholder="data.items" /><p className="mb-0 mt-1 text-xs text-[#81939e]">Optional dotted JSON path used to count returned records.</p></div>
        <label className="flex min-h-12 items-center gap-3 rounded-lg border border-[#293a45] px-3 text-sm font-semibold text-[#d2e0e6] sm:mt-6"><input className="h-4 w-4 accent-[#163f67] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4]" type="checkbox" name="expect_records" checked={form.expect_records} onChange={change} />Expect at least one record</label>
        {error && <p className="m-0 rounded-lg border border-red-900/70 bg-red-950/35 px-3 py-2 text-sm text-red-200 sm:col-span-2" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button className="inline-flex min-h-11 items-center rounded-lg bg-[#5eead4] px-5 text-sm font-bold text-[#07110f] hover:bg-[#91f2e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] disabled:opacity-50" type="submit" disabled={busy}>{busy ? "Saving…" : monitor ? "Save changes" : "Add monitor"}</button></div>
      </form>
    </section>
  );
}

function CheckChart({ checks, monitor }) {
  const points = [...checks].reverse();
  if (!points.length) return <div className="grid h-44 place-items-center rounded-xl border border-dashed border-[#3a4d58] text-sm text-[#81939e]">No response time data yet.</div>;
  const width = 720, height = 190, pad = 24;
  const max = Math.max(1, ...points.map((point) => point.response_time_ms ?? 0));
  const xy = points.map((point, index) => ({
    x: points.length === 1 ? width / 2 : pad + index * (width - pad * 2) / (points.length - 1),
    y: height - pad - (point.response_time_ms ?? 0) / max * (height - pad * 2),
    failed: point.outcome !== "ok" || point.status_code !== monitor.expected_status_code,
    point,
  }));
  return <div className="overflow-x-auto rounded-xl border border-[#293a45] bg-[#0b131a] p-3"><svg className="h-48 min-w-[36rem] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent response times; red circles mark failed checks"><line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#364953" /><polyline points={xy.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="#5eead4" strokeWidth="3" strokeLinejoin="round" />{xy.map(({ x, y, failed, point }, index) => <circle key={`${point._id ?? point.checked_at}-${index}`} cx={x} cy={y} r="5" fill={failed ? "#f87171" : "#34d399"} stroke="#0b131a" strokeWidth="2"><title>{`${new Date(point.checked_at).toLocaleString()}: ${point.response_time_ms} ms, status ${point.status_code}`}</title></circle>)}</svg><p className="mb-0 mt-2 text-xs text-[#9badb8]"><span className="font-bold text-emerald-200">● Healthy</span> <span className="ml-3 font-bold text-red-200">● Failed</span></p></div>;
}

function MonitorDetail({ monitor, detail, busy, historyPage, setHistoryPage, onBack, onRefresh }) {
  const summary = detail?.summary ?? monitor.summary ?? {};
  const checks = detail?.checks ?? [];
  return <section className="space-y-5" aria-labelledby="monitor-detail-title">
    <button type="button" className={buttonClass} onClick={onBack}>← Back to monitors</button>
    <div className="rounded-2xl border border-[#293a45] bg-[#101820] p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#61d6cd]">Monitor details</p><h2 id="monitor-detail-title" className="m-0 break-all text-2xl font-bold text-[#e1eef3]">{monitor.name}</h2><p className="mt-2 break-all text-sm text-[#9badb8]">{monitor.url}</p></div><button className={buttonClass} disabled={busy} type="button" onClick={onRefresh}>{busy ? "Refreshing…" : "Refresh details"}</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[["State", !summary.last_check_at ? "Not checked yet" : summary.state ?? "Unknown"], ["Uptime · 24 hours", summary.uptime_percent?.last_24_hours == null ? "—" : `${summary.uptime_percent.last_24_hours}%`], ["Uptime · 7 days", summary.uptime_percent?.last_7_days == null ? "—" : `${summary.uptime_percent.last_7_days}%`], ["Average response", summary.average_response_time_ms == null ? "—" : `${summary.average_response_time_ms} ms`], ["P95 response", summary.p95_response_time_ms == null ? "—" : `${summary.p95_response_time_ms} ms`]].map(([label, value]) => <div key={label} className="rounded-xl bg-[#0b131a] p-4"><p className="mb-1 text-xs font-semibold text-[#81939e]">{label}</p><p className="mb-0 font-bold capitalize text-[#ecf4f7]">{value}</p></div>)}
      </div>
    </div>
    <section className="rounded-2xl border border-[#293a45] bg-[#101820] p-5 sm:p-7"><h3 className="mb-4 text-lg font-bold text-[#ecf4f7]">Response time</h3><CheckChart checks={checks} monitor={monitor} /></section>
    <section className="overflow-hidden rounded-2xl border border-[#293a45] bg-[#101820]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#293a45] px-5 py-4"><h3 className="m-0 text-lg font-bold text-[#ecf4f7]">Recent checks</h3><span className="text-sm text-[#81939e]">Page {detail?.pagination?.page ?? historyPage} of {Math.max(1, detail?.pagination?.total_pages ?? 1)}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[38rem] text-left text-sm"><thead className="bg-[#0b131a] text-xs uppercase text-[#9badb8]"><tr><th className="px-4 py-3">Checked at</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Response</th><th className="px-4 py-3">Records</th></tr></thead><tbody>{checks.map((check) => { const failed = check.outcome !== "ok" || check.status_code !== monitor.expected_status_code; return <tr key={check._id ?? check.checked_at} className="border-t border-[#1a2832]"><td className="px-4 py-3" title={new Date(check.checked_at).toLocaleString()}>{timeAgo(check.checked_at)}</td><td className="px-4 py-3"><span className={`font-bold ${failed ? "text-red-200" : "text-emerald-200"}`}>{failed ? "Failed" : "Healthy"}</span></td><td className="px-4 py-3">{check.status_code}</td><td className="px-4 py-3">{check.response_time_ms} ms</td><td className="px-4 py-3">{check.records_returned ?? "Unknown"}</td></tr>; })}{checks.length === 0 && <tr><td className="px-4 py-6 text-center text-[#81939e]" colSpan="5">No checks recorded yet.</td></tr>}</tbody></table></div><div className="flex justify-between border-t border-[#293a45] p-4"><button className={buttonClass} disabled={historyPage <= 1 || busy} onClick={() => setHistoryPage((page) => page - 1)} type="button">Previous</button><button className={buttonClass} disabled={historyPage >= (detail?.pagination?.total_pages ?? 1) || busy} onClick={() => setHistoryPage((page) => page + 1)} type="button">Next</button></div></section>
    <section className="rounded-2xl border border-[#293a45] bg-[#101820] p-5 sm:p-7"><h3 className="mb-4 text-lg font-bold text-[#ecf4f7]">Active and recent alerts</h3><div className="space-y-3">{[...(detail?.alerts ?? []), ...(detail?.resolvedAlerts ?? [])].map((alert) => <article key={alert._id} className="rounded-xl border border-[#293a45] p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm text-[#ecf4f7]">{alert.severity === "critical" ? "Critical" : "Warning"} · {alert.status}</strong><time className="text-xs text-[#81939e]" title={new Date(alert.updatedAt).toLocaleString()}>{timeAgo(alert.updatedAt)}</time></div><p className="mb-0 mt-2 text-sm leading-6 text-[#b7c8d1]">{alert.message}</p></article>)}{(detail?.alerts?.length ?? 0) + (detail?.resolvedAlerts?.length ?? 0) === 0 && <p className="mb-0 text-sm text-[#81939e]">No active or recent alerts for this monitor.</p>}</div></section>
  </section>;
}

export default function MonitorsExperience({ workspace }) {
  const [monitors, setMonitors] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const inFlight = useRef(false);
  const pollTimer = useRef(null);
  const mounted = useRef(true);
  const refreshRef = useRef(null);
  const currentMonitor = monitors.find((monitor) => String(monitor._id) === selectedId);

  const refresh = useCallback(async () => {
    if (inFlight.current || document.hidden) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const body = await requestJson(`/workspaces/${workspace.id}/monitors`);
      setMonitors(body.monitors ?? []);
      if (selectedId) {
        const [summaryBody, historyBody, activeBody, resolvedBody] = await Promise.all([
          requestJson(`/workspaces/${workspace.id}/monitors/${selectedId}/summary`),
          requestJson(`/workspaces/${workspace.id}/monitors/${selectedId}/checks?page=${historyPage}&limit=20`),
          requestJson(`/alerts?scope=workspace&status=active&api_name=${encodeURIComponent(currentMonitor?.name ?? "")}&limit=20`),
          requestJson(`/alerts?scope=workspace&status=resolved&api_name=${encodeURIComponent(currentMonitor?.name ?? "")}&limit=20`),
        ]);
        const exact = (items) => (items ?? []).filter((alert) => alert.api_name === currentMonitor?.name && String(alert.monitor_id) === selectedId);
        setDetail({ summary: summaryBody.summary, checks: historyBody.checks ?? [], pagination: historyBody.pagination, alerts: exact(activeBody.alerts), resolvedAlerts: exact(resolvedBody.alerts) });
      } else setDetail(null);
      setError("");
      setLastUpdated(new Date());
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        pollTimer.current = window.setTimeout(() => void refreshRef.current?.(), 15_000);
      }
    }
  }, [workspace.id, selectedId, historyPage, currentMonitor?.name]);

  refreshRef.current = refresh;

  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => {
      if (!document.hidden) {
        window.clearTimeout(pollTimer.current);
        void refresh();
      } else window.clearTimeout(pollTimer.current);
    };
    void refresh();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted.current = false;
      window.clearTimeout(pollTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  async function saveMonitor(body) {
    const url = editing
      ? `/workspaces/${workspace.id}/monitors/${editing._id}`
      : `/workspaces/${workspace.id}/monitors`;
    await requestJson(url, {
      method: editing ? "PATCH" : "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setShowForm(false);
    setEditing(null);
    await refresh();
  }

  async function mutateMonitor(monitor, kind) {
    setBusyId(String(monitor._id));
    setError("");
    try {
      const url = `/workspaces/${workspace.id}/monitors/${monitor._id}`;
      if (kind === "check") await requestJson(`/workspaces/${workspace.id}/monitors/${monitor._id}/check`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (kind === "pause") await requestJson(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ paused: !monitor.paused }) });
      if (kind === "delete") await requestJson(url, { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" });
      if (kind === "delete" && selectedId === String(monitor._id)) { setSelectedId(""); setDetail(null); }
      await refresh();
    } catch (requestError) { setError(friendlyError(requestError)); }
    finally { setBusyId(""); }
  }

  if (selectedId && currentMonitor) {
    return <div className="space-y-5"><p className="mb-0 text-xs text-[#81939e]" aria-live="polite">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading monitor…"}</p>{error && <p role="alert" className="rounded-lg border border-red-900/70 bg-red-950/35 p-3 text-sm text-red-200">{error}</p>}<MonitorDetail monitor={currentMonitor} detail={detail} busy={busy} historyPage={historyPage} setHistoryPage={setHistoryPage} onBack={() => { setSelectedId(""); setHistoryPage(1); }} onRefresh={() => void refresh()} /></div>;
  }

  return <section className="space-y-5" aria-labelledby="monitors-heading">
    <div className="rounded-xl border border-amber-800/70 bg-amber-950/30 px-4 py-3 text-sm leading-6 text-amber-100" role="note">Demo. Do not monitor private or sensitive systems. Only status, timing and record counts are stored. Anyone with your workspace link can see your monitors.</div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#61d6cd]">Private workspace</p><h2 id="monitors-heading" className="m-0 text-2xl font-bold text-[#e1eef3]">Your monitors</h2><p className="mb-0 mt-2 text-sm text-[#9badb8]">This workspace is private to this browser.</p></div><div className="flex gap-2"><p className="mb-0 self-center text-xs text-[#81939e]" aria-live="polite">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading…"}</p><button className={buttonClass} type="button" disabled={busy} onClick={() => void refresh()}>{busy ? "Refreshing…" : "Refresh"}</button><button className="inline-flex min-h-10 items-center rounded-lg bg-[#5eead4] px-4 text-sm font-bold text-[#07110f] hover:bg-[#91f2e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4]" type="button" onClick={() => { setEditing(null); setShowForm(true); }}>Add monitor</button></div></div>
    {error && <p role="alert" className="rounded-lg border border-red-900/70 bg-red-950/35 p-3 text-sm text-red-200">{error}</p>}
    {showForm && <MonitorForm monitor={editing} busy={busy} onCancel={() => { setShowForm(false); setEditing(null); }} onSave={saveMonitor} />}
    {!showForm && monitors.length === 0 && !error && <div className="rounded-2xl border border-dashed border-[#3a4d58] bg-[#101820] px-6 py-12 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#162a34] text-xl font-bold text-[#5eead4]" aria-hidden="true">+</div><h3 className="mb-2 mt-4 text-lg font-bold text-[#ecf4f7]">No monitors yet</h3><p className="mx-auto mb-4 max-w-lg text-sm leading-6 text-[#9badb8]">Add a public JSON endpoint to start checking its status, response time and record count.</p><button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-[#5eead4] px-5 text-sm font-bold text-[#07110f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4]" onClick={() => setShowForm(true)}>Add your first monitor</button></div>}
    <div className="grid gap-3">{monitors.map((monitor) => { const state = stateInfo(monitor); const working = busyId === String(monitor._id); return <article key={monitor._id} className="rounded-2xl border border-[#293a45] bg-[#101820] p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h3 className="m-0 break-words text-lg font-bold text-[#ecf4f7]">{monitor.name}</h3><span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${state.color}`}><span aria-hidden="true">{state.symbol}</span>{state.name}</span></div><p className="mt-2 break-all text-sm text-[#9badb8]">{monitor.url}</p><div className="mt-4 grid gap-2 text-xs text-[#9badb8] sm:grid-cols-2 xl:grid-cols-4"><span>Last check: <time title={monitor.summary?.last_check_at ? new Date(monitor.summary.last_check_at).toLocaleString() : "Not checked yet"}>{timeAgo(monitor.summary?.last_check_at)}</time></span><span>24h uptime: <strong>{monitor.summary?.uptime_percent?.last_24_hours == null ? "—" : `${monitor.summary.uptime_percent.last_24_hours}%`}</strong></span><span>Last response: <strong>{monitor.summary?.last_response_time_ms == null ? "—" : `${monitor.summary.last_response_time_ms} ms`}</strong></span><span>Interval: <strong>{monitor.interval_seconds} sec</strong></span></div></div><div className="flex flex-wrap gap-2"><button className={buttonClass} type="button" disabled={busy || monitor.paused || working} onClick={() => void mutateMonitor(monitor, "check")}>{working ? "Working…" : "Check now"}</button><button className={buttonClass} type="button" disabled={busy || working} onClick={() => void mutateMonitor(monitor, "pause")}>{monitor.paused ? "Resume" : "Pause"}</button><button className={buttonClass} type="button" disabled={busy || working} onClick={() => { setEditing(monitor); setShowForm(true); }}>Edit</button><ConfirmDeleteDialog name={monitor.name} disabled={busy || working} onConfirm={() => void mutateMonitor(monitor, "delete")}>
          <button className="inline-flex min-h-10 items-center rounded-lg border border-red-900/70 bg-[#101820] px-3 text-sm font-semibold text-red-200 hover:bg-red-950/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-50" type="button" disabled={busy || working}>Delete</button>
        </ConfirmDeleteDialog><button className={buttonClass} type="button" disabled={busy} onClick={() => { setSelectedId(String(monitor._id)); setHistoryPage(1); }}>Details</button></div></div></article>; })}</div>
  </section>;
}
