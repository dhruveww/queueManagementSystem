import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCalendar } from "@/lib/google/calendar";
import { generateSlots, groupByIstDay, type Interval } from "@/lib/meetings/slots";
import { formatIstDay, formatIstTime, parseDays, parseHours } from "@/lib/meetings/time";
import { clientIp, memoryLimit, hashIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bookable intro-call slots.
 *
 * Cached for a minute in module scope: the picker feels instant, and Google's
 * free/busy quota isn't spent once per keystroke on a page that anyone can
 * load. A minute is short enough that a slot the owner books by hand shows up
 * quickly, and the submit path re-checks against live free/busy anyway.
 */

let cache: { at: number; payload: unknown } | null = null;
const TTL_MS = 60_000;

export async function GET(_req: NextRequest) {
  const ip = await clientIp();
  if (!memoryLimit(`slots:${hashIp(ip)}`, 30, 5 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.payload, { headers: { "Cache-Control": "no-store" } });
  }

  const horizonDays = Number(process.env.MEETING_HORIZON_DAYS ?? 14);
  const now = new Date();
  const to = new Date(now.getTime() + horizonDays * 86_400_000);

  let busy: Interval[] = [];
  try {
    busy = await getCalendar().freeBusy(now.toISOString(), to.toISOString());
  } catch (err) {
    // A calendar outage must not take the form down — better to offer slots
    // from our own held list and re-check at submit than to show a dead page.
    console.error("[slots] freeBusy failed, falling back to held-only:", err);
  }

  // Our own tentative holds, in case free/busy hasn't caught up yet.
  const db = createAdminSupabase();
  const { data: held } = await db.from("leads")
    .select("slot_start")
    .in("status", ["new", "proposed", "approved"])
    .not("slot_start", "is", null)
    .gte("slot_start", now.toISOString());

  const slots = generateSlots({
    now,
    busy,
    heldStarts: (held ?? []).map((h) => (h as { slot_start: string }).slot_start),
    hours: parseHours(process.env.MEETING_HOURS ?? "11:00-19:00"),
    days: parseDays(process.env.MEETING_DAYS ?? "1,2,3,4,5,6"),
    leadHours: Number(process.env.MEETING_LEAD_HOURS ?? 12),
    horizonDays,
  });

  const payload = {
    ok: true,
    days: groupByIstDay(slots).map((g) => ({
      key: g.day,
      label: formatIstDay(g.slots[0].start),
      slots: g.slots.map((s) => ({
        start: s.start,
        end: s.end,
        label: formatIstTime(s.start),
      })),
    })),
  };

  cache = { at: Date.now(), payload };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
