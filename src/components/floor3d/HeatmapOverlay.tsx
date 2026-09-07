"use client";

import { Flame } from "lucide-react";
import type { Zone } from "@/lib/types";
import { heatColor } from "./geometry";

interface HeatmapOverlayProps {
  zones: Zone[];
  zoneHeat: Record<string, number>;
}

/** Legend for the zone turnover heatmap wash — floats over the canvas. */
export function HeatmapOverlay({ zones, zoneHeat }: HeatmapOverlayProps) {
  if (zones.length === 0) return null;
  const rows = [...zones].sort((a, b) => (zoneHeat[b.id] ?? -1) - (zoneHeat[a.id] ?? -1));

  return (
    <div className="pointer-events-none absolute right-3 top-3 w-56 rounded-lg bg-slate-900/85 p-3 text-slate-100 shadow-lg ring-1 ring-white/10 backdrop-blur">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
        <Flame size={13} /> Zone turnover
      </div>
      <ul className="space-y-1.5">
        {rows.map((zone) => {
          const heat = zoneHeat[zone.id];
          return (
            <li key={zone.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 truncate">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: heat != null ? heatColor(heat) : zone.color }}
                />
                <span className="truncate text-slate-200">{zone.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-400">{heat != null ? `${Math.round(heat * 100)}%` : "—"}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
        <span>quiet</span>
        <span className="h-1.5 flex-1 mx-2 rounded-full" style={{ background: "linear-gradient(90deg, rgb(56,96,148), rgb(217,158,45), rgb(220,38,38))" }} />
        <span>slammed</span>
      </div>
    </div>
  );
}
