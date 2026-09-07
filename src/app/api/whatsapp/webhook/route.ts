import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { NotifStatus } from "@/lib/types";

/**
 * WhatsApp Business Platform webhook.
 *
 * Two jobs:
 *  1. Delivery/read receipts -> notification_logs, which is where the analytics
 *     suite gets its delivery and read rates.
 *  2. The "On my way" quick reply -> checks the guest in, so the host sees they
 *     answered without anyone tapping anything.
 */

export const runtime = "nodejs";

// Meta's subscription handshake.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let body: MetaWebhook;
  try {
    body = JSON.parse(raw) as MetaWebhook;
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  const db = createAdminSupabase();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      // ---- delivery receipts -------------------------------------------
      for (const s of value?.statuses ?? []) {
        const status = mapStatus(s.status);
        if (!status) continue;
        const patch: Record<string, unknown> = { status };
        if (status === "delivered") patch.delivered_at = tsToIso(s.timestamp);
        if (status === "read") {
          patch.read_at = tsToIso(s.timestamp);
          patch.delivered_at = patch.delivered_at ?? tsToIso(s.timestamp);
        }
        if (status === "failed") patch.error = s.errors?.[0]?.title ?? "delivery failed";

        await db.from("notification_logs").update(patch).eq("provider_message_id", s.id);

        // A hard failure means the host needs to pick up a phone.
        if (status === "failed") {
          const { data } = await db.from("notification_logs")
            .select("queue_entry_id").eq("provider_message_id", s.id).maybeSingle();
          const entryId = (data as { queue_entry_id: string | null } | null)?.queue_entry_id;
          if (entryId) {
            await db.from("queue_entries").update({ notify_failed: true }).eq("id", entryId);
          }
        }
      }

      // ---- inbound replies ---------------------------------------------
      for (const m of value?.messages ?? []) {
        const text = (m.button?.text ?? m.text?.body ?? "").toLowerCase();
        if (!text.includes("on my way") && !text.includes("omw")) continue;

        const phone = `+${m.from.replace(/^\+/, "")}`;
        await db.from("queue_entries")
          .update({ status: "checked_in", checked_in_at: new Date().toISOString() })
          .eq("phone_e164", phone)
          .eq("status", "notified");
      }
    }
  }

  return NextResponse.json({ ok: true });
}

function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  // No secret configured means local/mock mode — accept, but only outside prod.
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!header?.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function mapStatus(s: string): NotifStatus | null {
  switch (s) {
    case "sent": return "sent";
    case "delivered": return "delivered";
    case "read": return "read";
    case "failed": return "failed";
    default: return null;
  }
}

function tsToIso(ts?: string) {
  return ts ? new Date(Number(ts) * 1000).toISOString() : new Date().toISOString();
}

interface MetaWebhook {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id: string; status: string; timestamp?: string; errors?: { title?: string }[] }[];
        messages?: { from: string; text?: { body: string }; button?: { text: string } }[];
      };
    }[];
  }[];
}
