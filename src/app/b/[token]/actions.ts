"use server";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCalendar } from "@/lib/google/calendar";
import { peekLeadId, signActionToken, verifyActionToken, OWNER_LINK_TTL_DAYS } from "@/lib/email/actionToken";
import { ownerNewLead, leadReceived } from "@/lib/email/templates";
import { appUrl, logLeadEvent, sendLeadEmail } from "@/lib/email/send";
import { formatIstSlot } from "@/lib/meetings/time";
import type { Lead } from "@/lib/types";

export type RepickResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * The lead picking one of the alternative times the owner offered.
 *
 * Closes the reschedule loop: the slot goes back on hold, the lead returns to
 * `proposed`, and the owner gets the same three-button email as a fresh lead —
 * so a rescheduled call is confirmed by exactly the same path as a new one,
 * rather than a second code path that can drift.
 *
 * POST-only for the same reason as the owner's screen: mail scanners GET every
 * link in a message, and a GET that books a slot would let a scanner book it.
 */
export async function confirmRepick(token: string): Promise<RepickResult> {
  const leadId = peekLeadId(token);
  if (!leadId) return { ok: false, error: "This link is not valid." };

  const db = createAdminSupabase();
  const { data } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!data) return { ok: false, error: "We couldn't find that request." };
  const lead = data as Lead;

  const parsed = verifyActionToken(token, lead.action_nonce);
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.reason === "expired"
        ? "This link has expired. Reply to the email and we'll find a time."
        : "This link is no longer valid — you may have already picked a time.",
    };
  }
  if (parsed.action !== "repick") return { ok: false, error: "Unsupported action." };
  if (lead.status !== "rescheduling") {
    return { ok: false, error: `This request is already marked "${lead.status}".` };
  }

  const startIso = parsed.arg;
  if (!startIso || Number.isNaN(Date.parse(startIso))) {
    return { ok: false, error: "That time is no longer on offer." };
  }
  // Only the times the owner actually offered are acceptable — the slot is
  // signed into the token, but this also stops a stale link from a previous
  // round being replayed against a newer set of options.
  if (!(lead.proposed_slots ?? []).includes(startIso)) {
    return { ok: false, error: "That time is no longer on offer." };
  }

  const endIso = new Date(new Date(startIso).getTime() + 3_600_000).toISOString();
  const calendar = getCalendar();

  // Someone may have taken it since the email went out.
  try {
    const busy = await calendar.freeBusy(startIso, endIso);
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    if (busy.some((b) => s < new Date(b.end).getTime() && new Date(b.start).getTime() < e)) {
      return { ok: false, error: "That time was just taken. Please pick another from the email." };
    }
  } catch {
    // A calendar outage shouldn't block the lead; the unique index still holds.
  }

  const nonce = crypto.randomUUID();
  const { data: updated, error } = await db.from("leads")
    .update({
      status: "proposed",
      slot_start: startIso,
      slot_end: endIso,
      proposed_slots: null,
      reminder_sent_at: null,       // it's a fresh wait for the owner
      actioned_at: new Date().toISOString(),
      action_nonce: nonce,
    })
    .eq("id", lead.id).eq("status", "rescheduling")
    .select("*").maybeSingle();

  if (error?.code === "23505") {
    return { ok: false, error: "That time was just taken. Please pick another from the email." };
  }
  if (!updated) return { ok: false, error: "That request was just handled elsewhere." };
  const fresh = updated as Lead;

  try {
    const held = await calendar.createTentative({
      summary: `Baari intro — ${fresh.restaurant_name}`,
      description: `${fresh.contact_name} · ${fresh.phone_e164} · ${fresh.email}\nRescheduled by the guest.`,
      startIso, endIso,
    });
    await db.from("leads").update({ gcal_event_id: held.eventId }).eq("id", fresh.id);
    fresh.gcal_event_id = held.eventId;
    await logLeadEvent(fresh.id, "cal.held", true, held.eventId);
  } catch (err) {
    await logLeadEvent(fresh.id, "cal.held", false, err instanceof Error ? err.message : "failed");
  }

  const link = (action: "approve" | "reschedule" | "decline") =>
    `${appUrl()}/m/${signActionToken({
      leadId: fresh.id, action, nonce, ttlDays: OWNER_LINK_TTL_DAYS,
    })}`;

  const owner = ownerNewLead(fresh, {
    approve: link("approve"), reschedule: link("reschedule"), decline: link("decline"),
  });
  await sendLeadEmail(fresh.id, "email.owner_sent", {
    to: process.env.OWNER_EMAIL ?? "dhruvi0326@gmail.com",
    subject: `Rescheduled — ${owner.subject}`,
    html: owner.html,
    text: owner.text,
    replyTo: fresh.email,
  });

  const ack = leadReceived(fresh);
  await sendLeadEmail(fresh.id, "email.lead_ack", {
    to: fresh.email, subject: ack.subject, html: ack.html, text: ack.text,
  });

  await logLeadEvent(fresh.id, "lead.repicked", true, startIso);

  return { ok: true, message: formatIstSlot(startIso, endIso) };
}
