"use client";

import { Check, Minus } from "lucide-react";
import { Reveal } from "./primitives";

/**
 * The comparison is drawn against the *common shape* of SMS/app-based queue
 * products rather than against any one vendor's current plan — feature lists
 * move, and a marketing page shouldn't assert today's specifics about someone
 * else's roadmap.
 */
const ROWS: { feature: string; baari: string; them: string; themHas: boolean }[] = [
  {
    feature: "Guest gets notified on",
    baari: "WhatsApp — pre-approved templates",
    them: "SMS, or a push inside their app",
    themHas: true,
  },
  {
    feature: "Guest has to install",
    baari: "Nothing. A browser page behind a QR",
    them: "Often an app, or an SMS link",
    themHas: false,
  },
  {
    feature: "Floor view",
    baari: "Interactive 3D, multi-floor, live colours",
    them: "A list, sometimes a flat 2D map",
    themHas: false,
  },
  {
    feature: "Joining two tables",
    baari: "Two taps on the plan — one atomic group",
    them: "Usually a mental note, or not modelled",
    themHas: false,
  },
  {
    feature: "Wait estimate",
    baari: "Range, from live per-table availability",
    them: "One number, often a flat average",
    themHas: false,
  },
  {
    feature: "Two hosts tap at once",
    baari: "Resolved inside a SQL transaction",
    them: "Whoever writes last wins",
    themHas: false,
  },
  {
    feature: "Was your quote right?",
    baari: "Predicted vs actual, measured every visit",
    them: "Rarely surfaced at all",
    themHas: false,
  },
  {
    feature: "Priced in",
    baari: "Flat ₹ per outlet, per month",
    them: "Per-seat, per-quote, or in USD",
    themHas: false,
  },
  {
    feature: "Indian compliance",
    baari: "DPDP auto-purge · no DLT (no SMS)",
    them: "DLT registration for every SMS template",
    themHas: false,
  },
];

export function Usp() {
  return (
    <section id="compare" className="relative overflow-hidden px-5 py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-50"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 0%, rgba(255,129,18,0.16), transparent 70%)",
        }}
      />

      <div className="mx-auto max-w-5xl">
        {/* the single sentence that is the whole pitch */}
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="u-mono text-[11px] font-bold uppercase tracking-[0.3em] text-saffron-500">
              The unfair advantage
            </p>
            <h2 className="mt-5 text-[clamp(1.9rem,4.6vw,3.2rem)] font-extrabold leading-[1.02] text-white">
              Everyone else sells you{" "}
              <span className="text-slate-600">a waitlist.</span>
              <br />
              Baari gives you{" "}
              <span className="relative whitespace-nowrap">
                <span className="u-serif italic text-sheen">the room.</span>
                <span className="draw-line absolute -bottom-1 left-0 h-[3px] w-full rounded bg-saffron-500" />
              </span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-slate-400">
              A queue is only half the problem. The other half is the twelve square metres
              of floor you&apos;re trying to hold in your head at 8:40pm on a Saturday.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-14 overflow-hidden rounded-2xl border border-white/[0.08]">
            <div className="grid grid-cols-[1.1fr_1.3fr] bg-white/[0.03] sm:grid-cols-[1fr_1.2fr_1.2fr]">
              <div className="px-4 py-3.5 sm:px-5">
                <span className="u-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Feature
                </span>
              </div>
              <div className="border-l border-white/[0.06] bg-saffron-500/[0.08] px-4 py-3.5 sm:px-5">
                <span className="u-display text-sm font-extrabold text-saffron-300">Baari</span>
              </div>
              <div className="hidden border-l border-white/[0.06] px-4 py-3.5 sm:block sm:px-5">
                <span className="text-sm font-semibold text-slate-500">Typical queue tools</span>
              </div>
            </div>

            {ROWS.map((r, i) => (
              <div
                key={r.feature}
                className={`grid grid-cols-[1.1fr_1.3fr] border-t border-white/[0.06] sm:grid-cols-[1fr_1.2fr_1.2fr] ${
                  i % 2 ? "bg-white/[0.012]" : ""
                }`}
              >
                <div className="px-4 py-4 text-[12.5px] font-medium text-slate-300 sm:px-5">
                  {r.feature}
                </div>
                <div className="flex items-start gap-2 border-l border-white/[0.06] bg-saffron-500/[0.05] px-4 py-4 sm:px-5">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden />
                  <span className="text-[12.5px] font-semibold leading-snug text-white">{r.baari}</span>
                </div>
                <div className="hidden items-start gap-2 border-l border-white/[0.06] px-4 py-4 sm:flex sm:px-5">
                  <Minus className="mt-0.5 size-3.5 shrink-0 text-slate-600" aria-hidden />
                  <span className="text-[12.5px] leading-snug text-slate-500">{r.them}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            Right-hand column describes the common feature set of SMS- and app-based queue
            products as a category, not any single vendor&apos;s current plan. Check specifics
            against whoever you&apos;re comparing.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
