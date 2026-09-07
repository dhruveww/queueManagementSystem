"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/auth";
import { razorpay, PLANS, isBillingConfigured } from "@/lib/billing/razorpay";
import type { PlanTier } from "@/lib/types";

export type CheckoutResult =
  | { ok: true; subscriptionId: string; keyId: string }
  | { ok: false; error: string };

/**
 * Creates a Razorpay subscription and hands the id back for Razorpay Checkout.
 * The org's plan is NOT changed here — only the webhook does that, once money
 * has actually moved.
 */
export async function startCheckoutAction(tier: PlanTier): Promise<CheckoutResult> {
  try {
    const session = await requireManager();
    if (!isBillingConfigured()) {
      return { ok: false, error: "Billing isn't configured on this deployment yet" };
    }

    const plan = PLANS[tier];
    if (!plan.razorpayPlanId) {
      return { ok: false, error: `No Razorpay plan id configured for ${plan.name}` };
    }

    const db = createAdminSupabase();
    const quantity = Math.max(1, session.outlets.length);

    const sub = await razorpay().subscriptions.create({
      plan_id: plan.razorpayPlanId,
      total_count: 120,            // 10 years of monthly cycles
      quantity,                    // one seat per outlet
      customer_notify: 1,
      notes: { org_id: session.user.org_id ?? "", tier, outlets: String(quantity) },
    });

    await db.from("subscriptions")
      .update({ razorpay_subscription_id: sub.id, outlet_quota: quantity })
      .eq("org_id", session.user.org_id);

    return { ok: true, subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID! };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Checkout failed" };
  }
}

export async function cancelSubscriptionAction(): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireManager();
    const id = session.subscription?.razorpay_subscription_id;
    if (!id) return { ok: false, error: "No active subscription" };

    // cancel_at_cycle_end keeps the restaurant running until the period they've
    // already paid for actually ends.
    await razorpay().subscriptions.cancel(id, true);
    revalidatePath("/dashboard/billing");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Cancel failed" };
  }
}
