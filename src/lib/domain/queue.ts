/**
 * Queue lifecycle. Everything that moves a guest between states lives here so
 * the guest page, the staff dashboard, the 3D floor view and the grace-period
 * cron all take the same path — and so every transition writes the timestamp
 * the analytics suite reads.
 */

import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { loadEstimateContext, estimateForNewParty, estimateForEntry } from "./estimate";
import { overallPosition } from "./waitTime";
import { notifyGuest } from "@/lib/whatsapp/notify";
import type { Outlet, PlanTier, QueueEntry, ZoneKind } from "@/lib/types";
import { OPEN_QUEUE_STATUSES } from "@/lib/types";

export interface JoinInput {
  outletSlug: string;
  guestName: string;
  phone: string;            // already normalised to E.164
  partySize: number;
  zonePref?: ZoneKind | null;
  notes?: string | null;
  source?: "qr" | "walkin" | "staff";
  /** Salted digest of the caller's IP, for abuse accounting. Never the raw IP. */
  ipHash?: string | null;
}

export interface JoinResult {
  entry: QueueEntry;
  outlet: Outlet;
  position: number;
  token: string;
}

/** Opaque-ish guest token: ticket code plus an id prefix, no session needed. */
export function guestToken(entry: Pick<QueueEntry, "id" | "ticket_code">): string {
  return `${entry.ticket_code}-${entry.id.slice(0, 8)}`;
}

export async function getOutletBySlug(slug: string): Promise<{ outlet: Outlet; plan: PlanTier } | null> {
  const db = createAdminSupabase();
  const { data } = await db
    .from("outlets")
    .select("*, organizations!inner(id, subscriptions(plan, status))")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;

  const org = (data as Record<string, unknown>).organizations as
    { subscriptions: { plan: PlanTier; status: string }[] } | null;
  const sub = org?.subscriptions?.[0];
  // A halted or cancelled subscription drops to Basic rather than going dark —
  // an unpaid invoice should never strand guests standing at the door.
  const plan: PlanTier =
    sub && ["active", "trialing", "past_due"].includes(sub.status) ? sub.plan : "basic";

  return { outlet: data as unknown as Outlet, plan };
}

export async function joinQueue(input: JoinInput): Promise<JoinResult> {
  const db = createAdminSupabase();
  const found = await getOutletBySlug(input.outletSlug);
  if (!found) throw new Error("Restaurant not found");
  const { outlet, plan } = found;
  if (!outlet.is_open) throw new Error("This restaurant isn't accepting the queue right now");
  if (input.partySize < 1 || input.partySize > outlet.max_party_size) {
    throw new Error(`Party size must be between 1 and ${outlet.max_party_size}`);
  }

  // One live entry per phone per outlet — a double-tap on a patchy connection
  // shouldn't put the same guest in line twice.
  const { data: existing } = await db
    .from("queue_entries").select("*")
    .eq("outlet_id", outlet.id).eq("phone_e164", input.phone)
    .in("status", OPEN_QUEUE_STATUSES).maybeSingle();

  if (existing) {
    const entry = existing as QueueEntry;
    const ctx = await loadEstimateContext(outlet.id, plan);
    return { entry, outlet, position: overallPosition(entry, ctx.openEntries), token: guestToken(entry) };
  }

  const ctx = await loadEstimateContext(outlet.id, plan);
  const est = estimateForNewParty(ctx, input.partySize, input.zonePref);

  const { data: codeData } = await db.rpc("next_ticket_code", { p_outlet: outlet.id });
  const ticket = (codeData as string) ?? `A${Date.now() % 100}`;

  const { data, error } = await db
    .from("queue_entries")
    .insert({
      outlet_id: outlet.id,
      ticket_code: ticket,
      guest_name: input.guestName.trim(),
      phone_e164: input.phone,
      party_size: input.partySize,
      zone_pref: input.zonePref ?? null,
      notes: input.notes?.trim() || null,
      est_wait_low_min: est.lowMin,
      est_wait_high_min: est.highMin,
      est_method: est.method,
      source: input.source ?? "qr",
      ip_hash: input.ipHash ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const entry = data as QueueEntry;

  const position = overallPosition(entry, [...ctx.openEntries, entry]);
  if (entry.phone_e164) {
    await notifyGuest("queue_confirmation", { outlet, entry, position });
  }

  return { entry, outlet, position, token: guestToken(entry) };
}

// ------------------------------------------------------------- guest status
export interface GuestStatus {
  entry: QueueEntry;
  outlet: Outlet;
  position: number;
  aheadOfYou: number;
  waitLow: number;
  waitHigh: number;
}

export async function getGuestStatus(token: string): Promise<GuestStatus | null> {
  const db = createAdminSupabase();
  const [ticket, idPrefix] = token.split("-");
  if (!ticket || !idPrefix) return null;
  // The prefix is the first group of the entry's uuid, so it must be 8 hex
  // digits before it can be used to build the range bounds below.
  if (!/^[0-9a-f]{8}$/i.test(idPrefix)) return null;

  // This used to filter on ticket_code alone, take the 20 most recent matches
  // across *every tenant*, and scan them in JS for the id prefix. Since 0004
  // made ticket codes reusable — A01 is reissued daily, in every outlet — that
  // window fills with other restaurants' guests, and a guest's own entry falls
  // out of it within hours while they are still standing in line. The same URL
  // is the button in their WhatsApp message, so it breaks there too.
  //
  // The id prefix is the actual secret, so match on it in the database instead:
  // every uuid whose first group is `idPrefix` lies in this range, which the
  // primary key index answers directly. Exact, tenant-agnostic, and unbounded
  // by how many outlets share a code.
  const { data } = await db
    .from("queue_entries").select("*")
    .eq("ticket_code", ticket)
    .gte("id", `${idPrefix}-0000-0000-0000-000000000000`)
    .lte("id", `${idPrefix}-ffff-ffff-ffff-ffffffffffff`)
    .order("joined_at", { ascending: false })
    .limit(1);

  const entry = (data as QueueEntry[] | null)?.[0];
  if (!entry) return null;

  const found = await getOutletBySlugById(entry.outlet_id);
  if (!found) return null;

  const ctx = await loadEstimateContext(entry.outlet_id, found.plan);
  const live = estimateForEntry(ctx, entry);
  const position = OPEN_QUEUE_STATUSES.includes(entry.status)
    ? overallPosition(entry, ctx.openEntries)
    : 0;

  return {
    entry,
    outlet: found.outlet,
    position,
    aheadOfYou: Math.max(0, position - 1),
    waitLow: live.lowMin,
    waitHigh: live.highMin,
  };
}

async function getOutletBySlugById(outletId: string) {
  const db = createAdminSupabase();
  const { data } = await db.from("outlets").select("slug").eq("id", outletId).maybeSingle();
  if (!data) return null;
  return getOutletBySlug((data as { slug: string }).slug);
}

// ------------------------------------------------------------- transitions
export async function markNotified(entryId: string, tableLabel?: string) {
  const db = createAdminSupabase();
  const { data: entry } = await db.from("queue_entries").select("*").eq("id", entryId).single();
  if (!entry) throw new Error("Queue entry not found");
  const e = entry as QueueEntry;

  const found = await getOutletBySlugById(e.outlet_id);
  if (!found) throw new Error("Outlet not found");
  const { outlet } = found;

  const graceExpires = new Date(Date.now() + outlet.grace_period_min * 60_000);
  const { data: updated } = await db
    .from("queue_entries")
    .update({
      status: "notified",
      notified_at: e.notified_at ?? new Date().toISOString(),
      grace_expires_at: graceExpires.toISOString(),
    })
    .eq("id", entryId).select("*").single();

  return notifyGuest("table_ready", {
    outlet, entry: (updated ?? e) as QueueEntry, tableLabel,
  });
}

export async function sendPositionUpdate(entryId: string) {
  const db = createAdminSupabase();
  const { data: entry } = await db.from("queue_entries").select("*").eq("id", entryId).single();
  if (!entry) return { ok: false, error: "not found" };
  const e = entry as QueueEntry;
  const found = await getOutletBySlugById(e.outlet_id);
  if (!found) return { ok: false, error: "outlet missing" };

  const ctx = await loadEstimateContext(e.outlet_id, found.plan);
  const live = estimateForEntry(ctx, e);
  return notifyGuest("position_update", {
    outlet: found.outlet,
    entry: e,
    position: overallPosition(e, ctx.openEntries),
    estimate: { lowMin: live.lowMin, highMin: live.highMin },
  });
}

export async function closeEntry(
  entryId: string,
  status: "no_show" | "left" | "cancelled",
  opts: { notify?: boolean } = {},
) {
  const db = createAdminSupabase();
  const { data } = await db
    .from("queue_entries")
    .update({ status, closed_at: new Date().toISOString() })
    .eq("id", entryId).select("*").single();

  const entry = data as QueueEntry | null;
  if (entry && opts.notify !== false) {
    const found = await getOutletBySlugById(entry.outlet_id);
    if (found) await notifyGuest("queue_left", { outlet: found.outlet, entry });
  }
  return entry;
}
