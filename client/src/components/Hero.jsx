import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const previewAlerts = [
  {
    api: "AppointmentAPI",
    status: "Critical",
    detail: "Failed with status 500 · 5.5 s",
    color: "red",
    icon: "!",
  },
  {
    api: "BillingAPI",
    status: "Warning",
    detail: "Responded slowly · 3.8 s",
    color: "amber",
    icon: "~",
  },
  {
    api: "PatientDataAPI",
    status: "Healthy",
    detail: "200 OK · 50 records",
    color: "green",
    icon: "✓",
  },
];

function PreviewCard({ alert, index }) {
  const tones = {
    red: {
      marker: "bg-red-500",
      badge: "border-red-200 bg-red-50 text-red-800",
      mark: "text-red-700",
    },
    amber: {
      marker: "bg-amber-500",
      badge: "border-amber-200 bg-amber-50 text-amber-900",
      mark: "text-amber-800",
    },
    green: {
      marker: "bg-emerald-500",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
      mark: "text-emerald-700",
    },
  };
  const tone = tones[alert.color];

  return (
    <article
      className={`hero-preview-card preview-card-${index} rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_18px_50px_-28px_rgba(21,49,79,0.35)] backdrop-blur-sm`}
    >
      <div className="preview-float p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.marker}`} aria-hidden="true" />
            <h3 className="truncate text-sm font-bold text-slate-900">{alert.api}</h3>
          </div>
          <span className={`preview-critical-badge rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone.badge}`}>
            {alert.status}
          </span>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-slate-600">
          <span className={`font-bold ${tone.mark}`} aria-hidden="true">{alert.icon}</span>
          {alert.detail}
        </p>
      </div>
    </article>
  );
}

export default function Hero({ onLoadSample }) {
  const heroRef = useRef(null);

  useGSAP(() => {
    const motion = gsap.matchMedia();
    motion.add("(prefers-reduced-motion: no-preference)", () => {
      const entrance = gsap.timeline({ defaults: { ease: "power3.out" } });
      entrance.from(".hero-enter", {
        autoAlpha: 0,
        y: 22,
        duration: 0.7,
        stagger: 0.12,
        clearProps: "all",
      });
      entrance.from(".hero-preview-card", {
        autoAlpha: 0,
        y: 18,
        duration: 0.65,
        stagger: 0.12,
        clearProps: "all",
      }, "-=0.35");
      gsap.to(".preview-float", {
        y: (index) => index % 2 === 0 ? -8 : 7,
        duration: 2.8,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: 0.28,
      });
      gsap.to(".preview-critical-badge", {
        scale: 1.035,
        duration: 1.15,
        transformOrigin: "50% 50%",
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    });
    return () => motion.revert();
  }, { scope: heroRef });

  function scrollToChecks() {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("submit-checks")?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <section ref={heroRef} className="relative isolate overflow-hidden rounded-[2rem] border border-[#dce8f2] bg-gradient-to-br from-[#e9f3fc] via-white to-[#edf7f1] px-6 py-9 shadow-[0_28px_80px_-60px_rgba(23,55,87,0.45)] sm:px-10 sm:py-12 lg:px-14 lg:py-14">
      <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-36 left-1/4 -z-10 h-64 w-64 rounded-full bg-emerald-200/30 blur-3xl" aria-hidden="true" />
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <div className="max-w-2xl">
          <p className="hero-enter mb-5 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#326184] shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Calm, clear API operations
          </p>
          <h1 className="hero-enter max-w-xl text-4xl font-extrabold leading-[1.06] tracking-[-0.045em] text-[#102b48] sm:text-5xl lg:text-[3.65rem]">
            Catch API issues. Get the clear next sentence.
          </h1>
          <p className="hero-enter mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            Monitor response checks and turn anomalies into readable, AI-written alerts your operations team can act on.
          </p>
          <div className="hero-enter mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#163f67] px-5 text-sm font-bold text-white shadow-lg shadow-[#163f67]/15 transition hover:bg-[#0f3459] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-sky-700"
              type="button"
              onClick={scrollToChecks}
            >
              Try it now <span aria-hidden="true">↓</span>
            </button>
            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/85 px-5 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-sky-700"
              type="button"
              onClick={onLoadSample}
            >
              Load sample <span aria-hidden="true">↗</span>
            </button>
          </div>
          <p className="hero-enter mt-4 text-xs text-slate-500">Preview cards are synthetic examples, not live system alerts.</p>
        </div>

        <div className="relative mx-auto grid w-full max-w-lg gap-3 px-1 py-3 sm:px-4" aria-label="Synthetic alert preview">
          <div className="absolute -inset-5 -z-10 rounded-[2rem] border border-white/90 bg-white/25" aria-hidden="true" />
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="mb-0 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Synthetic alert preview</p>
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-slate-500">3 APIs</span>
          </div>
          {previewAlerts.map((alert, index) => <PreviewCard key={alert.api} alert={alert} index={index} />)}
        </div>
      </div>
    </section>
  );
}
