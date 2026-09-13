/**
 * IST helpers.
 *
 * India is UTC+5:30 and has never observed DST, so a fixed offset is correct
 * here and avoids pulling in a timezone library for one zone. Everything is
 * stored as UTC (`timestamptz`); this module exists only for the boundaries —
 * turning the owner's working hours into real instants, and rendering an
 * instant back to something a restaurant owner in Bengaluru would recognise.
 *
 * Pure: no I/O, no Supabase. Unit-tested alongside waitTime.ts.
 */

export const IST_OFFSET_MIN = 330;
export const IST_TZ = "Asia/Kolkata";

/** A wall-clock time in IST -> the UTC instant it refers to. */
export function istToUtc(y: number, m: number, d: number, hour: number, min = 0): Date {
  // Date.UTC treats the parts as UTC, so subtracting the offset converts a
  // wall-clock reading in IST into the correct instant.
  return new Date(Date.UTC(y, m - 1, d, hour, min) - IST_OFFSET_MIN * 60_000);
}

/** The IST calendar parts of an instant. */
export function istParts(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    /** ISO weekday, Monday = 1 … Sunday = 7. */
    weekday: ((shifted.getUTCDay() + 6) % 7) + 1,
  };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Fri 18 Sep".
 *
 * Composed by hand rather than via Intl: `en-IN` renders this as "Fri, 18 Sept"
 * — a comma that reads badly mid-sentence in an email subject, and a
 * four-letter "Sept" that is inconsistent with every other month. The parts
 * come from istParts, so this is still correct for the zone.
 */
export function formatIstDay(iso: string): string {
  const p = istParts(new Date(iso));
  return `${WEEKDAYS[p.weekday - 1]} ${p.day} ${MONTHS[p.month - 1]}`;
}

/** "4:00 pm" */
export function formatIstTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST_TZ,
  }).format(new Date(iso)).toLowerCase();
}

/** "Thu 18 Sep · 4:00 – 5:00 pm IST" — the one-line form used in emails. */
export function formatIstSlot(startIso: string, endIso: string): string {
  return `${formatIstDay(startIso)} · ${formatIstTime(startIso)} – ${formatIstTime(endIso)} IST`;
}

/** RFC3339 with an explicit +05:30, which is what the Calendar API wants. */
export function toRfc3339Ist(d: Date): string {
  const p = istParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00+05:30`;
}

/** Parses "11:00-19:00" from MEETING_HOURS. */
export function parseHours(spec: string): [number, number] {
  const m = /^(\d{1,2}):\d{2}\s*-\s*(\d{1,2}):\d{2}$/.exec(spec.trim());
  if (!m) return [11, 19];
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (!(from >= 0 && to <= 24 && from < to)) return [11, 19];
  return [from, to];
}

/** Parses "1,2,3,4,5,6" from MEETING_DAYS into ISO weekdays. */
export function parseDays(spec: string): number[] {
  const days = spec.split(",").map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 7);
  return days.length ? days : [1, 2, 3, 4, 5, 6];
}
