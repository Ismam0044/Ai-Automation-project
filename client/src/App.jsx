import { useMemo } from "react";
import { useAlerts } from "./useAlerts.js";

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

function AlertSummary({ alerts }) {
  const critical = alerts.filter((alert) => alert.severity === "critical").length;
  const warning = alerts.filter((alert) => alert.severity === "warning").length;
  return (
    <section className="summary" aria-label="Active alert summary">
      <div className="summary-total"><span className="summary-number">{alerts.length}</span><span>Active alerts</span></div>
      <div className="summary-count critical-count"><span className="count-dot" aria-hidden="true" />{critical} critical</div>
      <div className="summary-count warning-count"><span className="count-dot" aria-hidden="true" />{warning} warning</div>
    </section>
  );
}

function AnomalyTags({ types = [] }) {
  return (
    <ul className="tags" aria-label="Anomaly types">
      {types.map((type) => <li className="tag" key={type}>{anomalyLabels[type] ?? type.replaceAll("_", " ")}</li>)}
    </ul>
  );
}

function AlertCard({ alert, resolving, resolveError, onResolve }) {
  const critical = alert.severity === "critical";
  return (
    <article className="alert-card">
      <div className="card-topline">
        <div className="api-heading">
          <span className={`severity-dot ${critical ? "dot-critical" : "dot-warning"}`} aria-hidden="true" />
          <h2>{alert.api_name}</h2>
        </div>
        <span className={`severity-badge ${critical ? "badge-critical" : "badge-warning"}`}>
          {critical ? "Critical" : "Warning"}
        </span>
      </div>
      <AnomalyTags types={alert.anomaly_types} />
      <p className="message">{alert.message}</p>
      <div className="card-footer">
        <div className="alert-meta">
          <span>{alert.occurrence_count ?? 1} {alert.occurrence_count === 1 ? "occurrence" : "occurrences"}</span>
          <span className="meta-separator" aria-hidden="true">·</span>
          <span>Updated {localDate(alert.updatedAt ?? alert.createdAt)}</span>
        </div>
        <button
          className="resolve-button"
          type="button"
          aria-label={`Resolve ${alert.api_name} alert`}
          disabled={resolving}
          onClick={() => onResolve(alert._id)}
        >
          {resolving ? "Resolving…" : "Resolve"}
        </button>
      </div>
      {resolveError && <p className="inline-error" role="alert">{resolveError}</p>}
    </article>
  );
}

function PageState({ title, detail, action }) {
  return (
    <section className="page-state" role="status">
      <span className="state-mark" aria-hidden="true">{action ? "!" : "✓"}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </section>
  );
}

export default function App() {
  const { alerts, loading, error, lastUpdated, refresh, resolve, resolvingIds, resolveErrors } = useAlerts();
  const sortedAlerts = useMemo(() => [...alerts].sort((left, right) => {
    const severityOrder = (right.severity === "critical" ? 1 : 0) - (left.severity === "critical" ? 1 : 0);
    if (severityOrder) return severityOrder;
    return new Date(right.updatedAt ?? right.createdAt ?? 0) - new Date(left.updatedAt ?? left.createdAt ?? 0);
  }), [alerts]);

  return (
    <main className="page-shell">
      <header className="page-header">
        <div className="brand-mark" aria-hidden="true">AM</div>
        <div className="header-copy">
          <p className="eyebrow">Operations overview</p>
          <h1>API Monitor</h1>
          <p className="subtitle">Active alerts across your monitored services</p>
        </div>
        <button className="refresh-button" type="button" onClick={() => void refresh()} disabled={loading}>
          <span aria-hidden="true">↻</span> Refresh
        </button>
      </header>

      <AlertSummary alerts={alerts} />

      <div className="list-heading">
        <h2>Current alerts</h2>
        <p aria-live="polite">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Waiting for first update"}</p>
      </div>

      {error && alerts.length > 0 && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>Retry</button>
        </div>
      )}

      {loading && alerts.length === 0 ? (
        <PageState title="Loading alerts" detail="Checking for active API issues…" />
      ) : error && alerts.length === 0 ? (
        <PageState title="Alerts could not be loaded" detail={error} action={<button className="retry-button" type="button" onClick={() => void refresh()}>Retry</button>} />
      ) : sortedAlerts.length === 0 ? (
        <PageState title="All clear" detail="No active alerts, all monitored APIs look healthy" />
      ) : (
        <section className="alert-list" aria-label="Active alerts">
          {sortedAlerts.map((alert) => (
            <AlertCard
              key={alert._id}
              alert={alert}
              resolving={resolvingIds.has(alert._id)}
              resolveError={resolveErrors[alert._id]}
              onResolve={resolve}
            />
          ))}
        </section>
      )}
      <footer className="page-footer">Automatic refresh every 10 seconds</footer>
    </main>
  );
}
