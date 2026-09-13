"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Loader2, CalendarCheck } from "lucide-react";

/**
 * Lead capture + intro-call booking, in three steps inside one panel.
 *
 * Kept inside a single <Reveal> by the parent: `html.js .reveal:not(.in)` hides
 * content until it is observed, so splitting the steps across separate Reveals
 * would leave step 2 invisible at the moment it appears.
 */

interface Slot { start: string; end: string; label: string }
interface Day { key: string; label: string; slots: Slot[] }

const FIELD =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-white " +
  "outline-none transition-colors placeholder:text-slate-600 focus:border-saffron-500/60 " +
  "focus:ring-2 focus:ring-saffron-500/20";

export function LeadForm() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [days, setDays] = useState<Day[] | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [form, setForm] = useState({
    contactName: "", restaurantName: "", city: "", phone: "", email: "",
    outlets: "1", requests: "", pricingNote: "", honeypot: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (step !== 2 || days) return;
    fetch("/api/meetings/slots")
      .then((r) => r.json())
      .then((j) => setDays(j.ok ? j.days : []))
      .catch(() => setDays([]));
  }, [step, days]);

  const canContinue =
    form.contactName.trim().length >= 2 &&
    form.restaurantName.trim().length >= 2 &&
    form.city.trim().length >= 2 &&
    form.phone.replace(/\D/g, "").length >= 10 &&
    /\S+@\S+\.\S+/.test(form.email);

  async function submit() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, outlets: Number(form.outlets), slotStart: slot.start, slotEnd: slot.end }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.error === "slot_taken") {
          // Someone took it between load and submit — refresh and let them repick.
          setError("That time just went. Here are fresh ones.");
          setSlot(null);
          setDays(null);
          setStep(2);
        } else {
          setError(json.error ?? "Something went wrong.");
        }
        return;
      }
      setConfirmed(json.slot ?? null);
      setStep(3);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === 3) {
    return (
      <Panel>
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="size-6 text-emerald-400" aria-hidden />
        </span>
        <h3 className="u-display mt-4 text-center text-2xl font-extrabold text-white">
          Got it.
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-center text-[14px] leading-relaxed text-slate-400">
          We&apos;re holding{" "}
          <span className="font-semibold text-white">{confirmed}</span> while Dhruvi confirms.
          Check your inbox — there&apos;s a note on its way.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="mb-5 flex items-center gap-2">
        {[1, 2].map((n) => (
          <span
            key={n}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
              step >= n ? "bg-saffron-500" : "bg-white/10"
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <>
          <p className="u-mono text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Step 1 of 2
          </p>
          <h3 className="u-display mt-2 text-xl font-extrabold text-white">
            Tell us about your <span className="u-serif italic text-saffron-400">room.</span>
          </h3>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <input className={FIELD} placeholder="Your name" value={form.contactName} onChange={set("contactName")} />
            <input className={FIELD} placeholder="Restaurant name" value={form.restaurantName} onChange={set("restaurantName")} />
            <input className={FIELD} placeholder="City" value={form.city} onChange={set("city")} />
            <div className="flex gap-2">
              <span className="flex items-center rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[14px] text-slate-500">+91</span>
              <input className={FIELD} placeholder="WhatsApp number" inputMode="numeric" value={form.phone} onChange={set("phone")} />
            </div>
            <input className={`${FIELD} sm:col-span-2`} placeholder="Email" type="email" value={form.email} onChange={set("email")} />
            <label className="sm:col-span-2">
              <span className="u-mono text-[10px] uppercase tracking-wider text-slate-500">How many outlets?</span>
              <input className={`${FIELD} mt-1.5`} type="number" min={1} max={500} value={form.outlets} onChange={set("outlets")} />
            </label>
            <textarea className={`${FIELD} sm:col-span-2`} rows={2} placeholder="Anything we should know? (optional)" value={form.requests} onChange={set("requests")} />
            <textarea className={`${FIELD} sm:col-span-2`} rows={2} placeholder="Pricing you'd like to discuss (optional)" value={form.pricingNote} onChange={set("pricingNote")} />
          </div>

          {/* Honeypot — real people never see or tab to this. display:none rather
              than off-screen, so password managers skip it. */}
          <input
            type="text" name="company_website" tabIndex={-1} autoComplete="off"
            aria-hidden="true" style={{ display: "none" }}
            value={form.honeypot} onChange={set("honeypot")}
          />

          <button
            onClick={() => setStep(2)}
            disabled={!canContinue}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-saffron-500 py-3.5 text-[15px] font-bold text-white shadow-[0_12px_40px_-10px_rgba(255,129,18,0.8)] transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
          >
            Pick a time <ArrowRight className="size-4" aria-hidden />
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <p className="u-mono text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Step 2 of 2
          </p>
          <h3 className="u-display mt-2 text-xl font-extrabold text-white">
            When suits you for an <span className="u-serif italic text-saffron-400">hour?</span>
          </h3>
          <p className="mt-1.5 text-[12px] text-slate-500">
            Times shown in IST. Only genuinely free slots appear.
          </p>

          {days === null && (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Checking the calendar…
            </div>
          )}

          {days?.length === 0 && (
            <p className="py-8 text-sm text-slate-500">
              No free slots in the next two weeks. Email{" "}
              <a href="mailto:dhruvi0326@gmail.com" className="text-saffron-400 underline">dhruvi0326@gmail.com</a>{" "}
              and we&apos;ll find a time.
            </p>
          )}

          {days && days.length > 0 && (
            <>
              <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
                {days.map((d, i) => (
                  <button
                    key={d.key}
                    onClick={() => setActiveDay(i)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
                      i === activeDay ? "bg-white/[0.10] text-white" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {days[activeDay]?.slots.map((s) => (
                  <button
                    key={s.start}
                    onClick={() => setSlot(s)}
                    className={`rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                      slot?.start === s.start
                        ? "border-saffron-500 bg-saffron-500 text-white"
                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="rounded-full border border-white/15 px-5 py-3 text-[14px] font-semibold text-slate-300"
            >
              Back
            </button>
            <button
              onClick={submit}
              disabled={!slot || busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-saffron-500 py-3 text-[15px] font-bold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarCheck className="size-4" aria-hidden />}
              {busy ? "Booking…" : "Request this slot"}
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-left sm:p-8">
      {children}
    </div>
  );
}
