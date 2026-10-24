import { useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { Button } from "./ui/button.jsx";
import { Activity, ArrowDown, CircleCheck, Sparkles, Timer, TriangleAlert } from "lucide-react";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, SplitText);

const previewAlerts = [
  {
    api: "AppointmentAPI",
    status: "Critical",
    detail: "Failed with status 500 · 5.5 s",
    color: "red",
    icon: TriangleAlert,
  },
  {
    api: "BillingAPI",
    status: "Warning",
    detail: "Responded slowly · 3.8 s",
    color: "amber",
    icon: Timer,
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
      badge: "border-red-900/70 bg-red-950/35 text-red-200",
      mark: "text-red-300",
    },
    amber: {
      marker: "bg-amber-500",
      badge: "border-amber-800/70 bg-amber-950/30 text-amber-200",
      mark: "text-amber-300",
    },
    green: {
      marker: "bg-emerald-500",
      badge: "border-emerald-800/70 bg-emerald-950/30 text-emerald-200",
      mark: "text-emerald-300",
    },
  };
  const tone = tones[alert.color];
  const AlertIcon = alert.icon;

  return (
    <article
      className={`hero-preview-card preview-card-${index} rounded-2xl border border-[#31434f]/90 bg-[#111a24]/95 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.85)] backdrop-blur-sm`}
    >
      <div className="preview-float p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.marker}`} aria-hidden="true" />
            <h3 className="truncate text-sm font-bold text-[#ecf4f7]">{alert.api}</h3>
          </div>
          <span className={`preview-critical-badge rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone.badge}`}>
            {alert.status}
          </span>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-[#9badb8]">
          <AlertIcon className={`h-4 w-4 ${tone.mark}`} strokeWidth={2.5} aria-hidden="true" />
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
    let headlineSplit;
    motion.add("(prefers-reduced-motion: no-preference)", () => {
      const headline = heroRef.current?.querySelector(".hero-title");
      if (headline) {
        headlineSplit = SplitText.create(headline, {
          type: "words",
          autoSplit: true,
          onSplit(self) {
            return gsap.from(self.words, { autoAlpha: 0, y: 28, duration: 0.75, stagger: 0.055, ease: "power3.out" });
          },
        });
      }
      const entrance = gsap.timeline({ delay: 0.45, defaults: { ease: "power3.out" } });
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
    return () => { headlineSplit?.revert(); motion.revert(); };
  }, { scope: heroRef });

  function scrollToChecks() {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("submit-checks")?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <section ref={heroRef} className="relative isolate overflow-hidden rounded-[2rem] border border-[#263a46] bg-gradient-to-br from-[#0f202d] via-[#0a1016] to-[#14251c] px-6 py-9 shadow-[0_28px_80px_-60px_rgba(0,0,0,0.9)] sm:px-10 sm:py-12 lg:px-14 lg:py-14">
      <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-36 left-1/4 -z-10 h-64 w-64 rounded-full bg-emerald-200/30 blur-3xl" aria-hidden="true" />
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <div className="max-w-2xl">
          <p className="hero-enter mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-800/70 bg-[#111a24]/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#75d8d1] shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-[#5eead4]" aria-hidden="true" />
            Calm, clear API operations
          </p>
          <h1 className="hero-title max-w-xl text-4xl font-extrabold leading-[1.06] tracking-[-0.045em] text-[#f1f8fa] sm:text-5xl lg:text-[3.65rem]">
            Catch API issues. Get the clear next sentence.
          </h1>
          <p className="hero-enter mt-5 max-w-xl text-base leading-7 text-[#9badb8] sm:text-lg sm:leading-8">
            Monitor response checks and turn anomalies into readable, AI-written alerts your operations team can act on.
          </p>
          <div className="hero-enter mt-7 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="shadow-lg shadow-[#5eead4]/10" onClick={scrollToChecks}>
              Try it now <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="lg" onClick={onLoadSample}>
              Load sample <span aria-hidden="true">???</span>
            </Button>
          </div>
          <p className="hero-enter mt-4 text-xs text-[#81939e]">Preview cards are synthetic examples, not live system alerts.</p>
        </div>

        <div className="relative mx-auto grid w-full max-w-lg gap-3 px-1 py-3 sm:px-4" aria-label="Synthetic alert preview">
          <div className="absolute -inset-5 -z-10 rounded-[2rem] border border-[#52636d]/55 bg-[#101820]/25" aria-hidden="true" />
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="mb-0 text-[11px] font-bold uppercase tracking-[0.16em] text-[#81939e]">Synthetic alert preview</p>
            <span className="rounded-full bg-[#111a24]/80 px-2.5 py-1 text-[10px] font-semibold text-[#81939e]">3 APIs</span>
          </div>
          {previewAlerts.map((alert, index) => <PreviewCard key={alert.api} alert={alert} index={index} />)}
        </div>
      </div>
    </section>
  );
}
