"use client";

import { useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { startCheckoutAction, cancelSubscriptionAction } from "./actions";
import type { PlanTier, SubStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

interface PlanCard { tier: PlanTier; name: string; priceInr: number; features: string[] }

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function BillingView({
  currentPlan, status, trialEndsAt, periodEnd, outletCount, configured, plans,
}: {
  currentPlan: PlanTier;
  status: SubStatus;
  trialEndsAt: string | null;
  periodEnd: string | null;
  outletCount: number;
  configured: boolean;
  plans: PlanCard[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<PlanTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upgrade(tier: PlanTier) {
    setBusy(tier);
    setError(null);

    const res = await startCheckoutAction(tier);
    if (!res.ok) { setError(res.error); setBusy(null); return; }

    if (!window.Razorpay) {
      setError("Payment window didn't load — check your connection and try again");
      setBusy(null);
      return;
    }

    new window.Razorpay({
      key: res.keyId,
      subscription_id: res.subscriptionId,
      name: "Baari",
      description: `${tier === "pro" ? "Pro" : "Basic"} plan · ${outletCount} outlet${outletCount > 1 ? "s" : ""}`,
      theme: { color: "#ff8112" },
      // The plan only changes once Razorpay's webhook confirms the charge, so
      // this just brings the manager back to a page that will reflect it.
      handler: () => { setBusy(null); router.refresh(); },
      modal: { ondismiss: () => setBusy(null) },
    }).open();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <h1 className="text-xl font-semibold text-white">Billing</h1>
      <p className="mt-1 text-sm text-ink-400">
        Flat monthly pricing per outlet, in rupees. GST invoices come from Razorpay.
      </p>

      <div className="mt-4 rounded-xl border border-ink-800 bg-ink-900 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-ink-400">Current plan</span>
          <span className="rounded bg-saffron-500/15 px-2 py-0.5 font-semibold capitalize text-saffron-400">
            {currentPlan}
          </span>
          <StatusPill status={status} />
          <span className="text-ink-500 tnum">
            {outletCount} outlet{outletCount > 1 ? "s" : ""}
          </span>
          {status === "trialing" && trialEndsAt && (
            <span className="text-ink-500">
              Trial ends {new Date(trialEndsAt).toLocaleDateString("en-IN")}
            </span>
          )}
          {periodEnd && status === "active" && (
            <span className="text-ink-500">
              Renews {new Date(periodEnd).toLocaleDateString("en-IN")}
            </span>
          )}
        </div>
      </div>

      {!configured && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-status-clearing/10 p-3 text-sm text-status-clearing">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Razorpay keys aren't set on this deployment, so checkout is disabled. Add
          RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and the plan ids to enable it.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {plans.map((plan) => {
          const isCurrent = plan.tier === currentPlan;
          return (
            <div
              key={plan.tier}
              className={cn(
                "rounded-2xl border p-5",
                plan.tier === "pro"
                  ? "border-saffron-500/50 bg-saffron-500/5"
                  : "border-ink-800 bg-ink-900",
              )}
            >
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
                {plan.tier === "pro" && (
                  <span className="rounded bg-saffron-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-saffron-400">
                    Flagship
                  </span>
                )}
              </div>
              <p className="mt-2 text-3xl font-bold text-white">
                ₹{plan.priceInr.toLocaleString("en-IN")}
                <span className="ml-1 text-sm font-normal text-ink-400">/outlet/month</span>
              </p>
              <p className="mt-1 text-xs text-ink-500 tnum">
                ₹{(plan.priceInr * outletCount).toLocaleString("en-IN")}/month for {outletCount} outlet
                {outletCount > 1 ? "s" : ""}
              </p>

              <ul className="mt-4 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-ink-300">
                    <Check className="mt-0.5 size-4 shrink-0 text-status-free" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                disabled={isCurrent || !configured || busy !== null}
                onClick={() => upgrade(plan.tier)}
                className={cn(
                  "mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold transition",
                  isCurrent
                    ? "cursor-default bg-ink-800 text-ink-400"
                    : "bg-saffron-500 text-white disabled:opacity-50",
                )}
              >
                {busy === plan.tier && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {isCurrent ? "Current plan" : `Switch to ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {status === "active" && (
        <button
          onClick={async () => {
            const res = await cancelSubscriptionAction();
            if (!res.ok) setError(res.error ?? "Cancel failed");
            else router.refresh();
          }}
          className="mt-6 text-sm text-ink-500 underline hover:text-ink-300"
        >
          Cancel at the end of the current period
        </button>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SubStatus }) {
  const tone =
    status === "active" ? "bg-status-free/15 text-status-free"
    : status === "trialing" ? "bg-status-reserved/15 text-status-reserved"
    : status === "past_due" ? "bg-status-clearing/15 text-status-clearing"
    : "bg-ink-800 text-ink-400";
  return <span className={cn("rounded px-2 py-0.5 text-xs font-medium capitalize", tone)}>{status.replace("_", " ")}</span>;
}
