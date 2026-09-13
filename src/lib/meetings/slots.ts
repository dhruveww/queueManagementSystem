import { istParts, istToUtc } from "./time";

/**
 * Turns "the owner's working hours" minus "what is already busy" into a list of
 * bookable one-hour slots.
 *
 * Pure by design — no I/O, no Supabase, no Date.now() — following the same rule
 * CLAUDE.md sets for waitTime.ts, so the awkward parts (IST boundaries, busy
 * intervals that partially overlap, the lead-time cutoff) are unit-testable
 * without a network or a clock.
 */

export interface Interval {
  start: string;  // ISO
  end: string;    // ISO
}

export interface SlotOptions {
  /** Treated as "now"; passed in rather than read, so tests are deterministic. */
  now: Date;
  /** Busy intervals from Google free/busy. */
  busy: Interval[];
  /** Slots already held by our own leads, as ISO start times. */
  heldStarts?: string[];
  /** [from, to) in IST wall-clock hours. */
  hours?: [number, number];
  /** ISO weekdays the owner takes calls on, Monday = 1. */
  days?: number[];
  /** Earliest bookable slot, in hours from `now`. */
  leadHours?: number;
  /** How far ahead to offer. */
  horizonDays?: number;
  slotMinutes?: number;
}

const MIN = 60_000;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  // Touching edges are fine: a 15:00-16:00 busy block does not block 16:00-17:00.
  return aStart < bEnd && bStart < aEnd;
}

export function generateSlots(opts: SlotOptions): Interval[] {
  const {
    now,
    busy,
    heldStarts = [],
    hours = [11, 19],
    days = [1, 2, 3, 4, 5, 6],
    leadHours = 12,
    horizonDays = 14,
    slotMinutes = 60,
  } = opts;

  const [fromHour, toHour] = hours;
  const earliest = now.getTime() + leadHours * 60 * MIN;
  const latest = now.getTime() + horizonDays * 24 * 60 * MIN;

  const busyRanges = busy
    .map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const)
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);

  const held = new Set(heldStarts.map((s) => new Date(s).getTime()));
  const out: Interval[] = [];

  // Walk day by day in IST rather than stepping in fixed 24h jumps, so the
  // working-hours window stays anchored to local wall-clock time.
  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
    const cursor = new Date(now.getTime() + dayOffset * 24 * 60 * MIN);
    const { year, month, day, weekday } = istParts(cursor);
    if (!days.includes(weekday)) continue;

    for (let hour = fromHour; hour + slotMinutes / 60 <= toHour; hour++) {
      const start = istToUtc(year, month, day, hour);
      const startMs = start.getTime();
      const endMs = startMs + slotMinutes * MIN;

      if (startMs < earliest || startMs > latest) continue;
      if (held.has(startMs)) continue;
      if (busyRanges.some(([bs, be]) => overlaps(startMs, endMs, bs, be))) continue;

      out.push({ start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() });
    }
  }

  return out;
}

/** Groups slots into IST calendar days, for the day-tab picker. */
export function groupByIstDay(slots: Interval[]): { day: string; slots: Interval[] }[] {
  const map = new Map<string, Interval[]>();
  for (const s of slots) {
    const p = istParts(new Date(s.start));
    const key = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return [...map.entries()].map(([day, slots]) => ({ day, slots }));
}
