"use client";

import { useEffect, useState } from "react";
import { Check, CheckCheck, QrCode, Share2 } from "lucide-react";
import { renderPreview } from "@/lib/whatsapp/templates";
import type { NotifTemplate } from "@/lib/types";

/**
 * The guest's side of a visit, on loop.
 *
 * Message bodies are rendered through the product's own `renderPreview()`
 * against the real template registry, so this demo cannot drift from what
 * Meta actually approved — change a template and the website changes too.
 */

const OUTLET = "Thindi House";
const GUEST = "Ananya";

interface Beat {
  ms: number;
  /** Queue position shown on the status card, null before joining. */
  pos: number | null;
  band: string;
  screen: "scan" | "join" | "status" | "ready";
  /** Message to push into the thread when this beat starts. */
  msg?: { template: NotifTemplate; params: string[]; button?: string };
}

const BEATS: Beat[] = [
  { ms: 2600, pos: null, band: "", screen: "scan" },
  { ms: 2800, pos: null, band: "", screen: "join" },
  {
    ms: 3600,
    pos: 7,
    band: "25–35 min",
    screen: "status",
    msg: {
      template: "queue_confirmation",
      params: [GUEST, OUTLET, "B-4471", "7", "25–35 min"],
      button: "Track my place",
    },
  },
  { ms: 2400, pos: 5, band: "18–26 min", screen: "status" },
  {
    ms: 3400,
    pos: 2,
    band: "5–10 min",
    screen: "status",
    msg: {
      template: "position_update",
      params: [GUEST, OUTLET, "2", "5–10 min"],
      button: "Track my place",
    },
  },
  {
    ms: 4600,
    pos: 0,
    band: "Now",
    screen: "ready",
    msg: {
      template: "table_ready",
      params: [GUEST, OUTLET, "T4+T5", "10"],
      button: "On my way",
    },
  },
];

interface Sent {
  key: number;
  text: string;
  button?: string;
  time: string;
}

export function GuestPov() {
  const [i, setI] = useState(0);
  const [thread, setThread] = useState<Sent[]>([]);
  const [typing, setTyping] = useState(false);

  const beat = BEATS[i];

  useEffect(() => {
    const b = BEATS[i];
    let typer: ReturnType<typeof setTimeout> | undefined;

    if (b.msg) {
      setTyping(true);
      typer = setTimeout(() => {
        setTyping(false);
        setThread((prev) => [
          ...prev,
          {
            key: i,
            text: renderPreview(b.msg!.template, b.msg!.params),
            button: b.msg!.button,
            time: clockFor(i),
          },
        ]);
      }, 900);
    }

    const next = setTimeout(() => {
      // Wrapping back to the start clears the thread for the next visitor.
      setI((v) => {
        const n = (v + 1) % BEATS.length;
        if (n === 0) {
          setThread([]);
          setTyping(false);
        }
        return n;
      });
    }, b.ms);

    return () => {
      clearTimeout(next);
      if (typer) clearTimeout(typer);
    };
  }, [i]);

  return (
    <div className="grid h-full gap-5 p-4 sm:p-6 md:grid-cols-[auto_1fr] md:gap-8">
      <div className="flex items-center justify-center">
        <Phone beat={beat} />
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-[#25d366]">
            <WhatsAppGlyph />
          </span>
          <span className="text-sm font-semibold text-slate-200">WhatsApp</span>
          <span className="u-mono ml-auto rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-emerald-300">
            delivered
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b141a] p-3 sm:p-4">
          {thread.length === 0 && !typing && (
            <p className="py-8 text-center text-xs text-slate-600">Waiting for the guest to join…</p>
          )}

          {thread.map((m) => (
            <div key={m.key} className="popin max-w-[92%] self-start">
              <div className="relative rounded-2xl rounded-tl-sm bg-[#1f2c34] px-3.5 py-2.5 shadow-lg">
                <p className="text-[12.5px] leading-relaxed text-slate-100">{m.text}</p>
                {m.button && (
                  <button className="mt-2.5 w-full rounded-lg border-t border-white/10 pt-2 text-[12px] font-semibold text-[#53bdeb] transition-colors hover:text-[#7dd3fc]">
                    {m.button}
                  </button>
                )}
                <span className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-slate-500">
                  {m.time}
                  <CheckCheck className="size-3 text-[#53bdeb]" aria-hidden />
                </span>
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex w-fit gap-1 rounded-2xl rounded-tl-sm bg-[#1f2c34] px-4 py-3">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="typing-dot size-1.5 rounded-full bg-slate-400"
                  style={{ animationDelay: `${d * 0.16}s` }}
                />
              ))}
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          No app install. No SMS. No login. Every message above is a pre-approved
          WhatsApp template — pulled live from the same registry the product sends from.
        </p>
      </div>
    </div>
  );
}

function Phone({ beat }: { beat: Beat }) {
  return (
    <div className="relative w-[212px] shrink-0 rounded-[2.2rem] border-[7px] border-slate-800 bg-[#0e1116] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
      <div className="absolute left-1/2 top-1.5 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-slate-800" />
      <div className="h-[400px] overflow-hidden rounded-[1.7rem] bg-[#f6f7f9] pt-7">
        {beat.screen === "scan" && <ScanScreen />}
        {beat.screen === "join" && <JoinScreen />}
        {(beat.screen === "status" || beat.screen === "ready") && <StatusScreen beat={beat} />}
      </div>
    </div>
  );
}

function ScanScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-5 text-center">
      <div className="halo relative rounded-2xl bg-white p-4 shadow-lg" style={{ ["--halo" as string]: "rgb(255 129 18 / 0.45)" }}>
        <QrCode className="size-16 text-ink-900" aria-hidden strokeWidth={1.3} />
        <span className="absolute inset-x-3 top-4 h-0.5 bg-saffron-500/80 shadow-[0_0_12px_2px_rgba(255,129,18,0.8)] sweepline" />
      </div>
      <p className="u-display text-base font-bold text-ink-900">Scan at the door</p>
      <p className="text-[11px] leading-relaxed text-ink-500">
        One QR. Opens in the browser — nothing to install.
      </p>
    </div>
  );
}

function JoinScreen() {
  const fields = [
    { label: "Name", value: "Ananya" },
    { label: "WhatsApp number", value: "+91 98450 21174" },
    { label: "Party size", value: "8" },
  ];
  return (
    <div className="flex h-full flex-col px-4 pt-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-saffron-600">Join the line</p>
      <p className="u-display mt-1 text-[15px] font-bold leading-tight text-ink-900">Thindi House</p>
      <div className="mt-4 space-y-2.5">
        {fields.map((f, n) => (
          <div
            key={f.label}
            className="popin rounded-xl border border-ink-200 bg-white px-3 py-2"
            style={{ animationDelay: `${300 + n * 320}ms` }}
          >
            <p className="text-[8.5px] font-medium uppercase tracking-wider text-ink-400">{f.label}</p>
            <p className="u-mono mt-0.5 text-[12px] font-semibold text-ink-900">{f.value}</p>
          </div>
        ))}
      </div>
      <div
        className="popin mt-4 rounded-xl bg-saffron-500 py-2.5 text-center text-[12px] font-bold text-white shadow-lg shadow-saffron-500/30"
        style={{ animationDelay: "1300ms" }}
      >
        Join the queue
      </div>
      <p className="mt-2.5 text-center text-[8.5px] leading-relaxed text-ink-400">
        Your number is used for this visit and deleted after.
      </p>
    </div>
  );
}

function StatusScreen({ beat }: { beat: Beat }) {
  const ready = beat.screen === "ready";
  return (
    <div className="flex h-full flex-col px-4 pt-3">
      <div className="flex items-center justify-between">
        <span className="u-mono rounded-md bg-ink-900 px-2 py-1 text-[9px] font-bold tracking-widest text-white">
          B-4471
        </span>
        <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-600">
          <span className="size-1.5 rounded-full bg-emerald-500 halo" />
          live
        </span>
      </div>

      <div
        className={`mt-4 rounded-2xl p-4 text-center transition-colors duration-700 ${
          ready ? "bg-emerald-500 shadow-lg shadow-emerald-500/30" : "bg-white shadow-sm"
        }`}
      >
        <p
          className={`text-[9px] font-semibold uppercase tracking-[0.18em] ${
            ready ? "text-emerald-50" : "text-ink-400"
          }`}
        >
          {ready ? "Your table is ready" : "Your position"}
        </p>
        <p
          key={beat.pos ?? "x"}
          className={`popin u-display mt-1 text-5xl font-extrabold leading-none ${
            ready ? "text-white" : "text-ink-900"
          }`}
        >
          {ready ? "T4+T5" : `#${beat.pos}`}
        </p>
        <p className={`mt-2 text-[11px] font-medium ${ready ? "text-emerald-50" : "text-ink-500"}`}>
          {ready ? "Held for 10 minutes" : `about ${beat.band}`}
        </p>
      </div>

      {!ready && (
        <div className="mt-4">
          <div className="flex justify-between text-[8.5px] font-medium uppercase tracking-wider text-ink-400">
            <span>joined</span>
            <span>seated</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-saffron-400 to-saffron-600 transition-[width] duration-[1200ms] ease-out"
              style={{ width: `${100 - ((beat.pos ?? 7) / 7) * 82}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-auto mb-4 space-y-2">
        <div className="flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white py-2 text-[11px] font-medium text-ink-600">
          <Share2 className="size-3" aria-hidden /> Notify a friend
        </div>
        <p className="flex items-center justify-center gap-1 text-center text-[8.5px] text-ink-400">
          <Check className="size-2.5" aria-hidden /> Go browse. We&apos;ll message you.
        </p>
      </div>
    </div>
  );
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-white" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.14c-.24.68-1.42 1.31-1.96 1.36-.5.05-.99.23-3.36-.7-2.83-1.12-4.63-3.99-4.77-4.17-.14-.19-1.14-1.52-1.14-2.9s.72-2.05.98-2.33c.26-.28.56-.35.75-.35.19 0 .37 0 .54.01.17.01.4-.07.63.48.24.56.8 1.94.87 2.08.07.14.12.3.02.49-.09.19-.14.3-.28.47-.14.16-.3.36-.42.49-.14.14-.29.29-.12.57.16.28.73 1.2 1.56 1.95 1.08.96 1.98 1.26 2.26 1.4.28.14.44.12.6-.07.17-.19.7-.81.88-1.09.19-.28.37-.23.63-.14.26.09 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.35Z" />
    </svg>
  );
}

function clockFor(i: number) {
  const base = 8 * 60 + 12 + i * 4;
  const h = Math.floor(base / 60);
  const m = base % 60;
  return `${h}:${String(m).padStart(2, "0")} pm`;
}
