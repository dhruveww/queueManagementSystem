import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalisePhone } from "@/lib/domain/phone";
import { clientIp, hashIp, isHoneypotTripped, memoryLimit } from "@/lib/rateLimit";
import { getCalendar } from "@/lib/google/calendar";
import { signActionToken, OWNER_LINK_TTL_DAYS } from "@/lib/email/actionToken";
import { ownerNewLead, leadReceived } from "@/lib/email/templates";
import { appUrl, logLeadEvent, sendLeadEmail } from "@/lib/email/send";
import { formatIstSlot } from "@/lib/meetings/time";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LeadSchema = z.object({
  contactName: z.string().trim().min(2).max(80),
  restaurantName: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(20),
  email: z.string().trim().email().max(160),
  outlets: z.coerce.number().int().min(1).max(500),
  requests: z.string().trim().max(2000).optional(),
  pricingNote: z.string().trim().max(2000).optional(),
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
  honeypot: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // A bot that filled the hidden field gets a plausible success and no row, so
  // there is nothing to tune against.
  if (isHoneypotTripped(input.honeypot ?? null)) {
    console.warn("[leads] honeypot tripped — ignoring submission");
    return NextResponse.json({ ok: true });
  }

  const ip = await clientIp();
  const ipHash = hashIp(ip);
  if (!memoryLimit(`lead:${ipHash}`, 3, 60 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const phone = normalisePhone(input.phone);
  if (!phone) {
    return NextResponse.json({ ok: false, error: "That doesn't look like an Indian mobile number" }, { status: 400 });
  }

  const db = createAdminSupabase();

  // Authoritative per-IP check, and a global circuit breaker so a distributed
  // flood can't fill the calendar overnight.
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const [{ count: perIp }, { count: global }] = await Promise.all([
    db.from("leads").select("*", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo),
    db.from("leads").select("*", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 60_000).toISOString()),
  ]);
  if ((perIp ?? 0) >= 3 || (global ?? 0) >= 10) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  // Re-check the slot against live free/busy: the picker's payload is up to a
  // minute stale, and the owner may have booked something by hand since.
  const calendar = getCalendar();
  try {
    const busy = await calendar.freeBusy(input.slotStart, input.slotEnd);
    const s = new Date(input.slotStart).getTime();
    const e = new Date(input.slotEnd).getTime();
    if (busy.some((b) => s < new Date(b.end).getTime() && new Date(b.start).getTime() < e)) {
      return NextResponse.json({ ok: false, error: "slot_taken" }, { status: 409 });
    }
  } catch (err) {
    console.error("[leads] freeBusy re-check failed, continuing:", err);
  }

  // The row is the source of truth and goes in first. The unique index on
  // slot_start is what actually prevents a double booking — two submissions in
  // the same second both pass the check above, and exactly one survives here.
  const { data: created, error } = await db.from("leads").insert({
    contact_name: input.contactName,
    restaurant_name: input.restaurantName,
    city: input.city,
    phone_e164: phone,
    email: input.email,
    outlets_count: input.outlets,
    requests: input.requests || null,
    pricing_note: input.pricingNote || null,
    status: "proposed",
    slot_start: input.slotStart,
    slot_end: input.slotEnd,
    ip_hash: ipHash,
  }).select("*").single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: false, error: "slot_taken" }, { status: 409 });
    }
    console.error("[leads] insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const lead = created as Lead;
  await logLeadEvent(lead.id, "lead.created", true, `${lead.restaurant_name} (${lead.city})`);

  // Calendar and email are best-effort side effects from here on. A failure is
  // recorded and surfaced, but the lead is already safely captured.
  try {
    const held = await calendar.createTentative({
      summary: `Baari intro — ${lead.restaurant_name}`,
      description:
        `${lead.contact_name} · ${lead.phone_e164} · ${lead.email}\n` +
        `${lead.outlets_count} outlet(s) in ${lead.city}\n\n` +
        `${lead.requests ?? ""}\n\n${lead.pricing_note ?? ""}`.trim(),
      startIso: lead.slot_start!,
      endIso: lead.slot_end!,
    });
    await db.from("leads").update({ gcal_event_id: held.eventId }).eq("id", lead.id);
    lead.gcal_event_id = held.eventId;
    await logLeadEvent(lead.id, "cal.held", true, held.eventId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "calendar hold failed";
    await db.from("leads").update({ last_error: `calendar: ${msg}` }).eq("id", lead.id);
    await logLeadEvent(lead.id, "cal.held", false, msg);
  }

  const link = (action: "approve" | "reschedule" | "decline") =>
    `${appUrl()}/m/${signActionToken({
      leadId: lead.id, action, nonce: lead.action_nonce, ttlDays: OWNER_LINK_TTL_DAYS,
    })}`;

  const owner = ownerNewLead(lead, {
    approve: link("approve"),
    reschedule: link("reschedule"),
    decline: link("decline"),
  });

  await sendLeadEmail(lead.id, "email.owner_sent", {
    to: process.env.OWNER_EMAIL ?? "dhruvi0326@gmail.com",
    subject: owner.subject,
    html: owner.html,
    text: owner.text,
    replyTo: lead.email,
  });

  // Instant acknowledgement, so the lead isn't sitting in silence overnight
  // while the owner sleeps.
  const ack = leadReceived(lead);
  await sendLeadEmail(lead.id, "email.lead_ack", {
    to: lead.email, subject: ack.subject, html: ack.html, text: ack.text,
  });

  return NextResponse.json({
    ok: true,
    slot: formatIstSlot(lead.slot_start!, lead.slot_end!),
  });
}
