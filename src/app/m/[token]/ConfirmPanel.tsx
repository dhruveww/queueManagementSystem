"use client";

import { useState } from "react";
import { Check, Loader2, X, CalendarClock } from "lucide-react";
import { applyOwnerAction } from "./actions";
import type { LeadAction } from "@/lib/types";

interface LeadSummary {
  contactName: string;
  restaurantName: string;
  city: string;
  email: string;
  phone: string;
  outlets: number;
  requests: string | null;
  pricingNote: string | null;
  slot: string | null;
}

/**
 * The interactive half of the owner confirm screen. The parent page is inert
 * on GET; this component is what actually POSTs, via a server action — mail
 * scanners follow links but don't run scripts or submit forms, so nothing here
 * fires until a human clicks.
 */
export function ConfirmPanel({
  token,
  action,
  lead,
  dayOptions,
}: {
  token: string;
  action: LeadAction;
  lead: LeadSummary;
  dayOptions: { key: string; label: string; slots: { start: string; label: string }[] }[];
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [activeDay, setActiveDay] = useState(0);

  const verb = action === "approve" ? "Approve" : action === "decline" ? "Decline" : "Suggest other times";
  const tone = action === "approve" ? "emerald" : action === "decline" ? "red" : "saffron";

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await applyOwnerAction(token, {
      slots: action === "reschedule" ? picked : undefined,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (res.ok) setDone(res.message);
    else setError(res.error);
  }

  if (done) {
    return (
      <Frame>
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="size-6 text-emerald-400" aria-hidden />
        </span>
        <h1 className="u-display mt-4 text-center text-2xl font-extrabold text-white">Done</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-400">{done}</p>
        <p className="mt-6 text-center text-[11px] text-slate-600">You can close this tab.</p>
      </Frame>
    );
  }

  return (
    <Frame>
      <p className="u-mono text-[10px] font-bold uppercase tracking-[0.25em] text-saffron-400">
        Confirm
      </p>
      <h1 className="u-display mt-2 text-2xl font-extrabold leading-tight text-white">
        {verb}{" "}
        <span className="u-serif italic font-normal text-saffron-400">
          {lead.restaurantName}
        </span>
        ?
      </h1>

      <dl className="mt-5 space-y-0 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-1">
        <Row label="Contact" value={`${lead.contactName} · ${lead.city}`} />
        <Row label="Phone" value={lead.phone} />
        <Row label="Email" value={lead.email} />
        <Row label="Outlets" value={String(lead.outlets)} />
        {lead.slot && <Row label="Slot" value={lead.slot} />}
      </dl>

      {lead.requests && <Quote label="What they asked" body={lead.requests} />}
      {lead.pricingNote && <Quote label="Pricing note" body={lead.pricingNote} accent />}

      {action === "reschedule" && (
        <div className="mt-5">
          <p className="u-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Offer up to 3 times
          </p>
          {dayOptions.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No free slots in the current window.</p>
          ) : (
            <>
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {dayOptions.map((d, i) => (
                  <button
                    key={d.key}
                    onClick={() => setActiveDay(i)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                      i === activeDay ? "bg-white/[0.10] text-white" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dayOptions[activeDay]?.slots.map((s) => {
                  const on = picked.includes(s.start);
                  return (
                    <button
                      key={s.start}
                      onClick={() =>
                        setPicked((p) =>
                          on ? p.filter((x) => x !== s.start) : p.length >= 3 ? p : [...p, s.start],
                        )
                      }
                      className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        on
                          ? "border-saffron-500 bg-saffron-500 text-white"
                          : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-600">{picked.length}/3 selected</p>
            </>
          )}
        </div>
      )}

      {(action === "reschedule" || action === "decline") && (
        <label className="mt-4 block">
          <span className="u-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Note to them (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-saffron-500/60"
            placeholder={action === "decline" ? "Anything you'd like them to know" : "Sorry, something came up…"}
          />
        </label>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={busy || (action === "reschedule" && picked.length === 0)}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-bold transition-transform disabled:opacity-50 ${
          tone === "emerald"
            ? "bg-emerald-500 text-white"
            : tone === "red"
              ? "border border-red-500/40 bg-red-500/10 text-red-300"
              : "bg-saffron-500 text-white"
        }`}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> :
          action === "approve" ? <Check className="size-4" aria-hidden /> :
          action === "decline" ? <X className="size-4" aria-hidden /> :
          <CalendarClock className="size-4" aria-hidden />}
        {busy ? "Working…" : `Yes, ${verb.toLowerCase()}`}
      </button>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-600">
        Nothing has changed yet — this is the confirmation step.
      </p>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="site flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0e1116] p-7 shadow-2xl">
        <div className="mb-5 flex items-baseline gap-2">
          <span className="u-display text-lg font-extrabold text-white">baari</span>
          <span className="u-deva text-xs text-saffron-400">बारी</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/[0.06] py-2.5 last:border-0">
      <dt className="u-mono shrink-0 text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-right text-[13px] font-medium text-slate-200">{value}</dd>
    </div>
  );
}

function Quote({ label, body, accent }: { label: string; body: string; accent?: boolean }) {
  return (
    <div className={`mt-4 border-l-2 pl-3 ${accent ? "border-emerald-500" : "border-saffron-500"}`}>
      <p className="u-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-300">{body}</p>
    </div>
  );
}
