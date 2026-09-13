import { createAdminSupabase } from "@/lib/supabase/admin";
import { peekLeadId, verifyActionToken } from "@/lib/email/actionToken";
import { formatIstSlot } from "@/lib/meetings/time";
import { generateSlots, groupByIstDay } from "@/lib/meetings/slots";
import { getCalendar } from "@/lib/google/calendar";
import { parseDays, parseHours, formatIstDay, formatIstTime } from "@/lib/meetings/time";
import { ConfirmPanel } from "./ConfirmPanel";
import type { Lead } from "@/lib/types";

export const metadata = { title: "Confirm meeting", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The owner's confirmation screen.
 *
 * THIS PAGE MUTATES NOTHING. Gmail's link proxy, Outlook SafeLinks and
 * corporate mail scanners all issue unsolicited GETs on every URL in a
 * message — so a plain GET /approve would let a security appliance silently
 * approve meetings on the owner's behalf. Instead the GET renders an inert
 * summary, and the actual change is a server-action POST from ConfirmPanel,
 * which scanners don't execute. Next's server actions do their own Origin
 * check, which covers CSRF.
 *
 * Cost: one extra tap. There is no way to make a zero-click GET prefetch-safe.
 */
export default async function OwnerActionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const leadId = peekLeadId(token);

  if (!leadId) return <Shell tone="bad" title="Not a valid link" body="Double-check you opened the whole link from the email." />;

  const db = createAdminSupabase();
  const { data } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!data) return <Shell tone="bad" title="We couldn't find that request" body="It may have been removed." />;
  const lead = data as Lead;

  const parsed = verifyActionToken(token, lead.action_nonce);

  if (!parsed.ok) {
    const body = parsed.reason === "expired"
      ? "This link has expired. Links last 14 days — reply to the lead directly instead."
      : "This link is no longer valid. It was most likely already used, which invalidates the other buttons in that email too.";
    return <Shell tone="bad" title="Link no longer valid" body={body} />;
  }

  if (lead.status !== "proposed") {
    return (
      <Shell
        tone="done"
        title={`Already ${lead.status}`}
        body={`You handled ${lead.restaurant_name} on ${
          lead.actioned_at ? new Date(lead.actioned_at).toLocaleDateString("en-IN") : "an earlier date"
        }. Nothing further to do.`}
      />
    );
  }

  // For the reschedule branch, offer real alternatives rather than a free-text box.
  let dayOptions: { key: string; label: string; slots: { start: string; label: string }[] }[] = [];
  if (parsed.action === "reschedule") {
    const horizonDays = Number(process.env.MEETING_HORIZON_DAYS ?? 14);
    const now = new Date();
    let busy: { start: string; end: string }[] = [];
    try {
      busy = await getCalendar().freeBusy(now.toISOString(), new Date(now.getTime() + horizonDays * 86_400_000).toISOString());
    } catch { /* fall through to held-only */ }

    const { data: held } = await db.from("leads")
      .select("slot_start").in("status", ["new", "proposed", "approved"])
      .not("slot_start", "is", null).gte("slot_start", now.toISOString());

    dayOptions = groupByIstDay(generateSlots({
      now, busy,
      heldStarts: (held ?? []).map((h) => (h as { slot_start: string }).slot_start),
      hours: parseHours(process.env.MEETING_HOURS ?? "11:00-19:00"),
      days: parseDays(process.env.MEETING_DAYS ?? "1,2,3,4,5,6"),
      leadHours: Number(process.env.MEETING_LEAD_HOURS ?? 12),
      horizonDays,
    })).map((g) => ({
      key: g.day,
      label: formatIstDay(g.slots[0].start),
      slots: g.slots.map((s) => ({ start: s.start, label: formatIstTime(s.start) })),
    }));
  }

  return (
    <ConfirmPanel
      token={token}
      action={parsed.action}
      lead={{
        contactName: lead.contact_name,
        restaurantName: lead.restaurant_name,
        city: lead.city,
        email: lead.email,
        phone: lead.phone_e164,
        outlets: lead.outlets_count,
        requests: lead.requests,
        pricingNote: lead.pricing_note,
        slot: lead.slot_start && lead.slot_end ? formatIstSlot(lead.slot_start, lead.slot_end) : null,
      }}
      dayOptions={dayOptions}
    />
  );
}

function Shell({ tone, title, body }: { tone: "bad" | "done"; title: string; body: string }) {
  return (
    <div className="site flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
        <p className="u-mono text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
          {tone === "done" ? "Nothing to do" : "Link problem"}
        </p>
        <h1 className="u-display mt-3 text-2xl font-extrabold text-white">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{body}</p>
      </div>
    </div>
  );
}
