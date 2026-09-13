"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, Clock, Users } from "lucide-react";

/**
 * The host's list board, on loop — the Basic-plan view.
 *
 * Waits tick in real seconds, a notify fires, the guest checks in, and the row
 * lifts out as they're seated. Everything below the header re-ranks itself the
 * way the real board does when a realtime UPDATE lands.
 */

interface Row {
  id: string;
  name: string;
  party: number;
  joinedSecondsAgo: number;
  phone: string;
  state: "waiting" | "notified" | "checked_in";
  failed?: boolean;
}

const SEED: Row[] = [
  { id: "a", name: "Ananya S.", party: 8, joinedSecondsAgo: 1490, phone: "•••• 21174", state: "waiting" },
  { id: "b", name: "Rohit M.", party: 2, joinedSecondsAgo: 1120, phone: "•••• 88402", state: "waiting" },
  { id: "c", name: "Kavya R.", party: 4, joinedSecondsAgo: 840, phone: "•••• 30917", state: "waiting" },
  { id: "d", name: "Farhan A.", party: 6, joinedSecondsAgo: 515, phone: "•••• 77250", state: "waiting", failed: true },
  { id: "e", name: "Meera K.", party: 2, joinedSecondsAgo: 260, phone: "•••• 41338", state: "waiting" },
  { id: "f", name: "Vikram T.", party: 4, joinedSecondsAgo: 95, phone: "•••• 60184", state: "waiting" },
];

type Step = "idle" | "notify" | "checkin" | "seat";

const STEPS: { step: Step; ms: number }[] = [
  { step: "idle", ms: 3000 },
  { step: "notify", ms: 3000 },
  { step: "checkin", ms: 2600 },
  { step: "seat", ms: 2600 },
];

export function StaffPov() {
  const [rows, setRows] = useState<Row[]>(SEED);
  const [si, setSi] = useState(0);
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState(false);
  const leavingRef = useRef<string | null>(null);

  // Waits are live seconds, not a canned string — the numbers below actually move.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const { step, ms } = STEPS[si];

    if (step === "notify") {
      setRows((r) => r.map((x) => (x.id === "a" ? { ...x, state: "notified" } : x)));
      setFlash(true);
      setTimeout(() => setFlash(false), 1200);
    }
    if (step === "checkin") {
      setRows((r) => r.map((x) => (x.id === "a" ? { ...x, state: "checked_in" } : x)));
    }
    if (step === "seat") {
      leavingRef.current = "a";
      setTimeout(() => {
        setRows((r) => r.filter((x) => x.id !== "a"));
        leavingRef.current = null;
      }, 620);
    }

    const t = setTimeout(() => {
      setSi((v) => {
        const n = (v + 1) % STEPS.length;
        if (n === 0) setRows(SEED);
        return n;
      });
    }, ms);
    return () => clearTimeout(t);
  }, [si]);

  const waiting = rows.length;
  const longest = rows.length ? Math.max(...rows.map((r) => r.joinedSecondsAgo + tick)) : 0;

  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <div className="mb-4 grid grid-cols-3 gap-2.5 sm:gap-3">
        <Stat icon={<Users className="size-3.5" />} label="In line" value={String(waiting)} tone="saffron" />
        <Stat icon={<Clock className="size-3.5" />} label="Longest wait" value={mmss(longest)} tone="amber" />
        <Stat icon={<Bell className="size-3.5" />} label="Quoted" value="25–35m" tone="emerald" />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        {flash && (
          <div className="pointer-events-none absolute inset-0 z-10 bg-emerald-400/[0.07] transition-opacity" />
        )}

        <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2.5 sm:px-4">
          <span className="u-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Queue
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 halo" />
            realtime
          </span>
        </div>

        <ul className="divide-y divide-white/[0.05]">
          {rows.map((r, idx) => (
            <QueueRow
              key={r.id}
              row={r}
              rank={idx + 1}
              seconds={r.joinedSecondsAgo + tick}
              leaving={leavingRef.current === r.id}
            />
          ))}
        </ul>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Basic runs on this list alone. Pro swaps it for the 3D floor — same data,
        same realtime channel, different picture.
      </p>
    </div>
  );
}

function QueueRow({
  row,
  rank,
  seconds,
  leaving,
}: {
  row: Row;
  rank: number;
  seconds: number;
  leaving: boolean;
}) {
  const tone =
    row.state === "checked_in"
      ? "border-emerald-400/50 bg-emerald-400/[0.08]"
      : row.state === "notified"
        ? "border-saffron-400/50 bg-saffron-400/[0.07]"
        : "border-transparent";

  return (
    <li
      className={`relative flex items-center gap-3 border-l-2 px-3.5 py-2.5 transition-all duration-500 sm:px-4 ${tone} ${
        leaving ? "liftout" : ""
      }`}
    >
      <span className="u-mono w-5 shrink-0 text-[11px] font-bold text-slate-600">{rank}</span>

      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[11px] font-bold text-slate-200">
        {row.party}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[12.5px] font-semibold text-slate-100">
          {row.name}
          {row.failed && (
            <span className="flex items-center gap-0.5 rounded bg-red-500/15 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-red-400">
              <AlertTriangle className="size-2.5" aria-hidden /> call
            </span>
          )}
        </p>
        <p className="u-mono truncate text-[10px] text-slate-500">{row.phone}</p>
      </div>

      <span className="u-mono shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
        {mmss(seconds)}
      </span>

      <span
        className={`w-[74px] shrink-0 rounded-lg px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide transition-all duration-500 ${
          row.state === "checked_in"
            ? "bg-emerald-500 text-white"
            : row.state === "notified"
              ? "bg-saffron-500 text-white halo"
              : "bg-white/[0.07] text-slate-400"
        }`}
        style={row.state === "notified" ? { ["--halo" as string]: "rgb(255 129 18 / 0.45)" } : undefined}
      >
        {row.state === "checked_in" ? "Here" : row.state === "notified" ? "Sent" : "Notify"}
      </span>
    </li>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "saffron" | "amber" | "emerald";
}) {
  const ring = {
    saffron: "text-saffron-400 bg-saffron-400/10",
    amber: "text-amber-400 bg-amber-400/10",
    emerald: "text-emerald-400 bg-emerald-400/10",
  }[tone];

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 sm:p-3">
      <span className={`inline-flex size-6 items-center justify-center rounded-md ${ring}`}>{icon}</span>
      <p className="u-mono mt-2 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="u-display mt-0.5 text-lg font-bold tabular-nums leading-none text-slate-100">{value}</p>
    </div>
  );
}

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
