"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Loader2, Wifi, WifiOff } from "lucide-react";
import { useOutletRealtime } from "@/hooks/useOutletRealtime";
import {
  seatGuestAction, setTableStatusAction, upsertTableAction,
  deleteTableAction, mergeTablesAction, unmergeGroupAction,
} from "../actions";
import {
  OPEN_QUEUE_STATUSES,
  type Floor, type QueueEntry, type RestaurantTable,
  type TableGroup, type TableStatus, type Zone,
} from "@/lib/types";
import { cn } from "@/lib/cn";

// Three.js has no business in the server bundle, and the WebGL context can
// only exist in the browser — so the whole scene is client-only.
const FloorPlan3D = dynamic(
  () => import("@/components/floor3d").then((m) => m.FloorPlan3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-ink-400">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Loading floor plan…
      </div>
    ),
  },
);

interface Props {
  outletId: string;
  canEdit: boolean;
  floors: Floor[];
  zones: Zone[];
  zoneHeat: Record<string, number>;
  initial: { entries: QueueEntry[]; tables: RestaurantTable[]; groups: TableGroup[] };
}

export function FloorView(props: Props) {
  const { entries, tables, groups, connected } = useOutletRealtime(props.outletId, props.initial);
  const [error, setError] = useState<string | null>(null);

  // The 3D scene takes the line already ordered — priority first, then arrival.
  const waiting = useMemo(
    () => entries
      .filter((e) => OPEN_QUEUE_STATUSES.includes(e.status))
      .sort((a, b) => b.priority - a.priority || a.joined_at.localeCompare(b.joined_at)),
    [entries],
  );

  /** Surfaces a server-action failure instead of letting the scene silently no-op. */
  function guard<A extends unknown[]>(fn: (...args: A) => Promise<{ ok: boolean; error?: string }>) {
    return async (...args: A) => {
      setError(null);
      const res = await fn(...args);
      if (!res.ok) setError(res.error ?? "That didn't work");
    };
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-4 pt-3">
        <h1 className="text-xl font-semibold text-white">Floor plan</h1>
        <span
          className={cn("flex items-center gap-1.5 text-xs",
            connected ? "text-status-free" : "text-status-clearing")}
        >
          {connected ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
          {connected ? "Live" : "Reconnecting"}
        </span>
        {!props.canEdit && (
          <span className="text-xs text-ink-500">View and seat only — ask a manager to edit the layout</span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">
            Dismiss
          </button>
        </div>
      )}

      {/* The scene sizes itself with h-full, so it needs a parent that owns a
          definite share of the column rather than growing to fit content. */}
      <div className="min-h-0 flex-1">
        <FloorPlan3D
          floors={props.floors}
          zones={props.zones}
          tables={tables}
          groups={groups}
          waiting={waiting}
          zoneHeat={props.zoneHeat}
          canEdit={props.canEdit}
          onSeat={guard((entryId: string, target: { tableId?: string; groupId?: string }) =>
            seatGuestAction(entryId, target))}
          onStatusChange={guard((tableId: string, status: TableStatus) =>
            setTableStatusAction(tableId, status))}
          onTableUpsert={guard((table: Partial<RestaurantTable> & { id?: string }) =>
            upsertTableAction(table))}
          onTableDelete={guard((tableId: string) => deleteTableAction(tableId))}
          onMerge={guard((tableIds: string[], label?: string) => mergeTablesAction(tableIds, label))}
          onUnmerge={guard((groupId: string) => unmergeGroupAction(groupId))}
        />
      </div>
    </div>
  );
}
