import { useEffect, useMemo, useState } from "react";
import Hero from "./components/Hero.jsx";
import MonitorPanel, { assessmentSampleText } from "./components/MonitorPanel.jsx";
import MonitorsExperience from "./components/MonitorsExperience.jsx";
import WorkspaceLink from "./components/WorkspaceLink.jsx";
import { useWorkspace } from "./useWorkspace.js";
import { useAlerts } from "./useAlerts.js";
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "./components/ui/tabs.jsx";
import { Activity } from "lucide-react";

const anomalyLabels = {
  http_status_failure_critical: "HTTP status failure",
  http_status_failure_warning: "HTTP status failure",
  response_time_critical: "Critical response time",
  response_time_warning: "Slow response",
  records_returned_anomaly: "Records returned anomaly",
  validation_anomaly: "Invalid check data",
};

function localDate(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString();
}

function BrandMark() {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[0.95rem] bg-[#5eead4] text-xs font-extrabold tracking-tight text-[#07110f] shadow-md shadow-[#5eead4]/10" aria-hidden="true">
      <Activity className="h-5 w-5" strokeWidth={2.5} />
    </span>
  );
}

function AlertSummary({ summary, status }) {
  return (
    <section className="grid gap-px overflow-hidden rounded-2xl border border-[#293a45] bg-[#263640] shadow-sm sm:grid-cols-3" aria-label={`${status === "active" ? "Active" : "Resolved"} alert summary`}>
      <div className="flex min-h-24 items-center gap-4 bg-[#101820] px-5 py-4 sm:px-7">
        <span className="text-3xl font-extrabold tracking-tight text-[#e1eef3]">{summary.total}</span>
        <span className="text-sm font-semibold text-[#9badb8]">{status === "active" ? "Active alerts" : "Resolved alerts"}</span>
      </div>
      <div className="flex min-h-24 items-center gap-3 bg-[#101820] px-5 py-4 sm:px-7">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.1)]" aria-hidden="true" />
        <span className="text-2xl font-bold text-red-200">{summary.critical}</span>
        <span className="text-sm font-semibold text-[#9badb8]">Critical</span>
      </div>
      <div className="flex min-h-24 items-center gap-3 bg-[#101820] px-5 py-4 sm:px-7">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.12)]" aria-hidden="true" />
        <span className="text-2xl font-bold text-amber-300">{summary.warning}</span>
        <span className="text-sm font-semibold text-[#9badb8]">Warning</span>
      </div>
    </section>
  );
}

function AnomalyTags({ types = [] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2 p-0" aria-label="Anomaly types">
      {types.map((type) => (
        <li className="list-none rounded-md border border-[#293a45] bg-[#0b131a] px-2.5 py-1 text-[11px] font-semibold text-[#9badb8]" key={type}>
          {anomalyLabels[type] ?? type.replaceAll("_", " ")}
        </li>
      ))}
    </ul>
  );
}

function AlertCard({ alert, resolving, resolveError, onResolve, isResolved }) {
  const critical = alert.severity === "critical";
  const severityClasses = critical
    ? "border-red-900/70 bg-red-950/35 text-red-200"
    : "border-amber-800/70 bg-amber-950/30 text-amber-200";
  const dotClass = critical ? "bg-red-500" : "bg-amber-500";

  return (
    <article className="rounded-2xl border border-[#293a45] bg-[#101820] p-5 shadow-[0_12px_36px_-30px_rgba(25,51,77,0.4)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
          <h3 className="m-0 break-words text-base font-bold text-[#ecf4f7]">{alert.api_name}</h3>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold ${severityClasses}`}>
          {critical ? "Critical" : "Warning"}
        </span>
      </div>
      <AnomalyTags types={alert.anomaly_types} />
      <p className="mt-4 mb-0 break-words text-sm leading-6 text-[#b7c8d1]">{alert.message}</p>
      <div className="mt-5 flex flex-col gap-3 border-t border-[#1a2832] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#81939e]">
          <span className="font-semibold text-[#9badb8]">{alert.occurrence_count ?? 1} {alert.occurrence_count === 1 ? "occurrence" : "occurrences"}</span>
          <span aria-hidden="true" className="text-[#566a76]">·</span>
          <span>Updated {localDate(alert.updatedAt ?? alert.createdAt)}</span>
        </div>
        {isResolved ? (
          <span className="inline-flex min-h-9 items-center rounded-lg border border-emerald-800/70 bg-emerald-950/30 px-3 text-xs font-bold text-emerald-200">Resolved</span>
        ) : <button
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#3a4d58] px-4 text-sm font-semibold text-[#b7c8d1] transition hover:border-red-300 hover:bg-red-950/55 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] disabled:cursor-wait disabled:opacity-60"
          type="button"
          aria-label={`Resolve ${alert.api_name} alert`}
          disabled={resolving}
          onClick={() => onResolve(alert._id)}
        >
          {resolving ? "Resolving…" : "Resolve"}
        </button>}
      </div>
      {resolveError && <p className="mt-3 mb-0 text-sm text-red-200" role="alert">{resolveError}</p>}
    </article>
  );
}

function PageState({ title, detail, action }) {
  return (
    <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[#3a4d58] bg-[#101820] px-6 py-10 text-center" role="status">
      <span className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-emerald-950/30 text-lg font-bold text-emerald-200" aria-hidden="true">
        {action ? "!" : "✓"}
      </span>
      <h3 className="mb-2 text-base font-bold text-[#ecf4f7]">{title}</h3>
      <p className="mb-0 max-w-md text-sm leading-6 text-[#9badb8]">{detail}</p>
      {action}
    </section>
  );
}

function ValuePoint({ number, title, detail }) {
  return (
    <li className="flex gap-3 rounded-xl border border-[#31434f]/80 bg-[#111a24]/80 p-4 sm:border-0 sm:bg-transparent sm:p-0">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#162a34] text-xs font-extrabold text-[#5eead4]" aria-hidden="true">{number}</span>
      <div>
        <h3 className="mb-1 text-sm font-bold text-[#ecf4f7]">{title}</h3>
        <p className="mb-0 text-xs leading-5 text-[#9badb8]">{detail}</p>
      </div>
    </li>
  );
}

export default function App() {
  const { workspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [view, setView] = useState("alerts");
  const [scope, setScope] = useState("workspace");
  const [status, setStatus] = useState("active");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [page, setPage] = useState(1);
  const { alerts, summary, pagination, loading, error, lastUpdated, refresh, resolve, resolvingIds, resolveErrors } = useAlerts({
    status,
    page,
    apiName: search,
    severity,
    scope,
    enabled: view === "alerts" && !workspaceLoading && Boolean(workspace),
  });
  const [checks, setChecks] = useState("[]");
  const sortedAlerts = useMemo(() => [...alerts].sort((left, right) => {
    const severityOrder = (right.severity === "critical" ? 1 : 0) - (left.severity === "critical" ? 1 : 0);
    if (severityOrder) return severityOrder;
    return new Date(right.updatedAt ?? right.createdAt ?? 0) - new Date(left.updatedAt ?? left.createdAt ?? 0);
  }), [alerts]);

  useEffect(() => {
    if (page > Math.max(1, pagination.total_pages)) {
      setPage(Math.max(1, pagination.total_pages));
    }
  }, [page, pagination.total_pages]);

  function loadSample() {
    setChecks(assessmentSampleText);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("submit-checks")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  function switchStatus(nextStatus) {
    setStatus(nextStatus);
    setPage(1);
  }

  function updateSearch(value) {
    setSearch(value);
    setPage(1);
  }

  function updateSeverity(value) {
    setSeverity(value);
    setPage(1);
  }

  return (
    <main className="control-room-shell mx-auto w-full max-w-7xl px-4 pb-14 pt-5 sm:px-7 sm:pt-8 lg:px-10">
      <header className="mb-6 flex items-center justify-between gap-4 sm:mb-9">
        <a className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5eead4]" href="#top" aria-label="API Monitor home">
          <BrandMark />
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold tracking-tight text-[#e1eef3] sm:text-base">API Monitor</span>
            <span className="hidden text-xs text-[#81939e] sm:block">Operations overview</span>
          </span>
        </a>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <button type="button" aria-pressed={view === "alerts"} onClick={() => setView("alerts")} className={`min-h-10 rounded-lg px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] sm:px-4 sm:text-sm ${view === "alerts" ? "bg-[#5eead4] text-[#07110f]" : "border border-[#3a4d58] bg-[#101820] text-[#b7c8d1]"}`}>Alerts</button>
          <button type="button" aria-pressed={view === "monitors"} onClick={() => setView("monitors")} className={`min-h-10 rounded-lg px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] sm:px-4 sm:text-sm ${view === "monitors" ? "bg-[#5eead4] text-[#07110f]" : "border border-[#3a4d58] bg-[#101820] text-[#b7c8d1]"}`}>Monitors</button>
          {workspace && <WorkspaceLink workspace={workspace} />}
        </div>
      </header>

      <div id="top" />
      <div className="space-y-10 sm:space-y-14">
        <Hero onLoadSample={loadSample} />

        <ul className="grid list-none gap-3 p-0 sm:grid-cols-3 sm:gap-6 lg:px-5" aria-label="Platform highlights">
          <ValuePoint number="01" title="Detects problems" detail="Clear rules catch slow, failed, or unexpected API responses." />
          <ValuePoint number="02" title="AI-written alerts" detail="Get an operator-friendly explanation, with a dependable fallback." />
          <ValuePoint number="03" title="Fits your workflow" detail="Provide a JSON file or send a batch to POST /monitor." />
        </ul>

        <section id="how-it-works" className="rounded-2xl border border-[#263a46] bg-[#111d26] p-5 sm:p-7">
          <div className="grid gap-5 sm:grid-cols-[0.7fr_1.3fr] sm:items-center">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#61d6cd]">How it works</p>
              <h2 className="mb-0 text-xl font-bold tracking-tight text-[#e1eef3]">Checks in. Clear alerts out.</h2>
            </div>
            <p className="mb-0 text-sm leading-6 text-[#9badb8]">
              Submit API response facts. Rule-based detection identifies anomalies, then Gemini writes a short explanation. Alerts are saved for review, and a fallback message keeps the workflow useful if the model is unavailable.
            </p>
          </div>
        </section>

        <div>
          <p className="mb-3 rounded-xl border border-amber-800/70 bg-amber-950/30 px-4 py-3 text-sm leading-6 text-amber-100" role="note">
            <strong>Demo.</strong> Do not enter real patient or company data. Alerts are shared by everyone using this app.
          </p>
          <MonitorPanel value={checks} onChange={setChecks} onLoadSample={() => setChecks(assessmentSampleText)} onComplete={refresh} />
        </div>

        {view === "alerts" ? <section id="active-alerts" aria-labelledby="active-alerts-heading">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#61d6cd]">Live dashboard</p>
              <h2 id="active-alerts-heading" className="mb-0 text-2xl font-bold tracking-tight text-[#edf5f8]">Alert history</h2>
              <p className="mt-2 mb-0 text-sm text-[#9badb8]">Search and review alerts across monitored APIs.</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="mb-0 text-xs text-[#81939e]" aria-live="polite">
                {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Waiting for first update"}
              </p>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#3a4d58] bg-[#101820] px-3 text-sm font-semibold text-[#b7c8d1] transition hover:border-[#52636d] hover:bg-[#0b131a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] disabled:cursor-wait disabled:opacity-60"
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M16.5 9a6.5 6.5 0 0 0-11.2-3.8L3.5 7M3.5 7V3.8M3.5 7h3.3M3.5 11a6.5 6.5 0 0 0 11.2 3.8l1.8-1.8m0 0v3.2m0-3.2h-3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Refresh
              </button>
            </div>
          </div>

          <TabsRoot value={status} onValueChange={switchStatus}>
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="inline-flex w-fit rounded-xl border border-[#293a45] bg-[#151f28] p-1" role="group" aria-label="Alert list source">
              {[ ["workspace", "My workspace"], ["shared", "Shared demo"] ].map(([value, label]) => <button key={value} type="button" aria-pressed={scope === value} onClick={() => { setScope(value); setPage(1); }} className={`min-h-10 rounded-lg px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] sm:px-4 sm:text-sm ${scope === value ? "bg-[#101820] text-[#d7f9f2] shadow-sm" : "text-[#9badb8] hover:text-[#ecf4f7]"}`}>{label}</button>)}
            </div>
            <TabsList aria-label="Alert status">
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="resolved">Resolved</TabsTrigger>
            </TabsList>
            <div className="grid gap-3 sm:grid-cols-2 md:min-w-[26rem]">
              <div>
                <label htmlFor="api-search" className="mb-1.5 block text-xs font-bold text-[#b7c8d1]">Search API name</label>
                <input
                  id="api-search"
                  type="search"
                  value={search}
                  onChange={(event) => updateSearch(event.target.value)}
                  placeholder="For example, AppointmentAPI"
                  className="min-h-10 w-full rounded-lg border border-[#3a4d58] bg-[#101820] px-3 text-sm text-[#d2e0e6] outline-none placeholder:text-[#6d808c] focus:border-[#5eead4] focus:ring-4 focus:ring-[#5eead4]/15"
                />
              </div>
              <div>
                <label htmlFor="severity-filter" className="mb-1.5 block text-xs font-bold text-[#b7c8d1]">Severity</label>
                <select
                  id="severity-filter"
                  value={severity}
                  onChange={(event) => updateSeverity(event.target.value)}
                  className="min-h-10 w-full rounded-lg border border-[#3a4d58] bg-[#101820] px-3 text-sm text-[#d2e0e6] outline-none focus:border-[#5eead4] focus:ring-4 focus:ring-[#5eead4]/15"
                >
                  <option value="all">All severities</option>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                </select>
              </div>
            </div>
          </div>

          <TabsContent value={status} id="alert-results">
          <AlertSummary summary={summary} status={status} />

          {error && alerts.length > 0 && (
            <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-red-900/70 bg-red-950/35 px-4 py-3 text-sm text-red-200 sm:flex-row sm:items-center" role="alert">
              <span>{error}</span>
              <button className="min-h-9 rounded-lg border border-red-900/70 bg-[#101820] px-3 text-xs font-bold text-red-200 hover:bg-red-950/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300" type="button" onClick={() => void refresh()}>Retry</button>
            </div>
          )}

          <div className="mt-4">
            {loading && alerts.length === 0 ? (
              <PageState title="Loading alerts" detail="Checking for active API issues…" />
            ) : error && alerts.length === 0 ? (
              <PageState title="Alerts could not be loaded" detail={error} action={<button className="mt-4 min-h-10 rounded-lg bg-[#5eead4] px-4 text-sm font-bold text-[#07110f] hover:bg-[#91f2e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4]" type="button" onClick={() => void refresh()}>Retry</button>} />
            ) : sortedAlerts.length === 0 ? (
              <PageState title={status === "active" ? "All clear" : "No resolved alerts"} detail={status === "active" ? "No active alerts, all monitored APIs look healthy" : "Resolved alerts matching these filters will appear here."} />
            ) : (
              <div className="grid gap-3" aria-label="Active alerts">
                {sortedAlerts.map((alert) => (
                  <AlertCard
                    key={alert._id}
                    alert={alert}
                    resolving={resolvingIds.has(alert._id)}
                    resolveError={resolveErrors[alert._id]}
                    onResolve={resolve}
                    isResolved={status === "resolved"}
                  />
                ))}
              </div>
            )}
          </div>
          {pagination.total_pages > 1 && (
            <nav className="mt-5 flex flex-col gap-3 border-t border-[#293a45] pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Alert pages">
              <p className="mb-0 text-xs text-[#81939e]" aria-live="polite">Page {pagination.page} of {pagination.total_pages} · {pagination.total} matching alerts</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || loading}
                  className="min-h-10 rounded-lg border border-[#3a4d58] bg-[#101820] px-4 text-sm font-semibold text-[#b7c8d1] hover:bg-[#0b131a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] disabled:cursor-not-allowed disabled:opacity-50"
                >Previous</button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pagination.total_pages, current + 1))}
                  disabled={page >= pagination.total_pages || loading}
                  className="min-h-10 rounded-lg border border-[#3a4d58] bg-[#101820] px-4 text-sm font-semibold text-[#b7c8d1] hover:bg-[#0b131a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] disabled:cursor-not-allowed disabled:opacity-50"
                >Next</button>
              </div>
            </nav>
          )}
          </TabsContent>
          </TabsRoot>
          <p className="mt-5 mb-0 text-center text-xs text-[#6d808c]">Automatic refresh every 15 seconds while this tab is visible</p>
        </section> : <section className="space-y-4" aria-label="Monitors view">
          {workspaceLoading ? <PageState title="Opening your private workspace" detail="Creating a private browser workspace if this is your first visit…" />
            : workspaceError ? <PageState title="Workspace unavailable" detail={workspaceError} action={<button className="mt-4 min-h-10 rounded-lg bg-[#5eead4] px-4 text-sm font-bold text-[#07110f] focus-visible:outline-2 focus-visible:outline-[#5eead4]" type="button" onClick={() => window.location.reload()}>Retry</button>} />
              : workspace ? <MonitorsExperience workspace={workspace} /> : null}
        </section>}
      </div>
    </main>
  );
}
