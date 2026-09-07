"use client";

import { Clock, Hash, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ZONE_KIND_LABEL, type QueueEntry } from "@/lib/types";
import { cn, formatElapsed } from "./utils";

interface SeatingPanelProps {
  waiting: QueueEntry[];
  armedEntryId: string | null;
  onArm: (entryId: string) => void;
  onCancel: () => void;
}

/** The always-on waiting list. Tap a guest to arm one-tap seating. */
export function SeatingPanel({ waiting, armedEntryId, onArm, onCancel }: SeatingPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-white/10 bg-slate-900/95 text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">Waiting ({waiting.length})</h2>
      </div>

      {armedEntryId && (
        <div className="flex items-center justify-between gap-2 bg-sky-500/15 px-4 py-2 text-xs text-sky-200">
          <span>Tap a highlighted table to seat this guest.</span>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 font-medium text-slate-200 hover:bg-slate-700"
          >
            <X size={12} /> Cancel
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {waiting.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No one is waiting.</p>}
        <ul className="divide-y divide-white/5">
          {waiting.map((entry) => {
            const armed = entry.id === armedEntryId;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onArm(entry.id)}
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors",
                    armed ? "bg-sky-500/20 ring-1 ring-inset ring-sky-400" : "hover:bg-slate-800/70"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium text-slate-100">{entry.guest_name}</span>
                    <span className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-mono text-slate-300">
                      <Hash size={10} />
                      {entry.ticket_code}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Users size={12} /> {entry.party_size}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {formatElapsed(entry.joined_at, now)}
                    </span>
                    {entry.zone_pref && (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                        {ZONE_KIND_LABEL[entry.zone_pref]}
                      </span>
                    )}
                    {entry.status !== "waiting" && (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                        {entry.status.replace("_", " ")}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
