import { describe, expect, it, beforeAll } from "vitest";
import { generateSlots } from "@/lib/meetings/slots";
import { istParts, istToUtc, parseHours, parseDays, formatIstSlot } from "@/lib/meetings/time";
import { signActionToken, verifyActionToken, peekLeadId } from "@/lib/email/actionToken";

beforeAll(() => {
  process.env.LEAD_ACTION_SECRET = "test-secret-for-signing";
});

describe("IST time", () => {
  it("converts an IST wall clock to the right instant", () => {
    // 16:00 IST on 18 Sep 2026 is 10:30 UTC.
    expect(istToUtc(2026, 9, 18, 16).toISOString()).toBe("2026-09-18T10:30:00.000Z");
  });

  it("round-trips back to the same wall clock", () => {
    const p = istParts(istToUtc(2026, 9, 18, 16));
    expect([p.year, p.month, p.day, p.hour]).toEqual([2026, 9, 18, 16]);
  });

  it("reports ISO weekdays with Monday as 1", () => {
    // 18 Sep 2026 is a Friday.
    expect(istParts(istToUtc(2026, 9, 18, 12)).weekday).toBe(5);
  });

  it("parses config, falling back on nonsense", () => {
    expect(parseHours("11:00-19:00")).toEqual([11, 19]);
    expect(parseHours("garbage")).toEqual([11, 19]);
    expect(parseHours("19:00-11:00")).toEqual([11, 19]); // inverted range rejected
    expect(parseDays("1,2,3")).toEqual([1, 2, 3]);
    expect(parseDays("")).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("formats a slot the way a Bengaluru owner reads it", () => {
    const s = istToUtc(2026, 9, 18, 16).toISOString();
    const e = istToUtc(2026, 9, 18, 17).toISOString();
    expect(formatIstSlot(s, e)).toBe("Fri 18 Sep · 4:00 pm – 5:00 pm IST");
  });
});

describe("generateSlots", () => {
  // Tue 15 Sep 2026, 09:00 IST.
  const now = istToUtc(2026, 9, 15, 9);
  const base = { now, busy: [], hours: [11, 19] as [number, number], leadHours: 12, horizonDays: 3 };

  it("only offers slots inside working hours", () => {
    for (const s of generateSlots(base)) {
      const h = istParts(new Date(s.start)).hour;
      expect(h).toBeGreaterThanOrEqual(11);
      expect(h).toBeLessThan(19);
    }
  });

  it("respects the lead time", () => {
    const earliest = now.getTime() + 12 * 3600_000;
    for (const s of generateSlots(base)) {
      expect(new Date(s.start).getTime()).toBeGreaterThanOrEqual(earliest);
    }
  });

  it("skips days the owner does not take calls", () => {
    const weekdaysOnly = generateSlots({ ...base, days: [1, 2, 3, 4, 5], horizonDays: 7 });
    for (const s of weekdaysOnly) {
      expect(istParts(new Date(s.start)).weekday).toBeLessThanOrEqual(5);
    }
  });

  it("removes a slot that a busy block overlaps", () => {
    const busyStart = istToUtc(2026, 9, 16, 15).toISOString();
    const busyEnd = istToUtc(2026, 9, 16, 16).toISOString();
    const withBusy = generateSlots({ ...base, busy: [{ start: busyStart, end: busyEnd }] });
    expect(withBusy.some((s) => s.start === busyStart)).toBe(false);
  });

  it("does not drop a slot that merely touches a busy block", () => {
    // Busy 14:00-15:00 must not remove the 15:00 slot.
    const busy = [{
      start: istToUtc(2026, 9, 16, 14).toISOString(),
      end: istToUtc(2026, 9, 16, 15).toISOString(),
    }];
    const slots = generateSlots({ ...base, busy });
    expect(slots.some((s) => s.start === istToUtc(2026, 9, 16, 15).toISOString())).toBe(true);
  });

  it("excludes slots already held by our own leads", () => {
    const held = istToUtc(2026, 9, 16, 12).toISOString();
    const slots = generateSlots({ ...base, heldStarts: [held] });
    expect(slots.some((s) => s.start === held)).toBe(false);
  });

  it("never returns anything beyond the horizon", () => {
    const slots = generateSlots({ ...base, horizonDays: 2 });
    const limit = now.getTime() + 2 * 24 * 3600_000;
    for (const s of slots) expect(new Date(s.start).getTime()).toBeLessThanOrEqual(limit);
  });
});

describe("action tokens", () => {
  const leadId = "11111111-2222-3333-4444-555555555555";
  const nonce = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("verifies a token it just signed", () => {
    const t = signActionToken({ leadId, action: "approve", nonce });
    const r = verifyActionToken(t, nonce);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.leadId).toBe(leadId);
      expect(r.action).toBe("approve");
    }
  });

  it("rejects a token once the nonce is rotated — this is the revocation lever", () => {
    const t = signActionToken({ leadId, action: "approve", nonce });
    const r = verifyActionToken(t, "99999999-9999-9999-9999-999999999999");
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered action, so a decline link cannot be edited into an approve", () => {
    const t = signActionToken({ leadId, action: "decline", nonce });
    const [p, s] = t.split(".");
    const payload = Buffer.from(p, "base64url").toString("utf8").replace("decline", "approve");
    const forged = `${Buffer.from(payload).toString("base64url")}.${s}`;
    expect(verifyActionToken(forged, nonce)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an expired token", () => {
    const t = signActionToken({ leadId, action: "approve", nonce, ttlDays: -1 });
    expect(verifyActionToken(t, nonce)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects garbage without throwing", () => {
    for (const junk of ["", "x", "a.b.c", "!!!.???"]) {
      expect(verifyActionToken(junk, nonce).ok).toBe(false);
    }
  });

  it("peeks the lead id for the lookup, and refuses a non-uuid", () => {
    const t = signActionToken({ leadId, action: "approve", nonce });
    expect(peekLeadId(t)).toBe(leadId);
    expect(peekLeadId("garbage")).toBeNull();
  });
});
