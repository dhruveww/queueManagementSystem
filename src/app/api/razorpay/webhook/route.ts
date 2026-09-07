import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { verifyWebhook } from "@/lib/billing/razorpay";
import type { SubStatus } from "@/lib/types";

/**
 * Razorpay subscription webhook — the only thing that flips an org's plan.
 * The checkout flow never writes the plan itself, so a client that closes the
 * tab mid-payment can't leave the org on a tier it isn't paying for.
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-razorpay-signature"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  const body = JSON.parse(raw) as {
    event: string;
    payload?: { subscription?: { entity?: RazorpaySubscription } };
  };
  const sub = body.payload?.subscription?.entity;
  if (!sub?.id) return NextResponse.json({ ok: true, ignored: body.event });

  const status = mapStatus(body.event, sub.status);
  if (!status) return NextResponse.json({ ok: true, ignored: body.event });

  const db = createAdminSupabase();
  const patch: Record<string, unknown> = { status };

  if (sub.current_end) {
    patch.current_period_end = new Date(sub.current_end * 1000).toISOString();
  }
  // The plan id is the source of truth for the tier — notes are advisory.
  if (sub.plan_id === process.env.RAZORPAY_PLAN_ID_PRO) patch.plan = "pro";
  else if (sub.plan_id === process.env.RAZORPAY_PLAN_ID_BASIC) patch.plan = "basic";

  await db.from("subscriptions").update(patch).eq("razorpay_subscription_id", sub.id);

  return NextResponse.json({ ok: true, event: body.event, status });
}

function mapStatus(event: string, subStatus?: string): SubStatus | null {
  switch (event) {
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      return "active";
    case "subscription.authenticated":
      return "trialing";
    case "subscription.pending":
      return "past_due";
    case "subscription.halted":
    case "subscription.paused":
      return "halted";
    case "subscription.cancelled":
    case "subscription.completed":
      return "cancelled";
    default:
      // Fall back to whatever Razorpay says the subscription is.
      return subStatus === "active" ? "active" : null;
  }
}

interface RazorpaySubscription {
  id: string;
  status?: string;
  plan_id?: string;
  current_end?: number;
}
