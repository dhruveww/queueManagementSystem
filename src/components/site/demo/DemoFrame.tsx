"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Boxes, ListOrdered, Lock, Smartphone } from "lucide-react";
import { GuestPov } from "./GuestPov";
import { StaffPov } from "./StaffPov";
import { PHASE_COPY, type Phase } from "./Floor3DDemo";

/* The canvas only mounts when its tab is opened — the landing page never pays
   for three.js unless a visitor actually asks for the floor. */
const Floor3DDemo = dynamic(() => import("./Floor3DDemo").then((m) => m.Floor3DDemo), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#1e2530]">
      <div className="flex flex-col items-center gap-3">
        <span className="size-8 animate-spin rounded-full border-2 border-white/10 border-t-saffron-400" />
        <span className="u-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">
          building the room
        </span>
      </div>
    </div>
  ),
});

type TabId = "floor" | "guest" | "staff";

const TABS: { id: TabId; label: string; icon: typeof Boxes; url: string; pro?: boolean }[] = [
  { id: "floor", label: "3D floor", icon: Boxes, url: "baari.app/dashboard/floor", pro: true },
  { id: "guest", label: "Guest", icon: Smartphone, url: "baari.app/q/thindi-house" },
  { id: "staff", label: "Host board", icon: ListOrdered, url: "baari.app/dashboard" },
];

export function DemoFrame() {
  const [tab, setTab] = useState<TabId>("floor");
  const [phase, setPhase] = useState<Phase>("live");
  const active = TABS.find((t) => t.id === tab)!;
  const copy = PHASE_COPY[phase];

  return (
    <div className="relative">
      {/* the glow the frame floats on */}
      <div
        aria-hidden
        className="absolute -inset-x-8 -inset-y-10 -z-10 rounded-[3rem] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 55% at 30% 20%, rgba(255,129,18,0.22), transparent 70%), radial-gradient(55% 50% at 75% 80%, rgba(34,197,94,0.16), transparent 70%)",
        }}
      />

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1017] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] sm:rounded-[1.75rem]">
        {/* browser chrome */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2.5 sm:px-4">
          <div className="hidden gap-1.5 sm:flex">
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />
            ))}
          </div>
          <div className="u-mono flex flex-1 items-center justify-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 text-[10px] text-slate-500">
            <Lock className="size-2.5" aria-hidden />
            <span className="truncate">{active.url}</span>
          </div>
          <span className="hidden items-center gap-1.5 text-[10px] font-medium text-emerald-400 sm:flex">
            <span className="size-1.5 rounded-full bg-emerald-400 halo" />
            live
          </span>
        </div>

        {/* tab strip */}
        <div className="flex gap-1 border-b border-white/[0.06] px-2 pt-2 sm:px-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`group relative flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-[11px] font-semibold transition-colors sm:gap-2 sm:px-4 sm:text-xs ${
                  on ? "bg-white/[0.06] text-white" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon className="size-3.5" aria-hidden />
                {t.label}
                {t.pro && (
                  <span className="rounded bg-saffron-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-saffron-300">
                    Pro
                  </span>
                )}
                {on && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-saffron-500 to-amber-300" />
                )}
              </button>
            );
          })}
        </div>

        {/* stage — the floor tab keeps the product's own room colour */}
        <div
          className="relative aspect-[4/3] w-full transition-colors duration-500 sm:aspect-[16/10]"
          style={{ background: tab === "floor" ? "#1e2530" : "#0b1017" }}
        >
          {tab === "floor" && <Floor3DDemo onPhase={setPhase} />}
          {tab === "guest" && <GuestPov />}
          {tab === "staff" && <StaffPov />}

          {tab === "floor" && (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#12171f] to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 sm:p-6">
                <div key={phase} className="popin max-w-md">
                  <span className="u-mono text-[10px] font-bold tracking-[0.3em] text-saffron-400">
                    {copy.step}
                  </span>
                  <p className="u-display mt-1 text-lg font-bold leading-tight text-white sm:text-xl">
                    {copy.title}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400 sm:text-xs">
                    {copy.body}
                  </p>
                </div>
                <Legend />
              </div>
              <p className="pointer-events-none absolute right-4 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[9.5px] font-medium text-slate-400 backdrop-blur sm:right-6">
                drag to orbit · scroll to zoom
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    { c: "#22c55e", l: "Free" },
    { c: "#ef4444", l: "Occupied" },
    { c: "#f59e0b", l: "Clearing" },
    { c: "#3b82f6", l: "Reserved" },
  ];
  return (
    <ul className="hidden shrink-0 gap-3 sm:flex sm:flex-col sm:gap-1.5">
      {items.map((i) => (
        <li key={i.l} className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
          <span className="size-2 rounded-sm" style={{ background: i.c }} />
          {i.l}
        </li>
      ))}
    </ul>
  );
}
