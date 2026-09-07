import { describe, it, expect } from "vitest";
import {
  estimateWait, band, partyBucket, unitEta, positionInLine,
  formatWait, unitsFromTables, DEFAULT_TURN_MIN,
  type SeatableUnit,
} from "@/lib/domain/waitTime";
import type { QueueEntry, RestaurantTable, TableGroup } from "@/lib/types";

const NOW = new Date("2026-09-07T19:00:00+05:30");
const turn = DEFAULT_TURN_MIN;

function unit(p: Partial<SeatableUnit> & { id: string }): SeatableUnit {
  return { kind: "table", capacity: 4, status: "free", ...p };
}

describe("partyBucket", () => {
  it("buckets by seating footprint, not exact headcount", () => {
    expect([1, 2].map(partyBucket)).toEqual([2, 2]);
    expect([3, 4].map(partyBucket)).toEqual([4, 4]);
    expect([5, 6].map(partyBucket)).toEqual([6, 6]);
    expect([7, 12].map(partyBucket)).toEqual([8, 8]);
  });
});

describe("band", () => {
  it("never returns false precision", () => {
    const b = band(17);
    expect(b.lowMin % 5).toBe(0);
    expect(b.highMin % 5).toBe(0);
    expect(b.lowMin).toBeLessThan(17);
    expect(b.highMin).toBeGreaterThan(17);
  });

  it("keeps a minimum 10 minute band so short quotes aren't over-promised", () => {
    const b = band(8);
    expect(b.highMin - b.lowMin).toBeGreaterThanOrEqual(10);
  });

  it("collapses to 'almost ready' territory at the bottom", () => {
    expect(band(0)).toEqual({ lowMin: 0, highMin: 5 });
    expect(formatWait(0, 5)).toBe("Almost ready");
  });
});

describe("unitEta", () => {
  it("is zero for a free table", () => {
    expect(unitEta(unit({ id: "a" }), 45, NOW)).toBe(0);
  });

  it("credits a table that is already deep into its turn", () => {
    const sat40 = new Date(NOW.getTime() - 40 * 60_000).toISOString();
    expect(unitEta(unit({ id: "a", status: "occupied", occupiedSince: sat40 }), 45, NOW)).toBe(5);
  });

  it("never promises an occupied table in under 5 minutes", () => {
    const sat90 = new Date(NOW.getTime() - 90 * 60_000).toISOString();
    expect(unitEta(unit({ id: "a", status: "occupied", occupiedSince: sat90 }), 45, NOW)).toBe(5);
  });

  it("excludes reserved and blocked tables from the pool", () => {
    expect(unitEta(unit({ id: "a", status: "reserved" }), 45, NOW)).toBe(Infinity);
    expect(unitEta(unit({ id: "b", status: "blocked" }), 45, NOW)).toBe(Infinity);
  });
});

describe("estimateWait — live availability (Pro)", () => {
  it("quotes almost nothing when a matching table is free and you're first", () => {
    const e = estimateWait({
      partySize: 2, position: 1, turnStats: turn, method: "live_availability", now: NOW,
      units: [unit({ id: "t1", capacity: 2 })],
    });
    expect(e.midMin).toBeLessThanOrEqual(5);
    expect(e.matchingUnits).toBe(1);
  });

  it("hands the Nth guest the Nth-soonest table, not the soonest", () => {
    const mins = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
    const units = [
      unit({ id: "t1", capacity: 2, status: "occupied", occupiedSince: mins(30) }), // ~5 left
      unit({ id: "t2", capacity: 2, status: "occupied", occupiedSince: mins(15) }), // ~20 left
      unit({ id: "t3", capacity: 2, status: "occupied", occupiedSince: mins(5) }),  // ~30 left
    ];
    const first  = estimateWait({ partySize: 2, position: 1, units, turnStats: turn, method: "live_availability", now: NOW });
    const second = estimateWait({ partySize: 2, position: 2, units, turnStats: turn, method: "live_availability", now: NOW });
    const third  = estimateWait({ partySize: 2, position: 3, units, turnStats: turn, method: "live_availability", now: NOW });

    expect(first.midMin).toBeLessThan(second.midMin);
    expect(second.midMin).toBeLessThan(third.midMin);
    expect(first.midMin).toBeCloseTo(5 + 3, 5);   // 5 min residual + handoff
  });

  it("adds a full turn once the queue is longer than the matching table count", () => {
    const units = [unit({ id: "t1", capacity: 2 }), unit({ id: "t2", capacity: 2 })];
    const p2 = estimateWait({ partySize: 2, position: 2, units, turnStats: turn, method: "live_availability", now: NOW });
    const p3 = estimateWait({ partySize: 2, position: 3, units, turnStats: turn, method: "live_availability", now: NOW });
    expect(p3.midMin - p2.midMin).toBeCloseTo(turn[2], 5);
  });

  it("ignores tables too small for the party", () => {
    const units = [
      unit({ id: "small1", capacity: 2 }), unit({ id: "small2", capacity: 2 }),
      unit({ id: "big", capacity: 8, status: "occupied", occupiedSince: NOW.toISOString() }),
    ];
    const e = estimateWait({ partySize: 7, position: 1, units, turnStats: turn, method: "live_availability", now: NOW });
    expect(e.matchingUnits).toBe(1);
    expect(e.midMin).toBeGreaterThan(60);
  });

  it("quotes an honest long wait when nothing on the floor fits the party", () => {
    const e = estimateWait({
      partySize: 12, position: 1, turnStats: turn, method: "live_availability", now: NOW,
      units: [unit({ id: "t1", capacity: 4 })],
    });
    expect(e.matchingUnits).toBe(0);
    expect(e.highMin).toBeGreaterThan(60);
    expect(Number.isFinite(e.midMin)).toBe(true);
  });

  it("prefers the guest's zone but falls back rather than claiming no tables", () => {
    const units = [
      unit({ id: "in1", capacity: 4, zoneKind: "indoor" }),
      unit({ id: "in2", capacity: 4, zoneKind: "indoor" }),
    ];
    const e = estimateWait({
      partySize: 4, position: 1, units, turnStats: turn,
      method: "live_availability", zonePref: "rooftop", now: NOW,
    });
    expect(e.matchingUnits).toBe(2); // fell back to the whole floor
  });

  it("seats a small party at the smallest suitable table first", () => {
    const units = [
      unit({ id: "six", capacity: 6, status: "free" }),
      unit({ id: "two", capacity: 2, status: "occupied", occupiedSince: NOW.toISOString() }),
    ];
    // Both fit a party of 2, but the 6-top is oversize; it is still usable,
    // so a free 6-top must not be ignored when the 2-top is fully occupied.
    const e = estimateWait({ partySize: 2, position: 1, units, turnStats: turn, method: "live_availability", now: NOW });
    expect(e.midMin).toBeLessThan(10);
  });
});

describe("estimateWait — rolling average (Basic)", () => {
  it("does not use live table status at all", () => {
    const free = [unit({ id: "t1", capacity: 2, status: "free" })];
    const busy = [unit({ id: "t1", capacity: 2, status: "occupied", occupiedSince: NOW.toISOString() })];
    const a = estimateWait({ partySize: 2, position: 1, units: free, turnStats: turn, method: "rolling_average", now: NOW });
    const b = estimateWait({ partySize: 2, position: 1, units: busy, turnStats: turn, method: "rolling_average", now: NOW });
    expect(a.midMin).toBe(b.midMin);
  });

  it("assumes every matching table is mid-turn", () => {
    const units = [unit({ id: "t1", capacity: 2 })];
    const e = estimateWait({ partySize: 2, position: 1, units, turnStats: turn, method: "rolling_average", now: NOW });
    expect(e.midMin).toBeCloseTo(turn[2] / 2 + 3, 5);
  });

  it("is less accurate than live availability when a table just freed up", () => {
    const units = [unit({ id: "t1", capacity: 2, status: "free" })];
    const pro   = estimateWait({ partySize: 2, position: 1, units, turnStats: turn, method: "live_availability", now: NOW });
    const basic = estimateWait({ partySize: 2, position: 1, units, turnStats: turn, method: "rolling_average", now: NOW });
    expect(pro.midMin).toBeLessThan(basic.midMin);
  });
});

describe("positionInLine", () => {
  const mk = (o: Partial<QueueEntry>): QueueEntry =>
    ({ id: "x", party_size: 2, priority: 0, joined_at: NOW.toISOString(), ...o } as QueueEntry);

  it("only counts guests competing for the same table size", () => {
    const me = mk({ id: "me", party_size: 2, joined_at: "2026-09-07T19:30:00Z" });
    const open = [
      me,
      mk({ id: "a", party_size: 8, joined_at: "2026-09-07T19:00:00Z" }),
      mk({ id: "b", party_size: 8, joined_at: "2026-09-07T19:05:00Z" }),
      mk({ id: "c", party_size: 2, joined_at: "2026-09-07T19:10:00Z" }),
    ];
    expect(positionInLine(me, open)).toBe(2); // only "c" is genuinely ahead
  });

  it("puts a VIP bump ahead of earlier arrivals", () => {
    const me = mk({ id: "me", party_size: 2, joined_at: "2026-09-07T19:30:00Z" });
    const open = [me, mk({ id: "vip", party_size: 2, priority: 10, joined_at: "2026-09-07T19:45:00Z" })];
    expect(positionInLine(me, open)).toBe(2);
  });
});

describe("unitsFromTables", () => {
  const table = (o: Partial<RestaurantTable> & { id: string }): RestaurantTable =>
    ({ capacity: 4, status: "free", zone_id: "z1", merged_group_id: null, ...o } as RestaurantTable);

  it("hides merged members and exposes the group instead", () => {
    const tables = [
      table({ id: "t4", merged_group_id: "g1" }),
      table({ id: "t5", merged_group_id: "g1" }),
      table({ id: "t6" }),
    ];
    const groups: TableGroup[] = [
      { id: "g1", outlet_id: "o", floor_id: "f", label: "T4+T5", capacity: 8, status: "free" },
    ];
    const units = unitsFromTables(tables, groups, [{ id: "z1", kind: "rooftop" }]);
    expect(units.map((u) => u.id).sort()).toEqual(["g1", "t6"]);
    expect(units.find((u) => u.id === "g1")!.capacity).toBe(8);
    expect(units.find((u) => u.id === "g1")!.zoneKind).toBe("rooftop");
  });
});
