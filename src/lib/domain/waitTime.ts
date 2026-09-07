/**
 * Baari — wait-time estimation.
 *
 * Two modes, deliberately sharing one model so Basic and Pro estimates are
 * comparable and the accuracy difference between them is measurable:
 *
 *   live_availability (Pro)  — uses real per-table status and how long each
 *                              occupied table has already been sitting, so a
 *                              table that's 40 minutes into a 45-minute average
 *                              turn is treated as nearly free.
 *   rolling_average  (Basic) — no live table state, so every matching table is
 *                              assumed to be mid-turn (expected residual life
 *                              of half the average turn under a uniform
 *                              arrival assumption).
 *
 * Both then answer the same question: "I am Nth in line for a table of my
 * size — when does the Nth-soonest table free up?"
 *
 * Output is always a range. A single number would be false precision and the
 * guest will hold you to it.
 */

import type {
  QueueEntry, RestaurantTable, TableGroup, WaitMethod, ZoneKind,
} from "@/lib/types";

/** Average turn time in minutes, keyed by party-size bucket (2/4/6/8). */
export type TurnStats = Record<number, number>;

export const DEFAULT_TURN_MIN: TurnStats = { 2: 35, 4: 45, 6: 60, 8: 75 };

/** Minutes we assume a table still needs once it's flagged "clearing". */
const CLEARING_MIN = 5;
/** An occupied table is never estimated as freeing in less than this. */
const MIN_RESIDUAL_MIN = 5;
/** Bussing + walking the guest in, added once to every estimate. */
const HANDOFF_MIN = 3;
/** A table this much larger than the party is wasted seating; deprioritised. */
const OVERSIZE_TOLERANCE = 2;

export function partyBucket(n: number): number {
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  if (n <= 6) return 6;
  return 8;
}

export function turnFor(stats: TurnStats, partySize: number): number {
  const b = partyBucket(partySize);
  return stats[b] ?? DEFAULT_TURN_MIN[b] ?? 45;
}

export interface SeatableUnit {
  id: string;
  kind: "table" | "group";
  capacity: number;
  status: RestaurantTable["status"];
  zoneKind?: ZoneKind | null;
  /** When the current party sat down. Only meaningful while occupied. */
  occupiedSince?: string | Date | null;
}

export interface EstimateInput {
  partySize: number;
  /** 1-based place in line among guests competing for the same table size. */
  position: number;
  units: SeatableUnit[];
  turnStats: TurnStats;
  method: WaitMethod;
  zonePref?: ZoneKind | null;
  now?: Date;
}

export interface WaitEstimate {
  lowMin: number;
  highMin: number;
  midMin: number;
  method: WaitMethod;
  /** How many tables can actually seat this party. 0 means "we can't say". */
  matchingUnits: number;
}

/** A unit can seat the party, and isn't absurdly oversized for it. */
export function unitFits(unit: SeatableUnit, partySize: number): boolean {
  return unit.capacity >= partySize;
}

function isSeatable(unit: SeatableUnit): boolean {
  return unit.status === "free" || unit.status === "occupied" || unit.status === "clearing";
}

/** Minutes until this unit is expected to be available. */
export function unitEta(unit: SeatableUnit, avgTurn: number, now: Date): number {
  switch (unit.status) {
    case "free":
      return 0;
    case "clearing":
      return CLEARING_MIN;
    case "occupied": {
      if (!unit.occupiedSince) return avgTurn / 2;
      const elapsedMin =
        (now.getTime() - new Date(unit.occupiedSince).getTime()) / 60_000;
      return Math.max(MIN_RESIDUAL_MIN, avgTurn - elapsedMin);
    }
    default:
      return Number.POSITIVE_INFINITY; // reserved / blocked — not in the pool
  }
}

export function estimateWait(input: EstimateInput): WaitEstimate {
  const now = input.now ?? new Date();
  const avgTurn = turnFor(input.turnStats, input.partySize);

  // Prefer the guest's zone, but never let a preference make us claim there
  // are no tables at all — fall back to the whole floor if the zone is empty.
  const fits = input.units.filter((u) => isSeatable(u) && unitFits(u, input.partySize));
  const zoned = input.zonePref
    ? fits.filter((u) => u.zoneKind === input.zonePref)
    : [];
  const pool = zoned.length > 0 ? zoned : fits;

  if (pool.length === 0) {
    // Nothing on the floor seats this party. Quote a long, honest band rather
    // than dividing by zero.
    const mid = avgTurn * Math.max(1, input.position);
    return { ...band(mid), midMin: mid, method: input.method, matchingUnits: 0 };
  }

  // Smallest suitable tables first — seating a party of 2 at a 6-top is what
  // creates the next hour of waiting.
  const ranked = [...pool].sort((a, b) => {
    const aWaste = a.capacity - input.partySize;
    const bWaste = b.capacity - input.partySize;
    const aPenalty = aWaste > OVERSIZE_TOLERANCE ? 1 : 0;
    const bPenalty = bWaste > OVERSIZE_TOLERANCE ? 1 : 0;
    return aPenalty - bPenalty || aWaste - bWaste;
  });

  const etas =
    input.method === "live_availability"
      ? ranked.map((u) => unitEta(u, avgTurn, now)).sort((a, b) => a - b)
      : // Basic plan: no trustworthy live status, so treat every matching table
        // as mid-turn. Expected residual life is half the average turn.
        ranked.map(() => avgTurn / 2);

  const n = etas.length;
  const idx = Math.max(0, input.position - 1);
  const rounds = Math.floor(idx / n);
  const slot = idx % n;
  const mid = etas[slot] + rounds * avgTurn + (input.position > 0 ? HANDOFF_MIN : 0);

  return { ...band(mid), midMin: mid, method: input.method, matchingUnits: n };
}

/**
 * Turn a point estimate into a guest-facing range: ±20%, widened to a minimum
 * 10-minute band, snapped to 5-minute boundaries. "15–25 min", never "17 min".
 */
export function band(mid: number): { lowMin: number; highMin: number } {
  if (!Number.isFinite(mid) || mid <= 2) return { lowMin: 0, highMin: 5 };
  const spread = Math.max(5, mid * 0.2);
  const low = Math.max(0, Math.floor((mid - spread) / 5) * 5);
  const high = Math.ceil((mid + spread) / 5) * 5;
  return { lowMin: low, highMin: Math.max(high, low + 10) };
}

export function formatWait(low: number, high: number): string {
  if (high <= 5 && low === 0) return "Almost ready";
  return `${low}–${high} min`;
}

/**
 * Where this guest actually stands in line. Only guests competing for the same
 * table size are ahead of them — a party of 8 doesn't wait behind twenty
 * couples. Manual VIP priority sorts above join order.
 */
export function positionInLine(entry: QueueEntry, openEntries: QueueEntry[]): number {
  const bucket = partyBucket(entry.party_size);
  const ahead = openEntries.filter((e) => {
    if (e.id === entry.id) return false;
    if (partyBucket(e.party_size) !== bucket) return false;
    if (e.priority !== entry.priority) return e.priority > entry.priority;
    return new Date(e.joined_at) < new Date(entry.joined_at);
  });
  return ahead.length + 1;
}

/** Overall place in the visible line, across all party sizes — what the board shows. */
export function overallPosition(entry: QueueEntry, openEntries: QueueEntry[]): number {
  const ahead = openEntries.filter((e) => {
    if (e.id === entry.id) return false;
    if (e.priority !== entry.priority) return e.priority > entry.priority;
    return new Date(e.joined_at) < new Date(entry.joined_at);
  });
  return ahead.length + 1;
}

/** Build the seatable pool from live table + group rows. Merged members are excluded. */
export function unitsFromTables(
  tables: RestaurantTable[],
  groups: TableGroup[],
  zones: { id: string; kind: ZoneKind }[] = [],
  /** unit id -> ISO timestamp the current party sat down. */
  occupiedSince: Record<string, string> = {},
): SeatableUnit[] {
  const zoneKind = new Map(zones.map((z) => [z.id, z.kind]));
  const loose = tables
    .filter((t) => !t.merged_group_id)
    .map<SeatableUnit>((t) => ({
      id: t.id,
      kind: "table",
      capacity: t.capacity,
      status: t.status,
      zoneKind: zoneKind.get(t.zone_id) ?? null,
      occupiedSince: occupiedSince[t.id] ?? null,
    }));

  // A merged group inherits the zone of its members (they must share a floor;
  // in practice adjacent tables share a zone too — take the first member's).
  const memberZone = new Map<string, string>();
  for (const t of tables) {
    if (t.merged_group_id && !memberZone.has(t.merged_group_id)) {
      memberZone.set(t.merged_group_id, t.zone_id);
    }
  }
  const merged = groups.map<SeatableUnit>((g) => ({
    id: g.id,
    kind: "group",
    capacity: g.capacity,
    status: g.status,
    zoneKind: zoneKind.get(memberZone.get(g.id) ?? "") ?? null,
    occupiedSince: occupiedSince[g.id] ?? null,
  }));

  return [...loose, ...merged];
}
