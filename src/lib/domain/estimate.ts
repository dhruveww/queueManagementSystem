/**
 * Assembles the live inputs the wait-time engine needs, and picks the method
 * from the org's plan: Pro gets live table availability, Basic gets the
 * rolling average. The plan flag is the only difference — the data model is
 * identical, so an upgrade changes estimates immediately with no migration.
 */

import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  estimateWait, unitsFromTables, positionInLine,
  partyBucket, DEFAULT_TURN_MIN, type TurnStats, type WaitEstimate,
} from "./waitTime";
import type {
  PlanTier, QueueEntry, RestaurantTable, TableGroup, WaitMethod, Zone, ZoneKind,
} from "@/lib/types";
import { OPEN_QUEUE_STATUSES } from "@/lib/types";

export interface EstimateContext {
  units: ReturnType<typeof unitsFromTables>;
  turnStats: TurnStats;
  method: WaitMethod;
  openEntries: QueueEntry[];
}

export function methodForPlan(plan: PlanTier): WaitMethod {
  return plan === "pro" ? "live_availability" : "rolling_average";
}

export async function loadEstimateContext(
  outletId: string,
  plan: PlanTier,
): Promise<EstimateContext> {
  const db = createAdminSupabase();

  const [tablesRes, groupsRes, zonesRes, entriesRes, turnRes, openSessionsRes] =
    await Promise.all([
      db.from("restaurant_tables").select("*").eq("outlet_id", outletId),
      db.from("table_groups").select("*").eq("outlet_id", outletId),
      db.from("zones").select("id, kind").eq("outlet_id", outletId),
      db.from("queue_entries").select("*")
        .eq("outlet_id", outletId).in("status", OPEN_QUEUE_STATUSES)
        .order("joined_at", { ascending: true }),
      db.rpc("outlet_turn_stats", { p_outlet: outletId, p_days: 30 }),
      db.from("table_sessions").select("table_id, group_id, seated_at")
        .eq("outlet_id", outletId).is("cleared_at", null),
    ]);

  const turnStats: TurnStats = { ...DEFAULT_TURN_MIN };
  for (const row of (turnRes.data ?? []) as { bucket: number; avg_turn_min: number | null; sample_size: number }[]) {
    // Ignore thin samples — three lunches don't define a turn time.
    if (row.avg_turn_min && row.sample_size >= 5) turnStats[row.bucket] = row.avg_turn_min;
  }

  const occupiedSince: Record<string, string> = {};
  for (const s of (openSessionsRes.data ?? []) as { table_id: string | null; group_id: string | null; seated_at: string }[]) {
    if (s.table_id) occupiedSince[s.table_id] = s.seated_at;
    if (s.group_id) occupiedSince[s.group_id] = s.seated_at;
  }

  return {
    units: unitsFromTables(
      (tablesRes.data ?? []) as RestaurantTable[],
      (groupsRes.data ?? []) as TableGroup[],
      (zonesRes.data ?? []) as Pick<Zone, "id" | "kind">[],
      occupiedSince,
    ),
    turnStats,
    method: methodForPlan(plan),
    openEntries: (entriesRes.data ?? []) as QueueEntry[],
  };
}

/** Estimate for a guest who hasn't joined yet — they'd be last in line. */
export function estimateForNewParty(
  ctx: EstimateContext,
  partySize: number,
  zonePref?: ZoneKind | null,
): WaitEstimate {
  const bucket = partyBucket(partySize);
  const ahead = ctx.openEntries.filter((e) => partyBucket(e.party_size) === bucket).length;
  return estimateWait({
    partySize,
    position: ahead + 1,
    units: ctx.units,
    turnStats: ctx.turnStats,
    method: ctx.method,
    zonePref,
  });
}

/** Estimate for a guest already in line. */
export function estimateForEntry(ctx: EstimateContext, entry: QueueEntry): WaitEstimate {
  return estimateWait({
    partySize: entry.party_size,
    position: positionInLine(entry, ctx.openEntries),
    units: ctx.units,
    turnStats: ctx.turnStats,
    method: ctx.method,
    zonePref: entry.zone_pref,
  });
}
