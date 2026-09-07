/**
 * Razorpay subscriptions.
 *
 * Pricing is flat, per outlet, in INR — the whole point of building India-first
 * rather than converting a USD price list. GST invoicing is handled by Razorpay
 * against the org's GSTIN, so nothing here computes tax.
 */

import "server-only";
import Razorpay from "razorpay";
import crypto from "node:crypto";
import type { PlanTier } from "@/lib/types";

export interface PlanDef {
  tier: PlanTier;
  name: string;
  /** Monthly price per outlet, in rupees. */
  priceInr: number;
  razorpayPlanId: string | undefined;
  features: string[];
}

export const PLANS: Record<PlanTier, PlanDef> = {
  basic: {
    tier: "basic",
    name: "Basic",
    priceInr: 1499,
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_BASIC,
    features: [
      "QR join page + unlimited guests",
      "WhatsApp queue notifications",
      "List-based host dashboard",
      "Rolling-average wait estimates",
      "Core analytics: waits, funnel, abandonment, peak hours",
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    priceInr: 3999,
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_PRO,
    features: [
      "Everything in Basic",
      "3D floor plan — rotate, zoom, multi-floor",
      "Tap-a-guest, tap-a-table seating",
      "Add, move, merge and renumber tables on the plan",
      "Live-availability wait estimates (more accurate)",
      "Zone heatmap overlay",
      "Full analytics: zone, floor, host, multi-outlet rollup",
    ],
  },
};

let client: Razorpay | null = null;

export function razorpay(): Razorpay {
  if (client) return client;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error("Razorpay keys are not configured");
  client = new Razorpay({ key_id, key_secret });
  return client;
}

export function isBillingConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** Razorpay signs webhooks with the shared secret; reject anything unsigned. */
export function verifyWebhook(raw: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
