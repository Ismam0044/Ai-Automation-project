import { Activity, ArrowDown, CircleCheck, Timer, TriangleAlert } from "lucide-react";
import { Button } from "./ui/button.jsx";

const previewAlerts = [
  {
    api: "AppointmentAPI",
    status: "Critical",
    detail: "Failed with status 500 · 5.5 s",
    icon: TriangleAlert,
    badge: "border-red-200 bg-red-50 text-red-800",
    iconColor: "text-red-700",
  },
  {
    api: "BillingAPI",
    status: "Warning",
    detail: "Responded slowly · 3.8 s",
    icon: Timer,
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    iconColor: "text-amber-700",
  },
  {
    api: "PatientDataAPI",
    status: "Healthy",
    detail: "200 OK · 50 records",
    icon: CircleCheck,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    iconColor: "text-emerald-700",
  },
];

function PreviewCard({ alert }) {
  const Icon = alert.icon;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 truncate text-sm font-semibold text-slate-900">{alert.api}</h3>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${alert.badge}`}>{alert.status}</span>
      </div>
      <p className="mb-0 mt-3 flex items-center gap-2 text-sm text-slate-600">
        <Icon className={`h-4 w-4 shrink-0 ${alert.iconColor}`} aria-hidden="true" />
        {alert.detail}
      </p>
    </article>
  );
}

export default function Hero({ onLoadSample }) {
  function scrollToChecks() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("submit-checks")?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <section className="grid gap-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-9 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:p-12">
      <div className="max-w-2xl">
        <p className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
          <Activity className="h-4 w-4" aria-hidden="true" />
          API monitoring, made clear
        </p>
        <h1 className="m-0 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
          Catch API issues. Get alerts you can act on.
        </h1>
        <p className="mb-0 mt-4 max-w-xl text-base leading-7 text-slate-600">
          Monitor response checks and turn problems into short, readable AI-written alerts.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={scrollToChecks}>
            Try it now <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="secondary" size="lg" onClick={onLoadSample}>Load sample</Button>
        </div>
      </div>

      <div className="space-y-3" aria-label="Synthetic alert examples">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-sm font-semibold text-slate-800">Example alerts</h2>
          <span className="text-xs text-slate-500">Synthetic data</span>
        </div>
        {previewAlerts.map((alert) => <PreviewCard key={alert.api} alert={alert} />)}
      </div>
    </section>
  );
}
