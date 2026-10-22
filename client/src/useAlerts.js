import { useCallback, useEffect, useRef, useState } from "react";

async function readError(response, fallback) {
  try {
    const body = await response.json();
    return body?.error?.message || fallback;
  } catch {
    return fallback;
  }
}

export function useAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [resolvingIds, setResolvingIds] = useState(() => new Set());
  const [resolveErrors, setResolveErrors] = useState({});
  const refreshInFlight = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const response = await fetch("/alerts", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(await readError(response, `Could not load alerts (${response.status}).`));
      const body = await response.json();
      if (!Array.isArray(body.alerts)) throw new Error("The server returned an unexpected alerts response.");
      if (mounted.current) {
        setAlerts(body.alerts);
        setError("");
        setLastUpdated(new Date());
      }
    } catch (requestError) {
      if (mounted.current) setError(requestError.message || "Could not load alerts. Check your connection and retry.");
    } finally {
      refreshInFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const resolve = useCallback(async (alertId) => {
    setResolvingIds((current) => new Set(current).add(alertId));
    setResolveErrors((current) => ({ ...current, [alertId]: "" }));
    try {
      const response = await fetch(`/alerts/${encodeURIComponent(alertId)}/resolve`, { method: "PATCH" });
      if (!response.ok) throw new Error(await readError(response, `Could not resolve alert (${response.status}).`));
      if (mounted.current) setAlerts((current) => current.filter((alert) => alert._id !== alertId));
    } catch (requestError) {
      if (mounted.current) setResolveErrors((current) => ({
        ...current,
        [alertId]: requestError.message || "Could not resolve this alert. Please try again.",
      }));
    } finally {
      if (mounted.current) setResolvingIds((current) => {
        const next = new Set(current);
        next.delete(alertId);
        return next;
      });
    }
  }, []);

  return { alerts, loading, error, lastUpdated, refresh, resolve, resolvingIds, resolveErrors };
}
