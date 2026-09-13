import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Rate limiting for the public, unauthenticated guest paths.
 *
 * Why this exists: joining the queue sends a real, billed WhatsApp template to
 * a phone number the requester supplies and does not own. Unthrottled, that is
 * an economic attack (the restaurant pays per request), a deliverability attack
 * (unsolicited messages from their verified Meta sender is the fastest route to
 * a WABA ban), and a product attack (a fake 3-hour line makes real guests walk).
 * The only pre-existing control was a one-live-entry-per-phone dedupe, which
 * stops a double-tap and nothing else — the phone regex admits ~4bn numbers.
 *
 * Deliberately no Redis and no new service: two cheap in-process layers catch
 * naive floods, and an indexed Postgres count is the authoritative backstop.
 * Serverless means the in-memory layer is per-instance and therefore advisory
 * only — Postgres is the one that actually holds.
 */

/** Best-effort client IP. Vercel sets x-forwarded-for; the first hop is the client. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Raw IPs are personal data under DPDP, and we only ever need equality, so
 * store a salted digest. Without a salt this would be trivially reversible —
 * the IPv4 space is small enough to brute force a bare sha256.
 */
export function hashIp(ip: string): string {
  const salt = process.env.LEAD_IP_SALT ?? "";
  if (!salt) {
    console.warn("[rateLimit] LEAD_IP_SALT is not set — IP hashes are reversible.");
  }
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------- in-memory

type Bucket = { hits: number[]; };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** Drop stale buckets so a long-lived lambda doesn't grow unbounded. */
function sweep(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    b.hits = b.hits.filter((t) => now - t < windowMs);
    if (b.hits.length === 0) buckets.delete(key);
  }
}

/**
 * Per-instance sliding window. Returns false when the caller is over budget.
 * Advisory: a flood spread across lambda instances slips past this, which is
 * exactly why `enforceJoinLimit` also asks the database.
 */
export function memoryLimit(key: string, max: number, windowMs: number): boolean {
  sweep(windowMs);
  const now = Date.now();
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= max) {
    buckets.set(key, b);
    return false;
  }
  b.hits.push(now);
  buckets.set(key, b);
  return true;
}

// ----------------------------------------------------------------- postgres

export interface LimitResult {
  ok: boolean;
  /** Guest-facing copy. Deliberately vague — never confirm what tripped. */
  error?: string;
}

const TOO_MANY = "Too many attempts from this device. Please try again in a few minutes.";

/**
 * Authoritative check for a queue join, run before any message is sent.
 *
 *   per IP     — 5 joins/hour across all outlets
 *   per outlet — a daily ceiling, so one restaurant can't be bled overnight
 *
 * Both counts hit `queue_entries (outlet_id, joined_at)` and the ip_hash index,
 * so this is two cheap indexed counts, not a scan.
 */
export async function enforceJoinLimit(
  outletId: string,
  ip: string,
  opts: { perIpPerHour?: number; perOutletPerDay?: number } = {},
): Promise<LimitResult> {
  const perIpPerHour = opts.perIpPerHour ?? 5;
  const perOutletPerDay = opts.perOutletPerDay ?? 500;

  if (!memoryLimit(`join:${hashIp(ip)}`, perIpPerHour, 60 * 60 * 1000)) {
    return { ok: false, error: TOO_MANY };
  }

  const db = createAdminSupabase();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [ipRes, outletRes] = await Promise.all([
    db.from("queue_entries").select("*", { count: "exact", head: true })
      .eq("ip_hash", hashIp(ip)).gte("joined_at", hourAgo),
    db.from("queue_entries").select("*", { count: "exact", head: true })
      .eq("outlet_id", outletId).gte("joined_at", dayAgo),
  ]);

  if ((ipRes.count ?? 0) >= perIpPerHour) return { ok: false, error: TOO_MANY };
  if ((outletRes.count ?? 0) >= perOutletPerDay) {
    return { ok: false, error: "This restaurant's queue is unusually busy right now. Please ask a host to add you." };
  }

  return { ok: true };
}

/**
 * The status page polls every 20s per open tab and each poll costs several
 * admin round trips, so the leave action gets a looser in-memory guard only —
 * it sends no messages and cannot spend money.
 */
export function enforceLeaveLimit(ip: string): LimitResult {
  if (!memoryLimit(`leave:${hashIp(ip)}`, 20, 60 * 1000)) {
    return { ok: false, error: TOO_MANY };
  }
  return { ok: true };
}

/**
 * A hidden field real users never see. Bots fill every input they find, so a
 * non-empty value is a near-certain bot. Uses display:none rather than
 * off-screen positioning because password managers skip hidden fields but will
 * happily autofill something parked at left:-9999px.
 */
export function isHoneypotTripped(value: FormDataEntryValue | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
