import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getDailyRows, rangeForDays } from "@/lib/analytics/queries";

/** Daily metrics as CSV, for weekly/monthly ops reviews and board reporting. */
export const dynamic = "force-dynamic";

const PRESETS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  const params = req.nextUrl.searchParams;
  const range = rangeForDays(PRESETS[params.get("range") ?? "30d"] ?? 30);
  const groupWide = params.get("scope") === "group";

  const outlets = groupWide ? session.outlets : [session.outlet];
  const names = new Map(outlets.map((o) => [o.id, o.name]));
  const rows = await getDailyRows(outlets.map((o) => o.id), range);

  const header = [
    "outlet", "day", "joined", "notified", "checked_in", "seated", "no_show",
    "left_queue", "abandon_rate_pct", "avg_wait_min", "median_wait_min",
    "avg_turn_min", "estimate_error_min", "new_guests", "returning_guests",
  ];

  const body = rows.map((r) => {
    const abandon = r.joined ? ((r.no_show + r.left_queue) / r.joined) * 100 : 0;
    return [
      names.get(r.outlet_id) ?? r.outlet_id, r.day, r.joined, r.notified,
      r.checked_in, r.seated, r.no_show, r.left_queue, abandon.toFixed(1),
      fmt(r.avg_wait_min), fmt(r.median_wait_min), fmt(r.avg_turn_min),
      fmt(r.est_error_min), r.new_guests, r.returning_guests,
    ].map(csvCell).join(",");
  });

  const csv = [header.join(","), ...body].join("\n");
  const filename = `baari-${groupWide ? "group" : slug(session.outlet.name)}-${range.from}-to-${range.to}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function fmt(n: number | null) { return n === null ? "" : n.toFixed(1); }
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
