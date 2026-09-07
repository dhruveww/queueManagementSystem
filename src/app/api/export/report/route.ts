import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import {
  getDailyRows, summarise, rangeForDays, previousRange,
  abandonmentByWait, notificationPerformance,
} from "@/lib/analytics/queries";

/**
 * Print-ready report.
 *
 * Served as a self-contained HTML page that opens the browser's print dialog,
 * where "Save as PDF" produces the file. That keeps a headless-Chrome
 * dependency (and its cold-start cost on Vercel) out of the product for what is
 * a once-a-month action, and the output is identical.
 */
export const dynamic = "force-dynamic";

const PRESETS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  const params = req.nextUrl.searchParams;
  const range = rangeForDays(PRESETS[params.get("range") ?? "30d"] ?? 30);
  const prev = previousRange(range);
  const groupWide = params.get("scope") === "group";

  const outlets = groupWide ? session.outlets : [session.outlet];
  const ids = outlets.map((o) => o.id);

  const [rows, prevRows, abandon, notif] = await Promise.all([
    getDailyRows(ids, range),
    getDailyRows(ids, prev),
    abandonmentByWait(ids, range),
    notificationPerformance(ids, range),
  ]);

  const now = summarise(rows);
  const before = summarise(prevRows);
  const title = groupWide ? "All outlets" : session.outlet.name;

  return new NextResponse(html({ title, range, now, before, abandon, notif, rows }), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function html(d: {
  title: string;
  range: { from: string; to: string };
  now: ReturnType<typeof summarise>;
  before: ReturnType<typeof summarise>;
  abandon: Awaited<ReturnType<typeof abandonmentByWait>>;
  notif: Awaited<ReturnType<typeof notificationPerformance>>;
  rows: Awaited<ReturnType<typeof getDailyRows>>;
}) {
  const delta = (a: number, b: number, unit = "") => {
    const diff = Math.round((a - b) * 10) / 10;
    if (!diff) return `<span class="flat">no change</span>`;
    return `<span class="${diff > 0 ? "up" : "down"}">${diff > 0 ? "+" : ""}${diff}${unit}</span>`;
  };

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Baari report — ${esc(d.title)}</title>
<style>
  @page { margin: 16mm; }
  body { font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #191d26; margin: 0; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 28px 0 8px; }
  .muted { color: #66748c; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; }
  .tile { border: 1px solid #d5d9e2; border-radius: 10px; padding: 10px 12px; }
  .tile .k { font-size: 11px; color: #66748c; }
  .tile .v { font-size: 22px; font-weight: 700; }
  .tile .d { font-size: 11px; }
  .up { color: #0ca30c; } .down { color: #d03b3b; } .flat { color: #898781; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eceef2; }
  th { color: #66748c; font-weight: 600; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  footer { margin-top: 28px; font-size: 11px; color: #8592a7; }
  @media print { body { padding: 0; } .noprint { display: none; } }
</style></head>
<body onload="window.print()">
  <button class="noprint" onclick="window.print()"
    style="float:right;padding:8px 14px;border-radius:8px;border:1px solid #d5d9e2;background:#fff;cursor:pointer">
    Print / Save as PDF
  </button>

  <h1>${esc(d.title)}</h1>
  <p class="muted">Baari queue report · ${d.range.from} to ${d.range.to}</p>

  <h2>Summary</h2>
  <div class="grid">
    <div class="tile"><div class="k">Guests joined</div><div class="v">${d.now.joined}</div>
      <div class="d">${delta(d.now.joined, d.before.joined)} vs previous</div></div>
    <div class="tile"><div class="k">Seated</div><div class="v">${d.now.seated}</div>
      <div class="d">${delta(d.now.seated, d.before.seated)} vs previous</div></div>
    <div class="tile"><div class="k">Abandon rate</div><div class="v">${d.now.abandonRatePct}%</div>
      <div class="d">${delta(d.now.abandonRatePct, d.before.abandonRatePct, "pp")} vs previous</div></div>
    <div class="tile"><div class="k">Avg wait</div><div class="v">${d.now.avgWaitMin} min</div>
      <div class="d">${delta(d.now.avgWaitMin, d.before.avgWaitMin, " min")} vs previous</div></div>
    <div class="tile"><div class="k">Median wait</div><div class="v">${d.now.medianWaitMin} min</div></div>
    <div class="tile"><div class="k">Avg table turn</div><div class="v">${d.now.avgTurnMin} min</div></div>
    <div class="tile"><div class="k">Estimate error</div><div class="v">±${d.now.estErrorMin} min</div></div>
    <div class="tile"><div class="k">Returning guests</div><div class="v">${d.now.returningPct}%</div></div>
  </div>

  <h2>Where guests are lost</h2>
  <table><thead><tr><th>Waited</th><th class="n">Guests</th><th class="n">Abandoned</th><th class="n">Rate</th></tr></thead>
  <tbody>${d.abandon.map((b) => `<tr><td>${b.bucket}</td><td class="n">${b.total}</td><td class="n">${b.abandoned}</td><td class="n">${b.ratePct}%</td></tr>`).join("")}</tbody></table>

  <h2>WhatsApp delivery</h2>
  <table><tbody>
    <tr><td>Messages sent</td><td class="n">${d.notif.sent}</td></tr>
    <tr><td>Delivered</td><td class="n">${d.notif.deliveryRatePct}%</td></tr>
    <tr><td>Read</td><td class="n">${d.notif.readRatePct}%</td></tr>
    <tr><td>Failed</td><td class="n">${d.notif.failed}</td></tr>
    <tr><td>Average notify → seated</td><td class="n">${d.notif.avgNotifyToSeatMin} min</td></tr>
  </tbody></table>

  <h2>Daily detail</h2>
  <table><thead><tr>
    <th>Day</th><th class="n">Joined</th><th class="n">Seated</th><th class="n">No-show</th>
    <th class="n">Left</th><th class="n">Avg wait</th><th class="n">Avg turn</th>
  </tr></thead><tbody>
  ${d.rows.map((r) => `<tr><td>${r.day}</td><td class="n">${r.joined}</td><td class="n">${r.seated}</td><td class="n">${r.no_show}</td><td class="n">${r.left_queue}</td><td class="n">${r.avg_wait_min?.toFixed(0) ?? "—"}</td><td class="n">${r.avg_turn_min?.toFixed(0) ?? "—"}</td></tr>`).join("")}
  </tbody></table>

  <footer>Generated by Baari on ${new Date().toLocaleString("en-IN")}.</footer>
</body></html>`;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
