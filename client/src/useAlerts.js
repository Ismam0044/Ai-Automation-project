import { useCallback, useEffect, useMemo, useRef, useState } from "react";

async function readError(response, fallback) {
  try {
    const body = await response.json();
    return body?.error?.message || fallback;
  } catch {
    return fallback;
  }
}

export function useAlerts({ status = "active", page = 1, limit = 20, apiName = "", severity = "all", scope = "shared", enabled = true } = {}) {
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, warning: 0 });
  const [pagination, setPagination] = useState({ page, limit, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [resolvingIds, setResolvingIds] = useState(() => new Set());
  const [resolveErrors, setResolveErrors] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const mounted = useRef(true);

  const queryString = useMemo(() => {
    const query = new URLSearchParams({ status, page: String(page), limit: String(limit), scope });
    const search = apiName.trim();
    if (search) query.set("api_name", search);
    if (severity !== "all") query.set("severity", severity);
    return query.toString();
  }, [status, page, limit, apiName, severity, scope]);

  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let disposed = false;
    let inFlight = false;
    let timer;

    async function load() {
      if (disposed || inFlight || document.hidden) return;
      inFlight = true;
      setLoading(true);
      try {
        const response = await fetch(`/alerts?${queryString}`, {
          headers: { accept: "application/json" },
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await readError(response, `Could not load alerts (${response.status}).`));
        const body = await response.json();
        if (!Array.isArray(body.alerts)) throw new Error("The server returned an unexpected alerts response.");
        if (disposed) return;
        setAlerts(body.alerts);
        setPagination(body.pagination ?? { page, limit, total: body.alerts.length, total_pages: body.alerts.length ? 1 : 0 });
        setSummary(body.summary ?? {
          total: body.alerts.length,
          critical: body.alerts.filter((alert) => alert.severity === "critical").length,
          warning: body.alerts.filter((alert) => alert.severity === "warning").length,
        });
        setError("");
        setLastUpdated(new Date());
      } catch (requestError) {
        if (!disposed && requestError.name !== "AbortError") setError(requestError.message || "Could not load alerts. Check your connection and retry.");
      } finally {
        inFlight = false;
        if (!disposed) {
          setLoading(false);
          timer = window.setTimeout(load, 15_000);
        }
      }
    }
    const onVisibility = () => { if (!document.hidden) { window.clearTimeout(timer); void load(); } };
    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [queryString, page, limit, refreshKey, enabled]);

  const resolve = useCallback(async (alertId) => {
    setResolvingIds((current) => new Set(current).add(alertId));
    setResolveErrors((current) => ({ ...current, [alertId]: "" }));
    try {
      const response = await fetch(`/alerts/${encodeURIComponent(alertId)}/resolve?scope=${scope}`, {
        method: "PATCH",
        headers: { accept: "application/json", "content-type": "application/json" },
        credentials: "same-origin",
        body: "{}",
      });
      if (!response.ok) throw new Error(await readError(response, `Could not resolve alert (${response.status}).`));
      if (mounted.current) {
        setAlerts((current) => current.filter((alert) => alert._id !== alertId));
        refresh();
      }
    } catch (requestError) {
      if (mounted.current) setResolveErrors((current) => ({ ...current, [alertId]: requestError.message || "Could not resolve this alert. Please try again." }));
    } finally {
      if (mounted.current) setResolvingIds((current) => {
        const next = new Set(current);
        next.delete(alertId);
        return next;
      });
    }
  }, [refresh, scope]);

  return { alerts, summary, pagination, loading, error, lastUpdated, refresh, resolve, resolvingIds, resolveErrors };
}
