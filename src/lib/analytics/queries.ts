/**
 * Analytics query layer.
 *
 * Reads pre-aggregated `analytics_daily` rows for anything historical (so a
 * year of history costs one indexed scan, not a million-row aggregate), and
 * goes to the live tables only for today's operational snapshot and for the
 * drill-downs that need row-level detail.
 */

import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { AnalyticsDaily, PlanTier, TableStatus } from "@/lib/types";

export interface DateRange { from: string; to: string }   // YYYY-MM-DD inclusive

export function rangeForDays(days: number, today = new Date()): DateRange {
  const to = new Date(today);
  const from = new Date(today);
  from.setDate(from.getDate() - (days - 1));
  return { from: iso(from), to: iso(to) };
}

export function previousRange({ from, to }: DateRange): DateRange {
  const f = new Date(from), t = new Date(to);
  const span = Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1;
  const pf = new Date(f); pf.setDate(pf.getDate() - span);
  const pt = new Date(f); pt.setDate(pt.getDate() - 1);
  return { from: iso(pf), to: iso(pt) };
}

function iso(d: Date) { return d.toISOString().slice(0, 10); }

// ------------------------------------------------------------- live snapshot
export interface LiveSnapshot {
  waiting: number;
  notified: number;
  avgCurrentWaitMin: number;
  longestWaitMin: number;
  tablesFree: number;
  tablesOccupied: number;
  tablesTotal: number;
  utilisationPct: number;
  seatedToday: number;
  abandonedToday: number;
}

export async function getLiveSnapshot(outletId: string): Promise<LiveSnapshot> {
  const db = createAdminSupabase();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);

  const [entriesRes, tablesRes, groupsRes] = await Promise.all([
    db.from("queue_entries").select("status, joined_at")
      .eq("outlet_id", outletId).gte("joined_at", dayStart.toISOString()),
    db.from("restaurant_tables").select("status, merged_group_id").eq("outlet_id", outletId),
    db.from("table_groups").select("status").eq("outlet_id", outletId),
  ]);

  const entries = (entriesRes.data ?? []) as { status: string; joined_at: string }[];
  const open = entries.filter((e) => ["waiting", "notified", "checked_in"].includes(e.status));
  const waits = open.map((e) => (Date.now() - new Date(e.joined_at).getTime()) / 60_000);

  // Merged members are counted once, through their group.
  const loose = ((tablesRes.data ?? []) as { status: TableStatus; merged_group_id: string | null }[])
    .filter((t) => !t.merged_group_id);
  const units: TableStatus[] = [
    ...loose.map((t) => t.status),
    ...((groupsRes.data ?? []) as { status: TableStatus }[]).map((g) => g.status),
  ];

  const occupied = units.filter((s) => s === "occupied").length;
  const total = units.length;

  return {
    waiting: open.filter((e) => e.status === "waiting").length,
    notified: open.filter((e) => e.status === "notified").length,
    avgCurrentWaitMin: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0,
    longestWaitMin: waits.length ? Math.round(Math.max(...waits)) : 0,
    tablesFree: units.filter((s) => s === "free").length,
    tablesOccupied: occupied,
    tablesTotal: total,
    utilisationPct: total ? Math.round((occupied / total) * 100) : 0,
    seatedToday: entries.filter((e) => e.status === "seated").length,
    abandonedToday: entries.filter((e) => ["no_show", "left"].includes(e.status)).length,
  };
}

// --------------------------------------------------------------- daily rows
export async function getDailyRows(
  outletIds: string[], range: DateRange,
): Promise<AnalyticsDaily[]> {
  const { data } = await createAdminSupabase()
    .from("analytics_daily").select("*")
    .in("outlet_id", outletIds)
    .gte("day", range.from).lte("day", range.to)
    .order("day");
  return (data ?? []) as AnalyticsDaily[];
}

// ------------------------------------------------------------------ summary
export interface Summary {
  joined: number;
  seated: number;
  noShow: number;
  leftQueue: number;
  abandonRatePct: number;
  seatRatePct: number;
  avgWaitMin: number;
  medianWaitMin: number;
  avgTurnMin: number;
  estErrorMin: number;
  returningPct: number;
}

export function summarise(rows: AnalyticsDaily[]): Summary {
  const sum = (k: keyof AnalyticsDaily) =>
    rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

  // Weight the averages by volume — a dead Tuesday shouldn't pull the mean
  // as hard as a packed Saturday.
  const weighted = (k: keyof AnalyticsDaily, weightKey: keyof AnalyticsDaily = "seated") => {
    let num = 0, den = 0;
    for (const r of rows) {
      const v = Number(r[k]), w = Number(r[weightKey]);
      if (Number.isFinite(v) && v !== null && w > 0) { num += v * w; den += w; }
    }
    return den ? num / den : 0;
  };

  const joined = sum("joined");
  const seated = sum("seated");
  const noShow = sum("no_show");
  const leftQueue = sum("left_queue");
  const abandoned = noShow + leftQueue;
  const returning = sum("returning_guests");
  const identified = returning + sum("new_guests");

  return {
    joined, seated, noShow, leftQueue,
    abandonRatePct: joined ? round1((abandoned / joined) * 100) : 0,
    seatRatePct: joined ? round1((seated / joined) * 100) : 0,
    avgWaitMin: round1(weighted("avg_wait_min")),
    medianWaitMin: round1(weighted("median_wait_min")),
    avgTurnMin: round1(weighted("avg_turn_min")),
    estErrorMin: round1(weighted("est_error_min")),
    returningPct: identified ? round1((returning / identified) * 100) : 0,
  };
}

function round1(n: number) { return Math.round(n * 10) / 10; }

// --------------------------------------------------------------- peak hours
export interface HeatCell { dow: number; hour: number; joined: number; avgWait: number }

/** Footfall by hour × day-of-week, built from the stored hourly rollups. */
export function peakHeatmap(rows: AnalyticsDaily[]): HeatCell[] {
  const acc = new Map<string, { joined: number; waitSum: number; waitN: number }>();
  for (const r of rows) {
    const dow = new Date(r.day + "T00:00:00").getDay();
    for (const [hourStr, b] of Object.entries(r.hourly ?? {})) {
      const key = `${dow}:${hourStr}`;
      const cur = acc.get(key) ?? { joined: 0, waitSum: 0, waitN: 0 };
      cur.joined += b.joined ?? 0;
      if (b.avg_wait) { cur.waitSum += b.avg_wait * (b.seated || 1); cur.waitN += b.seated || 1; }
      acc.set(key, cur);
    }
  }
  return [...acc].map(([key, v]) => {
    const [dow, hour] = key.split(":").map(Number);
    return { dow, hour, joined: v.joined, avgWait: v.waitN ? round1(v.waitSum / v.waitN) : 0 };
  });
}

/** Average wait and volume by hour of day, collapsed across the range. */
export function waitByHour(rows: AnalyticsDaily[]) {
  const acc = new Map<number, { joined: number; seated: number; waitSum: number }>();
  for (const r of rows) {
    for (const [h, b] of Object.entries(r.hourly ?? {})) {
      const hour = Number(h);
      const cur = acc.get(hour) ?? { joined: 0, seated: 0, waitSum: 0 };
      cur.joined += b.joined ?? 0;
      cur.seated += b.seated ?? 0;
      cur.waitSum += (b.avg_wait ?? 0) * (b.seated ?? 0);
      acc.set(hour, cur);
    }
  }
  return [...acc]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, v]) => ({
      hour, label: `${String(hour).padStart(2, "0")}:00`,
      joined: v.joined, seated: v.seated,
      avgWait: v.seated ? round1(v.waitSum / v.seated) : 0,
    }));
}

// ----------------------------------------------------- row-level drill-downs
export interface AbandonBucket { bucket: string; abandoned: number; total: number; ratePct: number }

/**
 * Where guests give up. Bucketed by how long they'd actually waited when they
 * left, which is the number an owner can act on: "we lose a third of everyone
 * who crosses 40 minutes" tells you exactly where to add capacity or cap the
 * quote.
 */
export async function abandonmentByWait(
  outletIds: string[], range: DateRange,
): Promise<AbandonBucket[]> {
  const db = createAdminSupabase();
  const { data } = await db.from("queue_entries")
    .select("status, joined_at, seated_at, closed_at")
    .in("outlet_id", outletIds)
    .gte("joined_at", `${range.from}T00:00:00Z`)
    .lte("joined_at", `${range.to}T23:59:59Z`);

  const edges = [0, 10, 20, 30, 45, 60, Infinity];
  const names = ["0–10 min", "10–20 min", "20–30 min", "30–45 min", "45–60 min", "60+ min"];
  const buckets = names.map((bucket) => ({ bucket, abandoned: 0, total: 0, ratePct: 0 }));

  for (const row of (data ?? []) as {
    status: string; joined_at: string; seated_at: string | null; closed_at: string | null;
  }[]) {
    const end = row.seated_at ?? row.closed_at;
    if (!end) continue;
    const mins = (new Date(end).getTime() - new Date(row.joined_at).getTime()) / 60_000;
    const i = edges.findIndex((e, idx) => mins >= e && mins < edges[idx + 1]);
    if (i < 0) continue;
    buckets[i].total++;
    if (["no_show", "left"].includes(row.status)) buckets[i].abandoned++;
  }

  for (const b of buckets) b.ratePct = b.total ? round1((b.abandoned / b.total) * 100) : 0;
  return buckets;
}

export interface ZonePerf {
  zoneId: string; zoneName: string; floorName: string;
  seatings: number; avgTurnMin: number; tables: number; turnsPerTable: number;
}

export async function zonePerformance(
  outletId: string, range: DateRange,
): Promise<ZonePerf[]> {
  const db = createAdminSupabase();
  const [sessionsRes, zonesRes, tablesRes, floorsRes] = await Promise.all([
    db.from("table_sessions").select("zone_id, seated_at, cleared_at")
      .eq("outlet_id", outletId)
      .gte("seated_at", `${range.from}T00:00:00Z`)
      .lte("seated_at", `${range.to}T23:59:59Z`),
    db.from("zones").select("id, name, floor_id").eq("outlet_id", outletId),
    db.from("restaurant_tables").select("zone_id").eq("outlet_id", outletId),
    db.from("floors").select("id, name").eq("outlet_id", outletId),
  ]);

  const floors = new Map(((floorsRes.data ?? []) as { id: string; name: string }[])
    .map((f) => [f.id, f.name]));
  const tableCount = new Map<string, number>();
  for (const t of (tablesRes.data ?? []) as { zone_id: string }[]) {
    tableCount.set(t.zone_id, (tableCount.get(t.zone_id) ?? 0) + 1);
  }

  const stats = new Map<string, { n: number; turnSum: number; turnN: number }>();
  for (const s of (sessionsRes.data ?? []) as {
    zone_id: string | null; seated_at: string; cleared_at: string | null;
  }[]) {
    if (!s.zone_id) continue;
    const cur = stats.get(s.zone_id) ?? { n: 0, turnSum: 0, turnN: 0 };
    cur.n++;
    if (s.cleared_at) {
      cur.turnSum += (new Date(s.cleared_at).getTime() - new Date(s.seated_at).getTime()) / 60_000;
      cur.turnN++;
    }
    stats.set(s.zone_id, cur);
  }

  return ((zonesRes.data ?? []) as { id: string; name: string; floor_id: string }[])
    .map((z) => {
      const s = stats.get(z.id) ?? { n: 0, turnSum: 0, turnN: 0 };
      const tables = tableCount.get(z.id) ?? 0;
      return {
        zoneId: z.id, zoneName: z.name, floorName: floors.get(z.floor_id) ?? "—",
        seatings: s.n,
        avgTurnMin: s.turnN ? round1(s.turnSum / s.turnN) : 0,
        tables,
        turnsPerTable: tables ? round1(s.n / tables) : 0,
      };
    })
    .sort((a, b) => b.turnsPerTable - a.turnsPerTable);
}

export interface NotifPerf {
  sent: number; delivered: number; read: number; failed: number;
  deliveryRatePct: number; readRatePct: number;
  avgNotifyToSeatMin: number;
}

export async function notificationPerformance(
  outletIds: string[], range: DateRange,
): Promise<NotifPerf> {
  const db = createAdminSupabase();
  const [logsRes, entriesRes] = await Promise.all([
    db.from("notification_logs").select("status")
      .in("outlet_id", outletIds)
      .gte("sent_at", `${range.from}T00:00:00Z`).lte("sent_at", `${range.to}T23:59:59Z`),
    db.from("queue_entries").select("notified_at, seated_at")
      .in("outlet_id", outletIds).not("notified_at", "is", null).not("seated_at", "is", null)
      .gte("joined_at", `${range.from}T00:00:00Z`).lte("joined_at", `${range.to}T23:59:59Z`),
  ]);

  const logs = (logsRes.data ?? []) as { status: string }[];
  const sent = logs.length;
  // Read implies delivered; Meta only reports the furthest state reached.
  const delivered = logs.filter((l) => ["delivered", "read"].includes(l.status)).length;
  const read = logs.filter((l) => l.status === "read").length;
  const failed = logs.filter((l) => l.status === "failed").length;

  const gaps = ((entriesRes.data ?? []) as { notified_at: string; seated_at: string }[])
    .map((e) => (new Date(e.seated_at).getTime() - new Date(e.notified_at).getTime()) / 60_000)
    .filter((m) => m >= 0 && m < 120);

  return {
    sent, delivered, read, failed,
    deliveryRatePct: sent ? round1((delivered / sent) * 100) : 0,
    readRatePct: sent ? round1((read / sent) * 100) : 0,
    avgNotifyToSeatMin: gaps.length ? round1(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0,
  };
}

export interface HostPerf { hostId: string; name: string; seatings: number; avgTimeToSeatMin: number }

/**
 * How fast each host actually turns a "table ready" into a seated guest.
 * Only meaningful for multi-host outlets, and deliberately reported as a team
 * median alongside individuals so it reads as coaching, not surveillance.
 */
export async function hostPerformance(
  outletId: string, range: DateRange,
): Promise<HostPerf[]> {
  const db = createAdminSupabase();
  const { data } = await db.from("table_sessions")
    .select("seated_by, seated_at, queue_entries(notified_at)")
    .eq("outlet_id", outletId).not("seated_by", "is", null)
    .gte("seated_at", `${range.from}T00:00:00Z`).lte("seated_at", `${range.to}T23:59:59Z`);

  const rows = (data ?? []) as unknown as {
    seated_by: string; seated_at: string; queue_entries: { notified_at: string | null } | null;
  }[];

  const acc = new Map<string, { n: number; sum: number; sumN: number }>();
  for (const r of rows) {
    const cur = acc.get(r.seated_by) ?? { n: 0, sum: 0, sumN: 0 };
    cur.n++;
    const notified = r.queue_entries?.notified_at;
    if (notified) {
      const mins = (new Date(r.seated_at).getTime() - new Date(notified).getTime()) / 60_000;
      if (mins >= 0 && mins < 120) { cur.sum += mins; cur.sumN++; }
    }
    acc.set(r.seated_by, cur);
  }

  const ids = [...acc.keys()];
  if (ids.length === 0) return [];
  const { data: staff } = await db.from("staff_users").select("id, full_name, email").in("id", ids);
  const names = new Map(((staff ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((s) => [s.id, s.full_name ?? s.email ?? "Host"]));

  return ids.map((id) => {
    const v = acc.get(id)!;
    return {
      hostId: id,
      name: names.get(id) ?? "Host",
      seatings: v.n,
      avgTimeToSeatMin: v.sumN ? round1(v.sum / v.sumN) : 0,
    };
  }).sort((a, b) => b.seatings - a.seatings);
}

export interface AccuracyPoint { day: string; errorMin: number; method: string }

/**
 * Predicted-vs-actual accuracy, split by estimation method. This is the number
 * that proves whether the Pro plan's live-availability model is genuinely
 * better than Basic's rolling average, rather than just prettier.
 */
export async function estimateAccuracy(
  outletIds: string[], range: DateRange,
): Promise<{ overall: { method: string; errorMin: number; n: number }[]; series: AccuracyPoint[] }> {
  const db = createAdminSupabase();
  const { data } = await db.from("queue_entries")
    .select("joined_at, seated_at, est_wait_low_min, est_wait_high_min, est_method")
    .in("outlet_id", outletIds).eq("status", "seated")
    .not("est_wait_low_min", "is", null)
    .gte("joined_at", `${range.from}T00:00:00Z`).lte("joined_at", `${range.to}T23:59:59Z`);

  const byMethod = new Map<string, { sum: number; n: number }>();
  const byDay = new Map<string, { sum: number; n: number; method: string }>();

  for (const r of (data ?? []) as {
    joined_at: string; seated_at: string;
    est_wait_low_min: number; est_wait_high_min: number; est_method: string | null;
  }[]) {
    const actual = (new Date(r.seated_at).getTime() - new Date(r.joined_at).getTime()) / 60_000;
    const predicted = (r.est_wait_low_min + r.est_wait_high_min) / 2;
    const err = Math.abs(actual - predicted);
    const method = r.est_method ?? "unknown";

    const m = byMethod.get(method) ?? { sum: 0, n: 0 };
    m.sum += err; m.n++;
    byMethod.set(method, m);

    const day = r.joined_at.slice(0, 10);
    const d = byDay.get(day) ?? { sum: 0, n: 0, method };
    d.sum += err; d.n++;
    byDay.set(day, d);
  }

  return {
    overall: [...byMethod].map(([method, v]) => ({
      method, errorMin: round1(v.sum / v.n), n: v.n,
    })),
    series: [...byDay].sort().map(([day, v]) => ({
      day, errorMin: round1(v.sum / v.n), method: v.method,
    })),
  };
}

// ------------------------------------------------------- multi-outlet rollup
export interface OutletRollup {
  outletId: string; name: string; joined: number; seated: number;
  abandonRatePct: number; avgWaitMin: number; avgTurnMin: number;
}

export async function outletRollup(
  outlets: { id: string; name: string }[], range: DateRange,
): Promise<OutletRollup[]> {
  const rows = await getDailyRows(outlets.map((o) => o.id), range);
  return outlets.map((o) => {
    const s = summarise(rows.filter((r) => r.outlet_id === o.id));
    return {
      outletId: o.id, name: o.name,
      joined: s.joined, seated: s.seated,
      abandonRatePct: s.abandonRatePct,
      avgWaitMin: s.avgWaitMin, avgTurnMin: s.avgTurnMin,
    };
  }).sort((a, b) => b.joined - a.joined);
}

export function planGatesZoneDepth(plan: PlanTier): boolean {
  // Basic doesn't track live table geometry, so per-zone/per-table depth would
  // be built on sand. The tab still shows — it explains what Pro unlocks.
  return plan === "pro";
}
