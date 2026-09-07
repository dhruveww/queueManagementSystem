"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { QueueEntry, RestaurantTable, TableGroup } from "@/lib/types";

/**
 * One Supabase Realtime channel per outlet, shared by the list board and the
 * 3D floor view. Every staff device on the same outlet sees a table flip
 * colour at the same moment.
 *
 * Rows arrive as individual INSERT/UPDATE/DELETE events and are merged into
 * local state, so a host tapping "seat" doesn't wait for a full refetch. The
 * server-rendered snapshot is the initial state and also the recovery path:
 * if the socket drops and reconnects we refetch rather than trusting a gap.
 */
export interface OutletState {
  entries: QueueEntry[];
  tables: RestaurantTable[];
  groups: TableGroup[];
  connected: boolean;
}

export function useOutletRealtime(
  outletId: string,
  initial: { entries: QueueEntry[]; tables: RestaurantTable[]; groups: TableGroup[] },
): OutletState & { refetch: () => Promise<void> } {
  const [entries, setEntries] = useState(initial.entries);
  const [tables, setTables] = useState(initial.tables);
  const [groups, setGroups] = useState(initial.groups);
  const [connected, setConnected] = useState(false);
  const supabase = useRef(createClient()).current;

  const refetch = useCallback(async () => {
    const [e, t, g] = await Promise.all([
      supabase.from("queue_entries").select("*")
        .eq("outlet_id", outletId)
        .gte("joined_at", new Date(Date.now() - 12 * 3600_000).toISOString())
        .order("joined_at", { ascending: true }),
      supabase.from("restaurant_tables").select("*").eq("outlet_id", outletId),
      supabase.from("table_groups").select("*").eq("outlet_id", outletId),
    ]);
    if (e.data) setEntries(e.data as QueueEntry[]);
    if (t.data) setTables(t.data as RestaurantTable[]);
    if (g.data) setGroups(g.data as TableGroup[]);
  }, [supabase, outletId]);

  useEffect(() => {
    const upsert = <T extends { id: string }>(setter: React.Dispatch<React.SetStateAction<T[]>>) =>
      (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        setter((prev) => {
          if (payload.eventType === "DELETE") {
            return prev.filter((r) => r.id !== (payload.old as T).id);
          }
          const row = payload.new as unknown as T;
          const idx = prev.findIndex((r) => r.id === row.id);
          if (idx === -1) return [...prev, row];
          const next = [...prev];
          next[idx] = row;
          return next;
        });
      };

    const filter = `outlet_id=eq.${outletId}`;
    const channel: RealtimeChannel = supabase
      .channel(`outlet:${outletId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "queue_entries", filter },
        upsert(setEntries) as never)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "restaurant_tables", filter },
        upsert(setTables) as never)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "table_groups", filter },
        upsert(setGroups) as never)
      .subscribe((status) => {
        const live = status === "SUBSCRIBED";
        setConnected(live);
        // Reconnecting means we may have missed events while offline.
        if (live) void refetch();
      });

    return () => { void supabase.removeChannel(channel); };
  }, [supabase, outletId, refetch]);

  return { entries, tables, groups, connected, refetch };
}
