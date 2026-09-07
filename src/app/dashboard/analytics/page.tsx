import { requireStaff } from "@/lib/auth";
import {
  getLiveSnapshot, getDailyRows, summarise, rangeForDays, previousRange,
  peakHeatmap, waitByHour, abandonmentByWait, zonePerformance,
  notificationPerformance, hostPerformance, estimateAccuracy, outletRollup,
} from "@/lib/analytics/queries";
import { AnalyticsView } from "./AnalyticsView";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const PRESETS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export default async function AnalyticsPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; scope?: string }> }) {
  const session = await requireStaff();
  const { range: rangeKey = "30d", scope } = await searchParams;

  const days = PRESETS[rangeKey] ?? 30;
  const range = rangeForDays(days);
  const prev = previousRange(range);

  // Group-wide view rolls up every outlet the user can see; the default is the
  // outlet they're currently working.
  const groupWide = scope === "group" && session.outlets.length > 1;
  const outletIds = groupWide ? session.outlets.map((o) => o.id) : [session.outlet.id];

  const [
    snapshot, rows, prevRows, abandon, zones, notif, hosts, accuracy, rollup,
  ] = await Promise.all([
    getLiveSnapshot(session.outlet.id),
    getDailyRows(outletIds, range),
    getDailyRows(outletIds, prev),
    abandonmentByWait(outletIds, range),
    session.isPro ? zonePerformance(session.outlet.id, range) : Promise.resolve([]),
    notificationPerformance(outletIds, range),
    hostPerformance(session.outlet.id, range),
    estimateAccuracy(outletIds, range),
    session.outlets.length > 1
      ? outletRollup(session.outlets.map((o) => ({ id: o.id, name: o.name })), range)
      : Promise.resolve([]),
  ]);

  return (
    <AnalyticsView
      rangeKey={rangeKey}
      groupWide={groupWide}
      hasMultipleOutlets={session.outlets.length > 1}
      outletName={session.outlet.name}
      isPro={session.isPro}
      snapshot={snapshot}
      summary={summarise(rows)}
      prevSummary={summarise(prevRows)}
      daily={rows}
      hourly={waitByHour(rows)}
      heatmap={peakHeatmap(rows)}
      abandon={abandon}
      zones={zones}
      notif={notif}
      hosts={hosts}
      accuracy={accuracy}
      rollup={rollup}
    />
  );
}
