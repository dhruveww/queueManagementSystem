"use client";

import {
  Boxes,
  Building2,
  Combine,
  Gauge,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { Counter, Reveal, Tilt } from "./primitives";

const BENEFITS = [
  {
    icon: MessageCircle,
    title: "Lands where they already are",
    body: "Every update is a WhatsApp template. No install, no login, no app icon nobody taps twice.",
    tint: "#25d366",
  },
  {
    icon: Users,
    title: "The queue stops leaking",
    body: "A guest who can go browse is a guest who is still there in 25 minutes.",
    tint: "#ff8112",
  },
  {
    icon: Boxes,
    title: "The floor, not a list",
    body: "Rotate it, zoom it, switch floors. Colours change themselves the instant a table clears.",
    tint: "#3b82f6",
  },
  {
    icon: Combine,
    title: "Merge in two taps",
    body: "Party of 8, two fours free. Tap, tap, merged — one group with a real capacity of 8.",
    tint: "#22d3ee",
  },
  {
    icon: Gauge,
    title: "Honest waits, not wishes",
    body: "A range from live table data and how long each one has been sitting. Never a single fake number.",
    tint: "#f59e0b",
  },
  {
    icon: ShieldCheck,
    title: "Two hosts, one table",
    body: "Seating happens inside a database transaction. Both tablets tap at once and nobody gets double-booked.",
    tint: "#22c55e",
  },
  {
    icon: TrendingUp,
    title: "Numbers that bite",
    body: "Where you lose guests by wait bucket, which zone jams, and whether your own quotes are trustworthy.",
    tint: "#a78bfa",
  },
  {
    icon: Building2,
    title: "Second outlet in a click",
    body: "Tables, floors and geometry are stored for every plan. Upgrading is a flag — nothing to migrate.",
    tint: "#f472b6",
  },
];

export function Benefits() {
  return (
    <section id="why" className="relative px-5 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="u-mono text-[11px] font-bold uppercase tracking-[0.3em] text-saffron-500">
            Why restaurants switch
          </p>
          <h2 className="mt-4 max-w-2xl text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[0.95] text-white">
            Eight reasons the <span className="u-serif italic text-saffron-400">clipboard</span> loses.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b, i) => {
            const Icon = b.icon;
            return (
              <Reveal key={b.title} delay={i * 70}>
                <Tilt className="group h-full">
                  <div
                    className="tilt-inner relative h-full overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition-colors duration-300 hover:border-white/20"
                    style={{
                      backgroundImage:
                        "radial-gradient(220px circle at var(--mx,50%) var(--my,50%), rgba(255,255,255,0.06), transparent 65%)",
                    }}
                  >
                    <span
                      className="inline-flex size-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                      style={{ background: `${b.tint}1f`, color: b.tint }}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-[15px] font-bold leading-snug text-white">{b.title}</h3>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">{b.body}</p>
                    <span
                      className="absolute -bottom-px left-5 right-5 h-px origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
                      style={{ background: b.tint }}
                    />
                  </div>
                </Tilt>
              </Reveal>
            );
          })}
        </div>

        {/* the payoff band */}
        <Reveal delay={120}>
          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.05] sm:grid-cols-3">
            {[
              { v: <Counter to={98} suffix="%" />, l: "WhatsApp open rate", s: "vs ~20% for email, and SMS you pay per hit" },
              { v: <Counter to={0} prefix="₹" />, l: "Per-message cost in dev", s: "Mock provider ships in the box — test the whole lifecycle free" },
              { v: <><Counter to={60} suffix="s" /></>, l: "Cron heartbeat", s: "Nudges, no-shows and rollups run without a human" },
            ].map((s) => (
              <div key={s.l} className="bg-[#0a0d12] p-6">
                <p className="u-display text-4xl font-extrabold text-white">{s.v}</p>
                <p className="mt-2 text-[13px] font-semibold text-slate-200">{s.l}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">{s.s}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
