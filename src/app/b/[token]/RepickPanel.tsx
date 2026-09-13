"use client";

import { useState } from "react";
import { CalendarCheck, Check, Loader2 } from "lucide-react";
import { confirmRepick } from "./actions";

/**
 * The lead's one-tap confirmation of a time the owner offered. The page it sits
 * on is inert; this is the only thing that writes, and it writes via a server
 * action POST so a mail scanner's GET can't book on their behalf.
 */
export function RepickPanel({
  token,
  restaurantName,
  contactName,
  slotLabel,
}: {
  token: string;
  restaurantName: string;
  contactName: string;
  slotLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await confirmRepick(token);
    setBusy(false);
    if (res.ok) setDone(res.message);
    else setError(res.error);
  }

  return (
    <div className="site flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0e1116] p-7 shadow-2xl">
        <div className="mb-5 flex items-baseline gap-2">
          <span className="u-display text-lg font-extrabold text-white">baari</span>
          <span className="u-deva text-xs text-saffron-400">बारी</span>
        </div>

        {done ? (
          <>
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="size-6 text-emerald-400" aria-hidden />
            </span>
            <h1 className="u-display mt-4 text-center text-2xl font-extrabold text-white">
              Booked.
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-400">
              We&apos;re holding <span className="font-semibold text-white">{done}</span> for you.
              You&apos;ll get a confirmation once Dhruvi signs off — usually the same day.
            </p>
            <p className="mt-6 text-center text-[11px] text-slate-600">You can close this tab.</p>
          </>
        ) : (
          <>
            <p className="u-mono text-[10px] font-bold uppercase tracking-[0.25em] text-saffron-400">
              Confirm your time
            </p>
            <h1 className="u-display mt-2 text-2xl font-extrabold leading-tight text-white">
              Does this{" "}
              <span className="u-serif italic font-normal text-saffron-400">work</span>, {contactName.split(" ")[0]}?
            </h1>

            <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <p className="u-mono text-[10px] uppercase tracking-wider text-slate-500">Your call</p>
              <p className="u-display mt-1 text-lg font-bold text-white">{slotLabel}</p>
              <p className="mt-1.5 text-[12px] text-slate-500">
                About {restaurantName} · 1 hour
              </p>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              onClick={submit}
              disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-saffron-500 py-3.5 text-[15px] font-bold text-white shadow-[0_12px_40px_-10px_rgba(255,129,18,0.8)] disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarCheck className="size-4" aria-hidden />}
              {busy ? "Booking…" : "Yes, book it"}
            </button>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-600">
              Nothing is booked until you tap.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
