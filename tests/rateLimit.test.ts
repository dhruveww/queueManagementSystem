import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `src/lib/rateLimit.ts` imports "server-only" and the admin Supabase client,
 * neither of which loads under vitest. Stub both so the pure logic — the
 * in-memory window, the honeypot, and the IP digest — can be tested directly.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Map() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({}) }));

const { memoryLimit, isHoneypotTripped, hashIp } = await import("@/lib/rateLimit");

describe("memoryLimit", () => {
  beforeEach(() => vi.useRealTimers());

  it("allows up to the cap and blocks the next call", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(memoryLimit(key, 5, 60_000)).toBe(true);
    }
    expect(memoryLimit(key, 5, 60_000)).toBe(false);
  });

  it("keeps separate budgets per key, so one guest cannot exhaust another", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 5; i++) memoryLimit(a, 5, 60_000);
    expect(memoryLimit(a, 5, 60_000)).toBe(false);
    expect(memoryLimit(b, 5, 60_000)).toBe(true);
  });

  it("forgets hits once they age out of the window", () => {
    vi.useFakeTimers();
    const key = `w-${Math.random()}`;
    for (let i = 0; i < 3; i++) memoryLimit(key, 3, 1_000);
    expect(memoryLimit(key, 3, 1_000)).toBe(false);

    vi.advanceTimersByTime(1_500);
    expect(memoryLimit(key, 3, 1_000)).toBe(true);
    vi.useRealTimers();
  });
});

describe("isHoneypotTripped", () => {
  it("treats an untouched field as human", () => {
    expect(isHoneypotTripped(null)).toBe(false);
    expect(isHoneypotTripped("")).toBe(false);
    // A browser that autofills whitespace shouldn't lock a real guest out.
    expect(isHoneypotTripped("   ")).toBe(false);
  });

  it("flags any real value", () => {
    expect(isHoneypotTripped("https://spam.example")).toBe(true);
  });
});

describe("hashIp", () => {
  it("is deterministic, so counting by device works", () => {
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
  });

  it("separates different addresses", () => {
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("1.2.3.5"));
  });

  it("never returns the address itself", () => {
    expect(hashIp("1.2.3.4")).not.toContain("1.2.3.4");
  });

  it("changes with the salt, so a leaked table can't be reversed with a plain sha256", () => {
    const before = process.env.LEAD_IP_SALT;
    process.env.LEAD_IP_SALT = "salt-one";
    const one = hashIp("1.2.3.4");
    process.env.LEAD_IP_SALT = "salt-two";
    const two = hashIp("1.2.3.4");
    process.env.LEAD_IP_SALT = before;
    expect(one).not.toBe(two);
  });
});
