import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getEmailProvider, type SendEmailArgs } from "./provider";

/**
 * The single choke point for outbound mail, mirroring notifyGuest in
 * lib/whatsapp/notify.ts: log the attempt, send, log the outcome, and never
 * throw at the caller. A silent delivery failure is the failure mode that
 * actually costs money here — a lead who never hears back assumes you didn't
 * want the business.
 */
export async function sendLeadEmail(
  leadId: string,
  kind: string,
  args: SendEmailArgs,
): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminSupabase();
  const provider = getEmailProvider();

  const result = await provider.send(args).catch((err) => ({
    ok: false as const,
    error: err instanceof Error ? err.message : "send threw",
  }));

  await db.from("lead_events").insert({
    lead_id: leadId,
    kind,
    ok: result.ok,
    detail: result.ok
      ? `${provider.name} -> ${args.to}`
      : `${provider.name} -> ${args.to}: ${result.error ?? "unknown"}`,
  });

  if (!result.ok) {
    console.error(`[email] ${kind} to ${args.to} failed: ${result.error}`);
    await db.from("leads").update({ last_error: `email ${kind}: ${result.error}` }).eq("id", leadId);
  }

  return { ok: result.ok, error: result.error };
}

/** Convenience for the audit trail when something non-email happens. */
export async function logLeadEvent(leadId: string, kind: string, ok: boolean, detail?: string) {
  await createAdminSupabase().from("lead_events").insert({
    lead_id: leadId, kind, ok, detail: detail ?? null,
  });
}

export function appUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return base.replace(/\/$/, "");
}
