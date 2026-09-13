import { createAdminSupabase } from "@/lib/supabase/admin";
import { peekLeadId, verifyActionToken } from "@/lib/email/actionToken";
import { formatIstSlot } from "@/lib/meetings/time";
import { RepickPanel } from "./RepickPanel";
import type { Lead } from "@/lib/types";

export const metadata = { title: "Confirm your time", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The lead confirming one of the alternative times the owner offered.
 *
 * Inert on GET, exactly like /m/[token] — mail scanners prefetch every link,
 * and a GET that books the slot would let a scanner book it on the lead's
 * behalf. The booking happens in a server-action POST from RepickPanel.
 */
export default async function RepickPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const leadId = peekLeadId(token);
  if (!leadId) return <Shell title="Not a valid link" body="Make sure you opened the whole link from the email." />;

  const db = createAdminSupabase();
  const { data } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!data) return <Shell title="We couldn't find that request" body="It may have been removed." />;
  const lead = data as Lead;

  const parsed = verifyActionToken(token, lead.action_nonce);
  if (!parsed.ok) {
    return (
      <Shell
        title="Link no longer valid"
        body={
          parsed.reason === "expired"
            ? "This link has expired. Reply to the email and we'll find you a time."
            : "This link is no longer valid — you may have already picked a time."
        }
      />
    );
  }

  if (lead.status === "proposed" && lead.slot_start && lead.slot_end) {
    return (
      <Shell
        title="Already booked"
        body={`You're down for ${formatIstSlot(lead.slot_start, lead.slot_end)}. We'll confirm shortly.`}
      />
    );
  }

  if (lead.status !== "rescheduling") {
    return <Shell title={`Already ${lead.status}`} body="There's nothing left to pick here." />;
  }

  const startIso = parsed.arg;
  const valid = startIso && (lead.proposed_slots ?? []).includes(startIso);
  if (!valid) {
    return <Shell title="That time is no longer on offer" body="Please pick another one from the email." />;
  }

  const endIso = new Date(new Date(startIso).getTime() + 3_600_000).toISOString();

  return (
    <RepickPanel
      token={token}
      restaurantName={lead.restaurant_name}
      contactName={lead.contact_name}
      slotLabel={formatIstSlot(startIso, endIso)}
    />
  );
}

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <div className="site flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
        <div className="mb-5 flex items-baseline justify-center gap-2">
          <span className="u-display text-lg font-extrabold text-white">baari</span>
          <span className="u-deva text-xs text-saffron-400">बारी</span>
        </div>
        <h1 className="u-display text-2xl font-extrabold text-white">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{body}</p>
        <a
          href="mailto:dhruvi0326@gmail.com"
          className="mt-6 inline-block text-[13px] font-semibold text-saffron-400 underline underline-offset-4"
        >
          dhruvi0326@gmail.com
        </a>
      </div>
    </div>
  );
}
