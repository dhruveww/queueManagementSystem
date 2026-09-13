"use server";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCalendar } from "@/lib/google/calendar";
import { verifyActionToken, peekLeadId, signActionToken, LEAD_LINK_TTL_DAYS } from "@/lib/email/actionToken";
import { leadConfirmed, leadDeclined, leadReschedule } from "@/lib/email/templates";
import { appUrl, logLeadEvent, sendLeadEmail } from "@/lib/email/send";
import { formatIstSlot } from "@/lib/meetings/time";
import type { Lead } from "@/lib/types";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * The only thing in this flow that mutates, and it is a POST server action on
 * purpose — see the page component for why a GET must not.
 *
 * Every write is conditional on the status the token was issued against, so a
 * double click, a forwarded email or a browser back-button replay is an
 * idempotent no-op rather than a second calendar operation.
 */
export async function applyOwnerAction(
  token: string,
  choice?: { slots?: string[]; note?: string },
): Promise<ActionResult> {
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
        ? "This link has expired. Open the lead in Supabase, or reply to the guest directly."
        : "This link is no longer valid — it may already have been used.",
    };
  }

  if (lead.status !== "proposed") {
    return { ok: false, error: `This request is already marked "${lead.status}".` };
  }

  const calendar = getCalendar();

  // ------------------------------------------------------------- approve
  if (parsed.action === "approve") {
    let meetUrl: string | null = null;
    if (lead.gcal_event_id) {
      try {
        const confirmed = await calendar.confirm(lead.gcal_event_id, lead.email);
        meetUrl = confirmed.meetUrl ?? null;
      } catch (err) {
        await logLeadEvent(lead.id, "cal.confirm", false, err instanceof Error ? err.message : "failed");
      }
    }

    // Conditional on status: two tabs racing produce one winner.
    const { data: updated } = await db.from("leads")
      .update({
        status: "approved",
        meet_url: meetUrl,
        actioned_at: new Date().toISOString(),
        action_nonce: crypto.randomUUID(),   // burns every outstanding link
      })
      .eq("id", lead.id).eq("status", "proposed")
      .select("*").maybeSingle();

    if (!updated) return { ok: false, error: "That request was just handled somewhere else." };

    const mail = leadConfirmed(updated as Lead);
    await sendLeadEmail(lead.id, "email.lead_confirmed", {
      to: lead.email, subject: mail.subject, html: mail.html, text: mail.text,
    });
    await logLeadEvent(lead.id, "owner.approved", true);

    return { ok: true, message: `Confirmed. ${lead.contact_name} has been emailed.` };
  }

  // ------------------------------------------------------------- decline
  if (parsed.action === "decline") {
    if (lead.gcal_event_id) {
      try {
        await calendar.cancel(lead.gcal_event_id);
      } catch (err) {
        await logLeadEvent(lead.id, "cal.cancel", false, err instanceof Error ? err.message : "failed");
      }
    }

    const { data: updated } = await db.from("leads")
      .update({
        status: "declined",
        owner_note: choice?.note?.trim() || null,
        actioned_at: new Date().toISOString(),
        action_nonce: crypto.randomUUID(),
      })
      .eq("id", lead.id).eq("status", "proposed")
      .select("*").maybeSingle();

    if (!updated) return { ok: false, error: "That request was just handled somewhere else." };

    const mail = leadDeclined(updated as Lead);
    await sendLeadEmail(lead.id, "email.lead_declined", {
      to: lead.email, subject: mail.subject, html: mail.html, text: mail.text,
    });
    await logLeadEvent(lead.id, "owner.declined", true);

    return { ok: true, message: "Declined, and they've been told kindly." };
  }

  // ---------------------------------------------------------- reschedule
  if (parsed.action === "reschedule") {
    const slots = (choice?.slots ?? []).filter(Boolean).slice(0, 3);
    if (slots.length === 0) return { ok: false, error: "Pick at least one alternative time." };

    // Release the hold now: the original slot is no longer wanted, and leaving
    // it tentative would keep blocking it for everyone else.
    if (lead.gcal_event_id) {
      try {
        await calendar.cancel(lead.gcal_event_id);
      } catch (err) {
        await logLeadEvent(lead.id, "cal.cancel", false, err instanceof Error ? err.message : "failed");
      }
    }

    const nonce = crypto.randomUUID();
    const { data: updated } = await db.from("leads")
      .update({
        status: "rescheduling",
        proposed_slots: slots,
        slot_start: null,
        slot_end: null,
        gcal_event_id: null,
        owner_note: choice?.note?.trim() || null,
        reschedule_count: lead.reschedule_count + 1,
        actioned_at: new Date().toISOString(),
        action_nonce: nonce,
      })
      .eq("id", lead.id).eq("status", "proposed")
      .select("*").maybeSingle();

    if (!updated) return { ok: false, error: "That request was just handled somewhere else." };

    const options = slots.map((iso) => {
      const end = new Date(new Date(iso).getTime() + 3_600_000).toISOString();
      return {
        iso,
        label: formatIstSlot(iso, end),
        href: `${appUrl()}/b/${signActionToken({
          leadId: lead.id, action: "repick", arg: iso, nonce, ttlDays: LEAD_LINK_TTL_DAYS,
        })}`,
      };
    });

    const mail = leadReschedule(updated as Lead, options);
    await sendLeadEmail(lead.id, "email.lead_reschedule", {
      to: lead.email, subject: mail.subject, html: mail.html, text: mail.text,
    });
    await logLeadEvent(lead.id, "owner.rescheduled", true, `${slots.length} options`);

    return { ok: true, message: `Sent ${slots.length} alternative time${slots.length === 1 ? "" : "s"}.` };
  }

  return { ok: false, error: "Unsupported action." };
}
