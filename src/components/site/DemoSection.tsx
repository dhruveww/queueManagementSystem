"use client";

import { Reveal } from "./primitives";
import { DemoFrame } from "./demo/DemoFrame";

export function DemoSection() {
  return (
    <section id="demo" className="relative px-5 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="u-mono text-[11px] font-bold uppercase tracking-[0.3em] text-saffron-500">
                Live demo · no signup
              </p>
              <h2 className="mt-4 max-w-xl text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[0.95] text-white">
                Both sides of the{" "}
                <span className="u-serif italic text-saffron-400">same minute.</span>
              </h2>
            </div>
            <p className="max-w-xs text-[13px] leading-relaxed text-slate-400">
              Switch tabs to watch the guest&apos;s phone, the host&apos;s board, and the
              3D floor — all running the same visit.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <DemoFrame />
        </Reveal>
      </div>
    </section>
  );
}
