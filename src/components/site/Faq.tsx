"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Reveal } from "./primitives";

const FAQS = [
  {
    q: "Does the guest need to install anything?",
    a: "No. The QR opens an ordinary web page, they type four things, and they're in line. Updates arrive in WhatsApp, which is already on the phone.",
  },
  {
    q: "What if the guest isn't on WhatsApp?",
    a: "Baari detects it at join time and flags the entry so your host knows to call that one guest by name. There is no SMS fallback anywhere in the product — that's deliberate, not a gap.",
  },
  {
    q: "Do I need a WhatsApp Business account to try it?",
    a: "Not to try it. A mock provider ships in the box: it renders every message to the console so you can run the entire queue lifecycle before you talk to Meta.",
  },
  {
    q: "Two hosts tap the same table at the same time. Then what?",
    a: "One of them wins and the other sees the table is gone. Seating, clearing, merging and un-merging are plpgsql functions that claim the table and move the queue entry in a single transaction — not a sequence of updates that can interleave.",
  },
  {
    q: "How is the wait time calculated?",
    a: "Both modes answer one question: when does the Nth-soonest table that fits your party free up? Pro uses real per-table status plus how long each occupied table has been sitting. Basic assumes every matching table is mid-turn. Either way you get a range, never a single number pretending to be certain.",
  },
  {
    q: "Can I see whether my quotes were actually accurate?",
    a: "Yes — that's the point of storing the join-time quote and never overwriting it. Analytics compares what you promised against what happened, per visit.",
  },
  {
    q: "What happens to guest phone numbers?",
    a: "They're used for the visit and purged automatically on a retention schedule by the nightly job, in line with DPDP. Guests never get a login, and their numbers are unreachable from any browser — guest pages run server-side only.",
  },
  {
    q: "What's actually different between Basic and Pro?",
    a: "One flag. Whether the 3D floor renders, and which wait-estimation method runs. Your tables, floors, zones and geometry are stored either way — upgrading migrates nothing.",
  },
  {
    q: "Multiple outlets?",
    a: "Priced per outlet, switched from a dropdown, and rolled up together in analytics. Each outlet keeps its own floors, tables and queue.",
  },
  {
    q: "Does the 3D floor need a powerful tablet?",
    a: "It's a plain WebGL canvas that renders on demand rather than every frame, with one instanced draw call for every chair on the floor. Mid-range Android tablets handle it. Basic's list view exists for the ones that don't.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="px-5 py-24 sm:py-32">
      <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
        <Reveal>
          <div className="md:sticky md:top-28">
            <p className="u-mono text-[11px] font-bold uppercase tracking-[0.3em] text-saffron-500">
              FAQ
            </p>
            <h2 className="mt-4 text-[clamp(2rem,4.6vw,3.2rem)] font-extrabold leading-[0.98] text-white">
              The <span className="u-serif italic text-saffron-400">awkward</span> questions.
            </h2>
            <p className="mt-5 text-[14px] leading-relaxed text-slate-400">
              Still stuck?{" "}
              <a
                href="#contact"
                className="font-semibold text-white underline decoration-saffron-500 decoration-2 underline-offset-4"
              >
                dhruvi0326@gmail.com
              </a>
            </p>
          </div>
        </Reveal>

        <ul className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {FAQS.map((f, i) => {
            const on = open === i;
            return (
              <li key={f.q}>
                <button
                  onClick={() => setOpen(on ? null : i)}
                  className="group flex w-full items-start gap-4 py-5 text-left"
                  aria-expanded={on}
                >
                  <span
                    className={`u-mono mt-0.5 shrink-0 text-[10px] font-bold tabular-nums transition-colors ${
                      on ? "text-saffron-400" : "text-slate-600"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`flex-1 text-[14.5px] font-semibold leading-snug transition-colors ${
                      on ? "text-white" : "text-slate-300 group-hover:text-white"
                    }`}
                  >
                    {f.q}
                  </span>
                  <Plus
                    className={`mt-0.5 size-4 shrink-0 transition-transform duration-300 ${
                      on ? "rotate-[135deg] text-saffron-400" : "text-slate-600"
                    }`}
                    aria-hidden
                  />
                </button>
                <div className={`acc-body ${on ? "open" : ""}`}>
                  <div>
                    <p className="pb-6 pl-[2.1rem] pr-8 text-[13px] leading-relaxed text-slate-400">
                      {f.a}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
