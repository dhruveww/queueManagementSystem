/**
 * Shared server-side loader for everything the staff board and the 3D floor
 * view render. Both views show the same outlet state — only the presentation
 * differs — so they load through one function.
 */

import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type {
  Floor, QueueEntry, RestaurantTable, TableGroup, Zone,
} from "@/lib/types";
import { OPEN_QUEUE_STATUSES } from "@/lib/types";

export interface BoardData {
  entries: QueueEntry[];       // today's line, open and recently closed
  tables: RestaurantTable[];
  groups: TableGroup[];
  floors: Floor[];
  zones: Zone[];
  /** unit id -> ISO seated_at, for "occupied for 42m" badges. */
  occupiedSince: Record<string, string>;
  /** zone id -> 0..1 turnover intensity for the heatmap overlay. */
  zoneHeat: Record<string, number>;
}

export async function loadBoard(outletId: string): Promise<BoardData> {
  const db = createAdminSupabase();
  // Twelve hours covers any single service including a late close, and keeps
  // the board from dragging in months of history on every render.
  const since = new Date(Date.now() - 12 * 3600_000).toISOString();

  const [entries, tables, groups, floors, zones, openSessions, recentSessions] =
    await Promise.all([
      db.from("queue_entries").select("*")
        .eq("outlet_id", outletId).gte("joined_at", since)
        .order("priority", { ascending: false }).order("joined_at", { ascending: true }),
      db.from("restaurant_tables").select("*").eq("outlet_id", outletId).order("sort_index"),
      db.from("table_groups").select("*").eq("outlet_id", outletId),
      db.from("floors").select("*").eq("outlet_id", outletId).order("level"),
      db.from("zones").select("*").eq("outlet_id", outletId).order("name"),
      db.from("table_sessions").select("table_id, group_id, seated_at")
        .eq("outlet_id", outletId).is("cleared_at", null),
      db.from("table_sessions").select("zone_id, seated_at, cleared_at")
        .eq("outlet_id", outletId).gte("seated_at", since).not("zone_id", "is", null),
    ]);

  const occupiedSince: Record<string, string> = {};
  for (const s of (openSessions.data ?? []) as { table_id: string | null; group_id: string | null; seated_at: string }[]) {
    if (s.table_id) occupiedSince[s.table_id] = s.seated_at;
    if (s.group_id) occupiedSince[s.group_id] = s.seated_at;
  }

  return {
    entries: (entries.data ?? []) as QueueEntry[],
    tables: (tables.data ?? []) as RestaurantTable[],
    groups: (groups.data ?? []) as TableGroup[],
    floors: (floors.data ?? []) as Floor[],
    zones: (zones.data ?? []) as Zone[],
    occupiedSince,
    zoneHeat: computeZoneHeat(
      (recentSessions.data ?? []) as { zone_id: string }[],
      (tables.data ?? []) as RestaurantTable[],
    ),
  };
}

/**
 * Turnover intensity per zone, normalised 0..1 against the busiest zone.
 * Seatings-per-table is the right unit: a 20-table hall doing 30 covers is
 * calmer than a 4-table terrace doing 12, and the heatmap should say so.
 */
export function computeZoneHeat(
  sessions: { zone_id: string }[],
  tables: RestaurantTable[],
): Record<string, number> {
  const tablesPerZone = new Map<string, number>();
  for (const t of tables) {
    tablesPerZone.set(t.zone_id, (tablesPerZone.get(t.zone_id) ?? 0) + 1);
  }

  const rate = new Map<string, number>();
  for (const s of sessions) {
    rate.set(s.zone_id, (rate.get(s.zone_id) ?? 0) + 1);
  }
  for (const [zoneId, count] of rate) {
    rate.set(zoneId, count / Math.max(1, tablesPerZone.get(zoneId) ?? 1));
  }

  const peak = Math.max(...rate.values(), 0);
  if (peak === 0) return {};
  return Object.fromEntries([...rate].map(([z, r]) => [z, r / peak]));
}

export function openEntries(entries: QueueEntry[]): QueueEntry[] {
  return entries.filter((e) => OPEN_QUEUE_STATUSES.includes(e.status));
}
