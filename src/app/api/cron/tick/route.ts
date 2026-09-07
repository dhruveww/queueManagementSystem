import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getOutletBySlug, closeEntry, sendPositionUpdate } from "@/lib/domain/queue";
import { notifyGuest } from "@/lib/whatsapp/notify";
import { loadEstimateContext, estimateForEntry } from "@/lib/domain/estimate";
import type { Outlet, QueueEntry } from "@/lib/types";

/**
 * The heartbeat. Runs every minute on Vercel Cron (see vercel.json) and does
 * the four things nobody is sitting there to do:
 *
 *   1. Grace period — a notified guest who hasn't checked in gets one nudge,
 *      then is auto-skipped so the table goes to the next party.
 *   2. Proactive "you're getting close" messages when a waiting guest crosses
 *      the outlet's notify-lead threshold.
 *   3. Analytics rollups for today and yesterday (yesterday because a late
 *      close can write rows after midnight).
 *   4. DPDP retention purge.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new NextResponse("unauthorised", { status: 401 });
  }

  const db = createAdminSupabase();
  const { data: outletRows } = await db.from("outlets").select("*").eq("is_open", true);
  const outlets = (outletRows ?? []) as Outlet[];

  const report = { grace: 0, skipped: 0, nudged: 0, rollups: 0, purged: 0 };

  for (const outlet of outlets) {
    report.grace += await runGracePeriod(outlet, report);
    report.nudged += await runProactiveUpdates(outlet);
  }

  // Rollups run for every outlet, open or not.
  const { data: allOutlets } = await db.from("outlets").select("id, timezone");
  for (const o of (allOutlets ?? []) as { id: string; timezone: string }[]) {
    for (const day of [localDay(o.timezone, 0), localDay(o.timezone, -1)]) {
      await db.rpc("rebuild_analytics_daily", { p_outlet: o.id, p_day: day });
      report.rollups++;
    }
  }

  const { data: purged } = await db.rpc("purge_expired_pii");
  report.purged = Number(purged ?? 0);

  return NextResponse.json({ ok: true, ...report });
}

/**
 * A guest whose grace window has expired gets one re-offer (configurable), then
 * is marked no-show. The table they were holding is released back to free so
 * the host isn't left with a phantom reservation.
 */
async function runGracePeriod(outlet: Outlet, report: { skipped: number }): Promise<number> {
  const db = createAdminSupabase();
  const { data } = await db.from("queue_entries").select("*")
    .eq("outlet_id", outlet.id).eq("status", "notified")
    .lt("grace_expires_at", new Date().toISOString());

  const expired = (data ?? []) as QueueEntry[];
  let nudged = 0;

  for (const entry of expired) {
    if (entry.grace_used < outlet.grace_reoffers) {
      const extended = new Date(Date.now() + outlet.grace_period_min * 60_000);
      await db.from("queue_entries").update({
        grace_used: entry.grace_used + 1,
        grace_expires_at: extended.toISOString(),
      }).eq("id", entry.id);
      await notifyGuest("grace_nudge", { outlet, entry });
      nudged++;
    } else {
      await closeEntry(entry.id, "no_show");
      if (entry.assigned_table_id) {
        await db.rpc("clear_table", { p_table: entry.assigned_table_id, p_to: "free" });
      }
      report.skipped++;
    }
  }
  return nudged;
}

/**
 * "You're getting close." Sent once per guest, when their live estimate drops
 * under the outlet's lead threshold — not on a fixed timer, so a guest whose
 * wait blows out doesn't get told they're nearly in.
 */
async function runProactiveUpdates(outlet: Outlet): Promise<number> {
  const db = createAdminSupabase();
  const found = await getOutletBySlug(outlet.slug);
  if (!found) return 0;

  const ctx = await loadEstimateContext(outlet.id, found.plan);
  const waiting = ctx.openEntries.filter((e) => e.status === "waiting" && e.phone_e164);
  if (waiting.length === 0) return 0;

  const { data: alreadySent } = await db.from("notification_logs")
    .select("queue_entry_id")
    .eq("outlet_id", outlet.id).eq("template", "position_update")
    .in("queue_entry_id", waiting.map((e) => e.id));
  const sent = new Set(((alreadySent ?? []) as { queue_entry_id: string }[])
    .map((r) => r.queue_entry_id));

  let count = 0;
  for (const entry of waiting) {
    if (sent.has(entry.id)) continue;
    const est = estimateForEntry(ctx, entry);
    if (est.midMin > outlet.notify_lead_min) continue;
    await sendPositionUpdate(entry.id);
    count++;
  }
  return count;
}

/** Today's (or an offset day's) date in the outlet's own timezone. */
function localDay(timezone: string, offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
