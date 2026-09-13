"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import { Counter, Reveal } from "./primitives";

export interface PlanCard {
  tier: "basic" | "pro";
  name: string;
  priceInr: number;
  features: string[];
}

export function Pricing({ plans }: { plans: PlanCard[] }) {
  return (
    <section id="pricing" className="relative px-5 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="text-center">
            <p className="u-mono text-[11px] font-bold uppercase tracking-[0.3em] text-saffron-500">
              Pricing
            </p>
            <h2 className="mt-4 text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[0.98] text-white">
              Flat rupees. <span className="u-serif italic text-saffron-400">Per outlet.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-slate-400">
              No per-guest fee, no per-message fee, no seat licences. GST invoiced against
              your GSTIN.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {plans.map((p, i) => (
            <Reveal key={p.tier} delay={i * 120}>
              <PlanPanel plan={p} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <Calculator plans={plans} />
        </Reveal>
      </div>
    </section>
  );
}

function PlanPanel({ plan }: { plan: PlanCard }) {
  const pro = plan.tier === "pro";
  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl p-7 transition-transform duration-500 hover:-translate-y-1 ${
        pro
          ? "border-2 border-saffron-500/60 bg-gradient-to-b from-saffron-500/[0.12] to-transparent"
          : "border border-white/[0.08] bg-white/[0.02]"
      }`}
    >
      {pro && (
        <>
          <span className="absolute right-5 top-5 flex items-center gap-1 rounded-full bg-saffron-500 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider text-white">
            <Sparkles className="size-2.5" aria-hidden /> The 3D one
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-40 blur-3xl"
            style={{ background: "#ff8112" }}
          />
        </>
      )}

      <h3 className="u-display text-xl font-extrabold text-white">{plan.name}</h3>

      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="u-display text-5xl font-extrabold tracking-tight text-white">
          ₹<Counter to={plan.priceInr} />
        </span>
        <span className="text-[12px] font-medium text-slate-500">/outlet/mo</span>
      </p>

      <ul className="mt-7 space-y-2.5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check
              className={`mt-0.5 size-3.5 shrink-0 ${pro ? "text-saffron-400" : "text-emerald-400"}`}
              aria-hidden
            />
            <span className="text-[12.5px] leading-relaxed text-slate-300">{f}</span>
          </li>
        ))}
      </ul>

      <a
        href="mailto:dhruvi0326@gmail.com?subject=Baari%20—%20I%20want%20a%20demo"
        className={`mt-8 flex items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-bold transition-transform duration-300 hover:scale-[1.03] ${
          pro
            ? "bg-saffron-500 text-white shadow-[0_12px_40px_-10px_rgba(255,129,18,0.8)]"
            : "border border-white/15 bg-white/[0.05] text-white hover:bg-white/10"
        }`}
      >
        Start with {plan.name}
        <ArrowUpRight className="size-4" aria-hidden />
      </a>
    </div>
  );
}

/**
 * Every input here is the restaurant's own number, including the recovery
 * assumption — the point is to let an owner argue with it, not to hand them a
 * figure they have to take on faith.
 */
function Calculator({ plans }: { plans: PlanCard[] }) {
  const [walkaways, setWalkaways] = useState(14);
  const [spend, setSpend] = useState(650);
  const [nights, setNights] = useState(12);
  const [recovered, setRecovered] = useState(40);

  const pro = plans.find((p) => p.tier === "pro")?.priceInr ?? 3999;

  const { monthly, multiple } = useMemo(() => {
    const m = Math.round(walkaways * (recovered / 100) * spend * nights);
    return { monthly: m, multiple: m / pro };
  }, [walkaways, spend, nights, recovered, pro]);

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <div className="grid gap-8 p-7 md:grid-cols-[1.1fr_1fr] md:gap-10 md:p-9">
        <div>
          <p className="u-mono text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Your numbers
          </p>
          <h3 className="u-display mt-2 text-xl font-extrabold text-white">
            What is the wait costing you?
          </h3>

          <div className="mt-6 space-y-5">
            <Slider
              label="Guests who walk away, per busy night"
              value={walkaways}
              min={2}
              max={60}
              onChange={setWalkaways}
              display={String(walkaways)}
            />
            <Slider
              label="Average spend per guest"
              value={spend}
              min={150}
              max={2500}
              step={50}
              onChange={setSpend}
              display={`₹${spend.toLocaleString("en-IN")}`}
            />
            <Slider
              label="Busy nights a month"
              value={nights}
              min={2}
              max={30}
              onChange={setNights}
              display={String(nights)}
            />
            <Slider
              label="Share you'd actually keep with a virtual queue"
              value={recovered}
              min={5}
              max={80}
              step={5}
              onChange={setRecovered}
              display={`${recovered}%`}
              hint="Your assumption — drag it down until you believe it."
            />
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-emerald-500/[0.14] to-transparent p-6 ring-1 ring-emerald-400/20">
          <p className="u-mono text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-400">
            Recovered a month
          </p>
          <p className="u-display mt-2 text-[clamp(2.2rem,6vw,3.4rem)] font-extrabold leading-none text-white">
            ₹{monthly.toLocaleString("en-IN")}
          </p>

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-[12.5px] leading-relaxed text-slate-300">
              Baari Pro costs{" "}
              <span className="u-mono font-bold text-white">₹{pro.toLocaleString("en-IN")}</span> for
              that outlet.
            </p>
            <p className="u-display mt-3 text-2xl font-extrabold text-emerald-400">
              {multiple >= 1
                ? `Pays for itself ${multiple.toFixed(multiple < 10 ? 1 : 0)}× over`
                : "Below break-even at these numbers"}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              An illustration built entirely from the four values you set — not a
              guarantee, and not measured across other restaurants.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  display: string;
  hint?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium text-slate-400">{label}</span>
        <span className="u-mono shrink-0 text-[13px] font-bold text-white">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none
                   [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                   [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(255,129,18,0.35)]
                   [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full
                   [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
        style={{
          background: `linear-gradient(to right, #ff8112 ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
        }}
      />
      {hint && <span className="mt-1.5 block text-[10.5px] text-slate-600">{hint}</span>}
    </label>
  );
}
