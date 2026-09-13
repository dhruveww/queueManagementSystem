import { createHmac, timingSafeEqual } from "node:crypto";
import type { LeadAction } from "@/lib/types";

/**
 * Signed, single-use links for the Approve / Reschedule / Decline buttons in
 * the owner's email, and the lead's re-pick link.
 *
 *   token   = base64url(payload) "." base64url(sig)
 *   payload = "1|<leadId>|<action>|<arg>|<expUnix>"
 *   sig     = HMAC-SHA256(LEAD_ACTION_SECRET, payload + "|" + lead.action_nonce)
 *
 * The nonce lives on the lead row and is rotated the moment the lead reaches a
 * terminal state, which invalidates all three of the owner's buttons at once —
 * so there is no used-token table to maintain, and a forwarded email cannot
 * replay an action that already happened.
 *
 * Verification copies the createHmac -> length check -> timingSafeEqual
 * sequence already used for the Razorpay webhook in lib/billing/razorpay.ts.
 */

const VERSION = "1";

export const OWNER_LINK_TTL_DAYS = 14;
export const LEAD_LINK_TTL_DAYS = 7;

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function secret(): string {
  const s = process.env.LEAD_ACTION_SECRET;
  if (!s) {
    // Loud, and deliberately not a silent fallback to a constant — an
    // unsigned-in-effect token would let anyone approve their own meeting.
    throw new Error("LEAD_ACTION_SECRET is not set — cannot sign meeting action links");
  }
  return s;
}

export function signActionToken(args: {
  leadId: string;
  action: LeadAction;
  nonce: string;
  /** Extra data the action needs, e.g. the chosen slot for `repick`. */
  arg?: string;
  ttlDays?: number;
}): string {
  const ttl = args.ttlDays ?? OWNER_LINK_TTL_DAYS;
  const exp = Math.floor(Date.now() / 1000) + ttl * 86_400;
  const payload = [VERSION, args.leadId, args.action, args.arg ?? "", String(exp)].join("|");
  const sig = createHmac("sha256", secret()).update(`${payload}|${args.nonce}`).digest();
  return `${b64url(payload)}.${b64url(sig)}`;
}

export type TokenFailure =
  | "malformed" | "bad_signature" | "expired";

export type ParsedToken =
  | { ok: true; leadId: string; action: LeadAction; arg: string; exp: number }
  | { ok: false; reason: TokenFailure };

/**
 * Parses and checks the signature. The caller must load the lead first, because
 * the nonce is part of the signed material — that is what makes revocation a
 * single UPDATE on the row.
 */
export function verifyActionToken(token: string, nonce: string): ParsedToken {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };

  let payload: string;
  let given: Buffer;
  try {
    payload = Buffer.from(parts[0], "base64url").toString("utf8");
    given = Buffer.from(parts[1], "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const fields = payload.split("|");
  if (fields.length !== 5 || fields[0] !== VERSION) return { ok: false, reason: "malformed" };
  const [, leadId, action, arg, expStr] = fields;

  const expected = createHmac("sha256", secret()).update(`${payload}|${nonce}`).digest();
  if (given.length !== expected.length) return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };

  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: "malformed" };
  if (exp * 1000 < Date.now()) return { ok: false, reason: "expired" };

  return { ok: true, leadId, action: action as LeadAction, arg, exp };
}

/**
 * The lead id is needed to load the row (and therefore the nonce) before the
 * signature can be checked. Reading it from the unverified payload is safe:
 * ids are v4 uuids, so this is a lookup key, not an authorisation decision —
 * nothing is trusted until verifyActionToken passes.
 */
export function peekLeadId(token: string): string | null {
  try {
    const payload = Buffer.from(token.split(".")[0], "base64url").toString("utf8");
    const fields = payload.split("|");
    if (fields.length !== 5 || fields[0] !== VERSION) return null;
    return /^[0-9a-f-]{36}$/i.test(fields[1]) ? fields[1] : null;
  } catch {
    return null;
  }
}
