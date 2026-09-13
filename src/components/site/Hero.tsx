"use client";

import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Magnetic, WordsIn } from "./primitives";

const BUBBLES = [
  { text: "Table T4+T5 is ready 🎉", top: "12%", left: "3%", rot: "-6deg", dur: "7s", delay: "0s" },
  { text: "#2 in line · 5–10 min", top: "62%", left: "0%", rot: "4deg", dur: "8.5s", delay: "1.2s" },
  { text: "You're getting close", top: "26%", right: "1%", rot: "5deg", dur: "6.4s", delay: "0.6s" },
  { text: "Token B-4471", top: "72%", right: "5%", rot: "-4deg", dur: "9s", delay: "2s" },
];

const MARQUEE = [
  "no app to install",
  "no SMS bills",
  "no DLT paperwork",
  "no guest login",
  "no walkaways",
  "no clipboard",
  "no shouting names",
  "no guessing the wait",
];

export function Hero() {
  return (
    <section id="top" className="grain relative overflow-hidden px-5 pb-16 pt-28 sm:pt-36">
      {/* aurora field */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span
          className="aurora left-[8%] top-[4%] size-[34rem]"
          style={{ background: "#ff8112", ["--dur" as string]: "24s" }}
        />
        <span
          className="aurora right-[4%] top-[18%] size-[28rem]"
          style={{ background: "#22c55e", opacity: 0.3, ["--dur" as string]: "19s", ["--delay" as string]: "-6s" }}
        />
        <span
          className="aurora bottom-[2%] left-[35%] size-[30rem]"
          style={{ background: "#3b82f6", opacity: 0.24, ["--dur" as string]: "27s", ["--delay" as string]: "-12s" }}
        />
      </div>

      {/* floating guest messages */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-[5] hidden lg:block">
        {BUBBLES.map((b) => (
          <span
            key={b.text}
            className="bob absolute rounded-2xl rounded-tl-sm border border-white/10 bg-[#1f2c34]/80 px-3.5 py-2 text-[11px] font-medium text-slate-300 shadow-2xl backdrop-blur-sm"
            style={{
              top: b.top,
              left: b.left,
              right: b.right,
              ["--rot" as string]: b.rot,
              ["--dur" as string]: b.dur,
              ["--delay" as string]: b.delay,
            }}
          >
            {b.text}
          </span>
        ))}
      </div>

      <div className="mx-auto max-w-4xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur">
          <span className="size-1.5 rounded-full bg-emerald-400 halo" />
          <span className="u-deva text-saffron-300">मेरी बारी</span>
          <span className="text-slate-600">·</span>
          my turn
        </span>

        <h1 className="mt-7 text-[clamp(2.9rem,10vw,6.5rem)] font-extrabold leading-[0.88] tracking-[-0.05em]">
          <WordsIn text="Stop losing" className="block text-white" />
          <span className="block">
            <span className="u-serif italic text-sheen">the table</span>
          </span>
          <WordsIn text="to the wait." className="block text-white" stagger={90} />
        </h1>

        <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-slate-400 sm:text-lg">
          Guests scan a QR, go shop, and get a WhatsApp the second their table frees up.
          You run the room from a live 3D floor plan.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Magnetic
            href="#demo"
            className="group relative overflow-hidden rounded-full bg-saffron-500 px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_12px_40px_-8px_rgba(255,129,18,0.7)]"
          >
            <span className="relative z-10 flex items-center gap-2">
              Watch it run
              <ArrowDown className="size-4 transition-transform duration-300 group-hover:translate-y-0.5" aria-hidden />
            </span>
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </Magnetic>

          <Magnetic
            href="/login"
            className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-7 py-3.5 text-[15px] font-bold text-white backdrop-blur transition-colors hover:bg-white/[0.09]"
          >
            Staff sign in
            <ArrowUpRight className="size-4" aria-hidden />
          </Magnetic>
        </div>

        <dl className="mx-auto mt-14 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.05] sm:grid-cols-4">
          {[
            ["0", "apps to install"],
            ["1", "QR at the door"],
            ["₹0", "per SMS, ever"],
            ["3D", "floor, live"],
          ].map(([v, l]) => (
            <div key={l} className="bg-[#0a0d12] px-3 py-5">
              <dt className="u-display text-2xl font-extrabold text-white sm:text-3xl">{v}</dt>
              <dd className="mt-1 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">{l}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* what Baari does not need */}
      <div className="marquee relative mt-16 overflow-hidden border-y border-white/[0.06] py-3.5">
        <div className="marquee-track gap-8" style={{ ["--speed" as string]: "38s" }}>
          {[0, 1].map((pass) => (
            <div key={pass} className="flex shrink-0 items-center gap-8" aria-hidden={pass === 1}>
              {MARQUEE.map((m) => (
                <span key={m} className="flex items-center gap-8 whitespace-nowrap">
                  <span className="u-mono text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    {m}
                  </span>
                  <span className="size-1 rounded-full bg-saffron-500/70" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
