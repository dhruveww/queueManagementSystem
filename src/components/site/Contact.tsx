"use client";

import { ArrowUpRight, Mail } from "lucide-react";
import { Reveal } from "./primitives";
import { LeadForm } from "./LeadForm";

export function Contact() {
  return (
    <>
      <section id="contact" className="grain relative overflow-hidden px-5 py-28 sm:py-36">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <span
            className="aurora left-1/2 top-1/2 size-[40rem] -translate-x-1/2 -translate-y-1/2"
            style={{ background: "#ff8112", opacity: 0.3, ["--dur" as string]: "20s" }}
          />
        </div>

        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <span className="u-deva text-xl text-saffron-400">अब आपकी बारी</span>
            <h2 className="mt-4 text-[clamp(2.3rem,7vw,4.6rem)] font-extrabold leading-[0.94] text-white">
              Now it&apos;s <span className="u-serif italic text-sheen">your turn.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-[15px] leading-relaxed text-slate-400">
              One QR at your door, and the queue runs itself. Send a line and we&apos;ll
              set your floor up.
            </p>

            <div className="mt-10">
              <LeadForm />
            </div>

            {/* The slot picker needs JS. Without it the CTA must still work. */}
            <noscript>
              <a
                href="mailto:dhruvi0326@gmail.com?subject=Baari%20—%20I%20want%20a%20demo&body=Restaurant%3A%0ACity%3A%0AOutlets%3A%0ARough%20covers%20a%20night%3A"
                className="group mx-auto mt-10 inline-flex items-center gap-3 rounded-full bg-white px-7 py-4 text-[15px] font-extrabold text-[#07090d]"
              >
                <Mail className="size-4" aria-hidden />
                dhruvi0326@gmail.com
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            </noscript>

            <p className="mt-5 text-[12px] text-slate-600">
              Or just email{" "}
              <a href="mailto:dhruvi0326@gmail.com" className="text-slate-400 underline decoration-slate-700 underline-offset-2">
                dhruvi0326@gmail.com
              </a>{" "}
              — replies from a human, usually the same day.
            </p>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/[0.07] px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="flex items-baseline gap-2">
              <span className="u-display text-lg font-extrabold text-white">baari</span>
              <span className="u-deva text-sm text-saffron-400">बारी</span>
            </p>
            <p className="mt-1.5 text-[11.5px] text-slate-600">
              WhatsApp-first virtual queuing, built for Indian restaurants.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 sm:ml-auto">
            {[
              ["Demo", "#demo"],
              ["Pricing", "#pricing"],
              ["FAQ", "#faq"],
              ["Staff sign in", "/login"],
              ["dhruvi0326@gmail.com", "mailto:dhruvi0326@gmail.com"],
            ].map(([l, h]) => (
              <a
                key={l}
                href={h}
                className="text-[11.5px] font-medium text-slate-500 transition-colors hover:text-white"
              >
                {l}
              </a>
            ))}
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-[11px] text-slate-700">
          Guest numbers are used only for the visit and deleted automatically afterwards.
        </p>
      </footer>
    </>
  );
}
