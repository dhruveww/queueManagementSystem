/**
 * The one place Baari sends a guest message.
 *
 * Every send is logged to `notification_logs` before and after the provider
 * call, so the analytics suite can report delivery/read rates and
 * notify-to-seated time without a second source of truth. A failed send sets
 * `notify_failed` on the queue entry, which the staff board renders as a
 * "call this guest" flag — that is the fallback, not SMS.
 */

import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getProvider } from "./provider";
import { renderPreview } from "./templates";
import type { NotifTemplate, Outlet, QueueEntry } from "@/lib/types";
import { formatWait } from "@/lib/domain/waitTime";

export interface NotifyContext {
  outlet: Outlet;
  entry: QueueEntry;
  position?: number;
  tableLabel?: string;
  /**
   * Live re-quote. The entry's stored estimate is the immutable quote given at
   * join time (that's what predicted-vs-actual accuracy is measured against),
   * so a later message must pass the current range explicitly.
   */
  estimate?: { lowMin: number; highMin: number };
}

/** Build the ordered body params for a template from live queue state. */
export function buildParams(template: NotifTemplate, ctx: NotifyContext): string[] {
  const { outlet, entry, position, tableLabel, estimate } = ctx;
  const waitRange = formatWait(
    estimate?.lowMin ?? entry.est_wait_low_min ?? 0,
    estimate?.highMin ?? entry.est_wait_high_min ?? 5,
  );
  const firstName = entry.guest_name.split(" ")[0] || "there";

  switch (template) {
    case "queue_confirmation":
      return [firstName, outlet.name, entry.ticket_code, String(position ?? 1), waitRange];
    case "position_update":
      return [firstName, outlet.name, String(position ?? 1), waitRange];
    case "table_ready":
      return [firstName, outlet.name, tableLabel ?? "your table", String(outlet.grace_period_min)];
    case "grace_nudge":
      return [firstName, outlet.name, String(outlet.grace_period_min)];
    case "queue_left":
    case "feedback_request":
      return [firstName, outlet.name];
  }
}

export async function notifyGuest(
  template: NotifTemplate,
  ctx: NotifyContext,
): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminSupabase();
  const { entry, outlet } = ctx;

  if (!entry.phone_e164) {
    return { ok: false, error: "guest has no phone number on file" };
  }

  const params = buildParams(template, ctx);
  const provider = getProvider();

  const { data: log } = await db
    .from("notification_logs")
    .insert({
      outlet_id: outlet.id,
      queue_entry_id: entry.id,
      template,
      provider: provider.name,
      status: "queued",
      payload: { params, preview: renderPreview(template, params) },
    })
    .select("id")
    .single();

  const result = await provider.send({
    to: entry.phone_e164.replace(/^\+/, ""),
    template,
    params,
    buttonUrlSuffix: `s/${entry.ticket_code}-${entry.id.slice(0, 8)}`,
  });

  if (log) {
    await db
      .from("notification_logs")
      .update({
        status: result.ok ? "sent" : "failed",
        provider_message_id: result.providerMessageId ?? null,
        error: result.error ?? null,
      })
      .eq("id", log.id);
  }

  if (!result.ok) {
    // Surface it on the host's board immediately — someone has to pick up a phone.
    await db.from("queue_entries").update({ notify_failed: true }).eq("id", entry.id);
    return { ok: false, error: result.error };
  }

  if (entry.notify_failed) {
    await db.from("queue_entries").update({ notify_failed: false }).eq("id", entry.id);
  }
  return { ok: true };
}
