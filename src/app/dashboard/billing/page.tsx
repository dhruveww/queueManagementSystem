import { requireManager } from "@/lib/auth";
import { PLANS, isBillingConfigured } from "@/lib/billing/razorpay";
import { BillingView } from "./BillingView";

export const metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await requireManager();
  return (
    <BillingView
      currentPlan={session.plan}
      status={session.subscription?.status ?? "trialing"}
      trialEndsAt={session.subscription?.trial_ends_at ?? null}
      periodEnd={session.subscription?.current_period_end ?? null}
      outletCount={session.outlets.length}
      configured={isBillingConfigured()}
      plans={[PLANS.basic, PLANS.pro].map((p) => ({
        tier: p.tier, name: p.name, priceInr: p.priceInr, features: p.features,
      }))}
    />
  );
}
