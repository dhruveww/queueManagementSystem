import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getOutletBySlug, closeEntry, sendPositionUpdate } from "@/lib/domain/queue";
import { notifyGuest } from "@/lib/whatsapp/notify";
import { loadEstimateContext, estimateForEntry } from "@/lib/domain/estimate";
import { getCalendar } from "@/lib/google/calendar";
import { signActionToken } from "@/lib/email/actionToken";
import { ownerNewLead, leadReschedule } from "@/lib/email/templates";
import { appUrl, logLeadEvent, sendLeadEmail } from "@/lib/email/send";
import type { Lead, Outlet, QueueEntry } from "@/lib/types";

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

/**
 * Fails closed. This used to be `if (secret) { ...check... }`, so an unset or
 * empty CRON_SECRET — which is exactly what .env.example ships — skipped the
 * check entirely and left a public GET that sends paid WhatsApp messages, marks
 * guests no-show, releases their tables and purges PII across every tenant. A
 * crawler or an <img src> was enough to trigger it.
 */
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  // Constant-time, matching how both webhooks already compare signatures.
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron] CRON_SECRET is not set — refusing to run.");
    return new NextResponse("cron not configured", { status: 500 });
  }
  if (!authorised(req)) return new NextResponse("unauthorised", { status: 401 });

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

  const leads = await runLeadSweep();

  const { data: purgedLeads } = await db.rpc("purge_expired_leads");

  return NextResponse.json({
    ok: true, ...report, ...leads, purgedLeads: Number(purgedLeads ?? 0),
  });
}

/**
 * Keeps the intro-call pipeline from silting up when the owner is busy.
 *
 * Three cheap indexed passes, outlet-independent:
 *   1. A lead sitting unanswered for 24h gets one reminder to the owner.
 *   2. Two hours before an unconfirmed slot, release the calendar hold and tell
 *      the lead. Deliberately NOT auto-approved — a prospect dialling into a
 *      call the owner never confirmed is a worse outcome than a reschedule.
 *   3. A reschedule offer nobody picked after 7 days expires quietly.
 */
async function runLeadSweep(): Promise<{ leadReminders: number; leadExpired: number }> {
  const db = createAdminSupabase();
  const now = Date.now();
  const out = { leadReminders: 0, leadExpired: 0 };

  // 1. nudge the owner
  const { data: stale } = await db.from("leads")
    .select("*")
    .eq("status", "proposed")
    .is("reminder_sent_at", null)
    .lt("created_at", new Date(now - 24 * 3600_000).toISOString())
    .limit(20);

  for (const row of (stale ?? []) as Lead[]) {
    const link = (action: "approve" | "reschedule" | "decline") =>
      `${appUrl()}/m/${signActionToken({ leadId: row.id, action, nonce: row.action_nonce })}`;
    const mail = ownerNewLead(row, {
      approve: link("approve"), reschedule: link("reschedule"), decline: link("decline"),
    });
    await sendLeadEmail(row.id, "email.owner_reminder", {
      to: process.env.OWNER_EMAIL ?? "dhruvi0326@gmail.com",
      subject: `Still waiting — ${mail.subject}`,
      html: mail.html,
      text: mail.text,
      replyTo: row.email,
    });
    await db.from("leads").update({ reminder_sent_at: new Date().toISOString() }).eq("id", row.id);
    out.leadReminders++;
  }

  // 2. release holds the owner never confirmed
  const { data: imminent } = await db.from("leads")
    .select("*")
    .eq("status", "proposed")
    .not("slot_start", "is", null)
    .lt("slot_start", new Date(now + 2 * 3600_000).toISOString())
    .limit(20);

  for (const row of (imminent ?? []) as Lead[]) {
    if (row.gcal_event_id) {
      try {
        await getCalendar().cancel(row.gcal_event_id);
      } catch (err) {
        await logLeadEvent(row.id, "cal.cancel", false, err instanceof Error ? err.message : "failed");
      }
    }
    const nonce = crypto.randomUUID();
    await db.from("leads").update({
      status: "expired",
      slot_start: null, slot_end: null, gcal_event_id: null,
      actioned_at: new Date().toISOString(),
      action_nonce: nonce,
    }).eq("id", row.id).eq("status", "proposed");

    const mail = leadReschedule({ ...row, owner_note: null }, []);
    await sendLeadEmail(row.id, "email.lead_expired", {
      to: row.email,
      subject: "We need to find another time for your Baari call",
      html: mail.html,
      text: mail.text,
    });
    await logLeadEvent(row.id, "lead.expired", true, "unconfirmed 2h before slot");
    out.leadExpired++;
  }

  // 3. reschedule offers nobody took
  await db.from("leads")
    .update({ status: "expired", actioned_at: new Date().toISOString() })
    .eq("status", "rescheduling")
    .lt("actioned_at", new Date(now - 7 * 24 * 3600_000).toISOString());

  return out;
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
