"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell, LabelList,
} from "recharts";
import {
  Users, Clock, Table2, TrendingUp, TrendingDown, Minus, Download,
  CheckCircle2, AlertTriangle, Lock, LayoutGrid,
} from "lucide-react";
import { SERIES, INK, STATUS, SURFACE_RAISED, seqColor, ORDINAL_BLUE } from "@/lib/analytics/palette";
import type {
  LiveSnapshot, Summary, HeatCell, AbandonBucket, ZonePerf,
  NotifPerf, HostPerf, AccuracyPoint, OutletRollup,
} from "@/lib/analytics/queries";
import type { AnalyticsDaily } from "@/lib/types";
import { cn } from "@/lib/cn";

interface Props {
  rangeKey: string;
  groupWide: boolean;
  hasMultipleOutlets: boolean;
  outletName: string;
  isPro: boolean;
  snapshot: LiveSnapshot;
  summary: Summary;
  prevSummary: Summary;
  daily: AnalyticsDaily[];
  hourly: { hour: number; label: string; joined: number; seated: number; avgWait: number }[];
  heatmap: HeatCell[];
  abandon: AbandonBucket[];
  zones: ZonePerf[];
  notif: NotifPerf;
  hosts: HostPerf[];
  accuracy: { overall: { method: string; errorMin: number; n: number }[]; series: AccuracyPoint[] };
  rollup: OutletRollup[];
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AnalyticsView(p: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [showTables, setShowTables] = useState(false);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.push(`/dashboard/analytics?${next}`);
  }

  const funnel = useMemo(() => {
    const sum = (k: keyof AnalyticsDaily) => p.daily.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const joined = sum("joined");
    const stages = [
      { stage: "Joined", value: joined },
      { stage: "Notified", value: sum("notified") },
      { stage: "Checked in", value: sum("checked_in") },
      { stage: "Seated", value: sum("seated") },
    ];
    return stages.map((s, i) => ({
      ...s,
      pct: joined ? Math.round((s.value / joined) * 100) : 0,
      stepPct: i === 0 || !stages[i - 1].value
        ? 100
        : Math.round((s.value / stages[i - 1].value) * 100),
      fill: ORDINAL_BLUE[i],
    }));
  }, [p.daily]);

  const trend = useMemo(
    () => p.daily.map((r) => ({
      day: r.day.slice(5),
      joined: r.joined,
      seated: r.seated,
      abandoned: r.no_show + r.left_queue,
      avgWait: r.avg_wait_min ? Math.round(r.avg_wait_min) : null,
      returning: r.returning_guests,
      neu: r.new_guests,
    })),
    [p.daily],
  );

  const dowTotals = useMemo(() => {
    const acc = new Map<number, number>();
    for (const c of p.heatmap) acc.set(c.dow, (acc.get(c.dow) ?? 0) + c.joined);
    return acc;
  }, [p.heatmap]);

  const peakHours = useMemo(() => {
    const hours = [...new Set(p.heatmap.map((c) => c.hour))].sort((a, b) => a - b);
    const max = Math.max(...p.heatmap.map((c) => c.joined), 1);
    return { hours, max };
  }, [p.heatmap]);

  return (
    <div className="space-y-8 p-4 pb-16">
      {/* -------------------------------------------------- filters (one row) */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold text-white">Analytics</h1>

        <div className="flex rounded-lg border border-ink-800 p-0.5" role="group" aria-label="Date range">
          {[["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"]].map(([key, label]) => (
            <button
              key={key} onClick={() => setParam("range", key)}
              aria-pressed={p.rangeKey === key}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition",
                p.rangeKey === key ? "bg-ink-800 text-white" : "text-ink-400 hover:text-ink-200")}
            >
              {label}
            </button>
          ))}
        </div>

        {p.hasMultipleOutlets && (
          <div className="flex rounded-lg border border-ink-800 p-0.5" role="group" aria-label="Scope">
            <button
              onClick={() => setParam("scope", "outlet")} aria-pressed={!p.groupWide}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition",
                !p.groupWide ? "bg-ink-800 text-white" : "text-ink-400 hover:text-ink-200")}
            >
              {p.outletName}
            </button>
            <button
              onClick={() => setParam("scope", "group")} aria-pressed={p.groupWide}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition",
                p.groupWide ? "bg-ink-800 text-white" : "text-ink-400 hover:text-ink-200")}
            >
              All outlets
            </button>
          </div>
        )}

        <button
          onClick={() => setShowTables((v) => !v)}
          aria-pressed={showTables}
          className={cn("flex items-center gap-1.5 rounded-lg border border-ink-800 px-3 py-1.5 text-sm font-medium transition",
            showTables ? "bg-ink-800 text-white" : "text-ink-400 hover:text-ink-200")}
        >
          <LayoutGrid className="size-4" aria-hidden /> Table view
        </button>

        <div className="ml-auto flex gap-2">
          <a
            href={`/api/export/csv?range=${p.rangeKey}&scope=${p.groupWide ? "group" : "outlet"}`}
            className="flex items-center gap-1.5 rounded-lg border border-ink-800 px-3 py-1.5 text-sm font-medium text-ink-300 hover:bg-ink-800"
          >
            <Download className="size-4" aria-hidden /> CSV
          </a>
          <a
            href={`/api/export/report?range=${p.rangeKey}&scope=${p.groupWide ? "group" : "outlet"}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-ink-800 px-3 py-1.5 text-sm font-medium text-ink-300 hover:bg-ink-800"
          >
            <Download className="size-4" aria-hidden /> PDF
          </a>
        </div>
      </div>

      {/* ------------------------------------------------------ live snapshot */}
      <Section title="Right now" subtitle={`Live at ${p.outletName}`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Waiting" value={p.snapshot.waiting} icon={<Users className="size-4" aria-hidden />} />
          <Tile label="Notified" value={p.snapshot.notified} />
          <Tile label="Avg wait now" value={p.snapshot.avgCurrentWaitMin} unit="min"
                icon={<Clock className="size-4" aria-hidden />} />
          <Tile label="Longest wait" value={p.snapshot.longestWaitMin} unit="min"
                tone={p.snapshot.longestWaitMin > 45 ? "critical" : undefined} />
          <Tile label="Tables free" value={`${p.snapshot.tablesFree}/${p.snapshot.tablesTotal}`}
                icon={<Table2 className="size-4" aria-hidden />} />
          <Tile label="Floor in use" value={p.snapshot.utilisationPct} unit="%" />
        </div>
      </Section>

      {/* --------------------------------------------- this period vs last */}
      <Section title="This period vs last" subtitle={`Last ${p.rangeKey.replace("d", " days")}, compared with the period before`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Delta label="Guests joined" now={p.summary.joined} prev={p.prevSummary.joined} higherIsBetter />
          <Delta label="Seated" now={p.summary.seated} prev={p.prevSummary.seated} higherIsBetter />
          <Delta label="Abandon rate" now={p.summary.abandonRatePct} prev={p.prevSummary.abandonRatePct} unit="%" />
          <Delta label="Avg wait" now={p.summary.avgWaitMin} prev={p.prevSummary.avgWaitMin} unit="min" />
          <Delta label="Avg table turn" now={p.summary.avgTurnMin} prev={p.prevSummary.avgTurnMin} unit="min" />
          <Delta label="Returning guests" now={p.summary.returningPct} prev={p.prevSummary.returningPct} unit="%" higherIsBetter />
        </div>
      </Section>

      {/* -------------------------------------------------------------- funnel */}
      <Section
        title="Queue funnel"
        subtitle="Where guests drop out between scanning the QR and sitting down"
      >
        <Panel>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={INK.grid} />
              <XAxis type="number" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 12 }} />
              <YAxis
                type="category" dataKey="stage" width={90}
                stroke={INK.axis} tick={{ fill: INK.secondary, fontSize: 12 }}
              />
              <Tooltip
                {...tooltipProps}
                formatter={tipFmt<{ pct: number }>((v, d) =>
                  [`${v} guests · ${d?.pct ?? 0}% of joined`, "Reached"])}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={26} isAnimationActive={false}>
                {funnel.map((d) => <Cell key={d.stage} fill={d.fill} stroke={SURFACE_RAISED} strokeWidth={2} />)}
                <LabelList
                  dataKey="pct" position="right"
                  formatter={labelFmt((v) => `${v}%`)}
                  style={{ fill: INK.secondary, fontSize: 12, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-ink-500">
            Step-to-step conversion:{" "}
            {funnel.slice(1).map((f) => `${f.stage} ${f.stepPct}%`).join(" · ")}
          </p>
        </Panel>
      </Section>

      {/* ---------------------------------------------- abandonment by wait */}
      <Section
        title="Where you lose guests"
        subtitle="Share of guests who left or no-showed, by how long they'd actually waited"
      >
        <Panel>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={p.abandon} margin={{ left: 0, right: 8, top: 16, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke={INK.grid} />
              <XAxis dataKey="bucket" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 12 }} />
              <YAxis
                stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 12 }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                {...tooltipProps}
                formatter={tipFmt<AbandonBucket>((v, d) =>
                  [`${v}% (${d?.abandoned ?? 0} of ${d?.total ?? 0})`, "Abandoned"])}
              />
              <Bar dataKey="ratePct" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {p.abandon.map((d) => (
                  <Cell
                    key={d.bucket}
                    fill={d.ratePct >= 30 ? STATUS.critical : d.ratePct >= 15 ? STATUS.serious : SERIES[0]}
                    stroke={SURFACE_RAISED} strokeWidth={2}
                  />
                ))}
                <LabelList
                  dataKey="ratePct" position="top"
                  formatter={labelFmt((v) => (v ? `${v}%` : ""))}
                  style={{ fill: INK.secondary, fontSize: 11 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <Legendish items={[
            { color: SERIES[0], label: "Under 15% — healthy" },
            { color: STATUS.serious, label: "15–30% — watch", icon: <AlertTriangle className="size-3" aria-hidden /> },
            { color: STATUS.critical, label: "Over 30% — losing guests", icon: <AlertTriangle className="size-3" aria-hidden /> },
          ]} />
        </Panel>
      </Section>

      {/* ------------------------------------------- wait + volume by hour */}
      <Section title="By hour of day" subtitle="Two views of the same hours — volume, then how long those guests waited">
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Guests joining">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={p.hourly} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="joined" name="Joined" fill={SERIES[0]} radius={[4, 4, 0, 0]}
                     stroke={SURFACE_RAISED} strokeWidth={2} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Average wait">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={p.hourly} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} unit="m" />
                <Tooltip {...tooltipProps} formatter={tipFmt((v) => [`${v} min`, "Avg wait"])} />
                <Line
                  type="monotone" dataKey="avgWait" name="Avg wait"
                  stroke={SERIES[1]} strokeWidth={2}
                  dot={{ r: 4, fill: SERIES[1], stroke: SURFACE_RAISED, strokeWidth: 2 }}
                  activeDot={{ r: 6 }} isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </Section>

      {/* ------------------------------------------------------ peak heatmap */}
      <Section title="Peak windows" subtitle="Guests joining, by hour and day of week">
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-xs">
              <caption className="sr-only">Footfall heatmap by day of week and hour</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-10" />
                  {peakHours.hours.map((h) => (
                    <th key={h} scope="col" className="pb-1 font-medium text-ink-500 tnum">
                      {String(h).padStart(2, "0")}
                    </th>
                  ))}
                  <th scope="col" className="pl-2 text-right font-medium text-ink-500">Total</th>
                </tr>
              </thead>
              <tbody>
                {DOW.map((name, dow) => (
                  <tr key={name}>
                    <th scope="row" className="pr-2 text-right font-medium text-ink-400">{name}</th>
                    {peakHours.hours.map((h) => {
                      const cell = p.heatmap.find((c) => c.dow === dow && c.hour === h);
                      const v = cell?.joined ?? 0;
                      return (
                        <td key={h}>
                          <div
                            className="flex h-7 items-center justify-center rounded text-[10px] font-semibold tnum"
                            style={{
                              background: seqColor(v / peakHours.max),
                              color: v / peakHours.max > 0.55 ? "#0b1220" : INK.muted,
                            }}
                            title={`${name} ${String(h).padStart(2, "0")}:00 — ${v} guests, avg wait ${cell?.avgWait ?? 0} min`}
                          >
                            {v || ""}
                          </div>
                        </td>
                      );
                    })}
                    <td className="pl-2 text-right font-semibold text-ink-300 tnum">
                      {dowTotals.get(dow) ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Darker means quieter, brighter means busier. Hover any cell for the average wait in that hour.
          </p>
        </Panel>
      </Section>

      {/* ------------------------------------------------------------ trends */}
      <Section title="Daily trend" subtitle="Joined vs seated, day by day">
        <Panel>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke={INK.grid} />
              <XAxis dataKey="day" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
              <Tooltip {...tooltipProps} />
              <Legend {...legendProps} />
              <Line type="monotone" dataKey="joined" name="Joined" stroke={SERIES[0]} strokeWidth={2}
                    dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="seated" name="Seated" stroke={SERIES[2]} strokeWidth={2}
                    dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="abandoned" name="Left / no-show" stroke={SERIES[1]} strokeWidth={2}
                    dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </Section>

      {/* ------------------------------------------------- estimate accuracy */}
      <Section
        title="Are your wait estimates trustworthy?"
        subtitle="Average gap between the time quoted at join and the time actually waited"
      >
        <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
          <Panel>
            <div className="space-y-3">
              {p.accuracy.overall.length === 0 && (
                <p className="text-sm text-ink-500">Not enough seated guests yet in this range.</p>
              )}
              {p.accuracy.overall.map((m) => (
                <div key={m.method} className="rounded-lg bg-ink-950 p-3">
                  <p className="text-xs uppercase tracking-wider text-ink-500">
                    {m.method === "live_availability" ? "Pro · live availability" : "Basic · rolling average"}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">
                    ±{m.errorMin} <span className="text-base font-normal text-ink-400">min</span>
                  </p>
                  <p className="text-xs text-ink-500 tnum">across {m.n} seated guests</p>
                </div>
              ))}
              <p className="text-xs text-ink-500">
                Lower is better. Tracking both methods separately is how you prove
                whether the Pro estimate is genuinely more accurate — with your own data,
                not a claim.
              </p>
            </div>
          </Panel>
          <Panel title="Estimate error over time">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={p.accuracy.series} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="day" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }}
                       tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" />
                <YAxis stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} unit="m" />
                <Tooltip {...tooltipProps} formatter={tipFmt((v) => [`±${v} min`, "Avg error"])} />
                <Line type="monotone" dataKey="errorMin" name="Avg error" stroke={SERIES[0]} strokeWidth={2}
                      dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </Section>

      {/* ------------------------------------------------- zone performance */}
      <Section
        title="Zone & floor performance"
        subtitle={p.isPro
          ? "Turns per table shows which section is actually working hardest"
          : "Live table geometry is a Pro feature"}
      >
        {p.isPro ? (
          <Panel>
            {p.zones.length === 0 ? (
              <Empty>No seatings recorded in this range yet.</Empty>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(200, p.zones.length * 44)}>
                  <BarChart data={p.zones} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke={INK.grid} />
                    <XAxis type="number" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
                    <YAxis type="category" dataKey="zoneName" width={120}
                           stroke={INK.axis} tick={{ fill: INK.secondary, fontSize: 12 }} />
                    <Tooltip
                      {...tooltipProps}
                      formatter={tipFmt<ZonePerf>((v, d) => [
                        `${v} turns/table · ${d?.seatings ?? 0} seatings · ${d?.avgTurnMin ?? 0} min avg turn`,
                        d?.floorName ?? "",
                      ])}
                    />
                    <Bar dataKey="turnsPerTable" name="Turns per table" fill={SERIES[0]}
                         radius={[0, 4, 4, 0]} barSize={22}
                         stroke={SURFACE_RAISED} strokeWidth={2} isAnimationActive={false}>
                      <LabelList dataKey="turnsPerTable" position="right"
                                 style={{ fill: INK.secondary, fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-ink-500">
                  The same numbers drive the heatmap overlay on the 3D floor view.
                </p>
              </>
            )}
          </Panel>
        ) : (
          <Panel>
            <div className="flex items-start gap-3 text-sm text-ink-400">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Per-zone and per-table depth needs live table geometry, which the Basic
                plan doesn't track. Everything else on this page works on both plans.
              </p>
            </div>
          </Panel>
        )}
      </Section>

      {/* ------------------------------------------ notification performance */}
      <Section title="WhatsApp performance" subtitle="Delivery, reads, and how fast a notified guest actually sits down">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="Messages sent" value={p.notif.sent} />
          <Tile label="Delivered" value={p.notif.deliveryRatePct} unit="%"
                tone={p.notif.deliveryRatePct < 90 && p.notif.sent > 0 ? "warning" : "good"} />
          <Tile label="Read" value={p.notif.readRatePct} unit="%" />
          <Tile label="Failed" value={p.notif.failed}
                tone={p.notif.failed > 0 ? "warning" : undefined} />
          <Tile label="Notify → seated" value={p.notif.avgNotifyToSeatMin} unit="min" />
        </div>
      </Section>

      {/* ------------------------------------------------- host performance */}
      {p.hosts.length > 0 && (
        <Section title="Host performance" subtitle="How quickly each host turns a 'table ready' into a seated guest">
          <Panel>
            <DataTable
              columns={["Host", "Seatings", "Avg time to seat"]}
              rows={p.hosts.map((h) => [h.name, String(h.seatings), `${h.avgTimeToSeatMin} min`])}
            />
            <p className="mt-2 text-xs text-ink-500">
              Team median:{" "}
              {median(p.hosts.map((h) => h.avgTimeToSeatMin).filter(Boolean))} min.
              Read this as coaching, not a leaderboard — a slow shift is usually a
              busy shift.
            </p>
          </Panel>
        </Section>
      )}

      {/* -------------------------------------------------- new vs returning */}
      <Section title="New vs returning guests" subtitle="Matched on phone number from your own queue data — no CRM needed">
        <Panel>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trend} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke={INK.grid} />
              <XAxis dataKey="day" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
              <Tooltip {...tooltipProps} />
              <Legend {...legendProps} />
              <Bar dataKey="neu" name="New" stackId="g" fill={SERIES[0]}
                   stroke={SURFACE_RAISED} strokeWidth={2} isAnimationActive={false} />
              <Bar dataKey="returning" name="Returning" stackId="g" fill={SERIES[2]}
                   radius={[4, 4, 0, 0]} stroke={SURFACE_RAISED} strokeWidth={2} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </Section>

      {/* ------------------------------------------------------ outlet rollup */}
      {p.rollup.length > 1 && (
        <Section title="Outlet comparison" subtitle="Every outlet in the group, same period">
          <Panel>
            <DataTable
              columns={["Outlet", "Joined", "Seated", "Abandon %", "Avg wait", "Avg turn"]}
              rows={p.rollup.map((r) => [
                r.name, String(r.joined), String(r.seated),
                `${r.abandonRatePct}%`, `${r.avgWaitMin} min`, `${r.avgTurnMin} min`,
              ])}
            />
          </Panel>
        </Section>
      )}

      {/* --------------------------------------------------------- table view */}
      {showTables && (
        <Section title="Underlying data" subtitle="Every chart above, as numbers">
          <Panel>
            <DataTable
              columns={["Day", "Joined", "Notified", "Seated", "No-show", "Left", "Avg wait", "Avg turn", "Est error"]}
              rows={p.daily.map((r) => [
                r.day, String(r.joined), String(r.notified), String(r.seated),
                String(r.no_show), String(r.left_queue),
                fmt(r.avg_wait_min, "min"), fmt(r.avg_turn_min, "min"), fmt(r.est_error_min, "min"),
              ])}
            />
          </Panel>
        </Section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ chrome
/**
 * Recharts' formatter signatures are deliberately loose (a value may be a
 * number, a string, or missing). These adapters narrow once, here, so every
 * chart below can be written against the shape its own data actually has.
 */
type TooltipFormatter = NonNullable<React.ComponentProps<typeof Tooltip>["formatter"]>;
type ListFormatter = NonNullable<React.ComponentProps<typeof LabelList>["formatter"]>;

function tipFmt<T>(fn: (value: number, payload: T) => [string, string]): TooltipFormatter {
  return ((value: unknown, _name: unknown, item: unknown) =>
    fn(Number(value ?? 0), (item as { payload: T } | undefined)?.payload as T)) as TooltipFormatter;
}

function labelFmt(fn: (value: number) => string): ListFormatter {
  return ((value: unknown) => fn(Number(value ?? 0))) as ListFormatter;
}

const tooltipProps = {
  contentStyle: {
    background: SURFACE_RAISED, border: `1px solid ${INK.axis}`,
    borderRadius: 10, color: INK.primary, fontSize: 12,
  },
  labelStyle: { color: INK.secondary },
  cursor: { fill: "rgba(255,255,255,0.04)" },
} as const;

const legendProps = {
  wrapperStyle: { fontSize: 12, color: INK.secondary },
  iconType: "plainline" as const,
  iconSize: 12,
};

function Section({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {subtitle && <p className="mb-3 mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      {children}
    </section>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900 p-4">
      {title && <p className="mb-2 text-sm font-medium text-ink-300">{title}</p>}
      {children}
    </div>
  );
}

function Tile({
  label, value, unit, icon, tone,
}: {
  label: string; value: number | string; unit?: string;
  icon?: React.ReactNode; tone?: keyof typeof STATUS;
}) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900 p-3">
      <p className="flex items-center gap-1.5 text-xs text-ink-500">{icon}{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-ink-400">{unit}</span>}
      </p>
      {tone && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium" style={{ color: STATUS[tone] }}>
          {tone === "good"
            ? <><CheckCircle2 className="size-3" aria-hidden /> healthy</>
            : <><AlertTriangle className="size-3" aria-hidden /> needs a look</>}
        </p>
      )}
    </div>
  );
}

function Delta({
  label, now, prev, unit, higherIsBetter = false,
}: { label: string; now: number; prev: number; unit?: string; higherIsBetter?: boolean }) {
  const diff = now - prev;
  const pct = prev ? Math.round((diff / prev) * 100) : null;
  const flat = Math.abs(diff) < 0.05;
  const good = higherIsBetter ? diff > 0 : diff < 0;

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900 p-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">
        {now}{unit && <span className="ml-1 text-sm font-normal text-ink-400">{unit}</span>}
      </p>
      <p
        className="mt-1 flex items-center gap-1 text-[11px] font-medium"
        style={{ color: flat ? INK.muted : good ? STATUS.good : STATUS.serious }}
      >
        {flat ? <Minus className="size-3" aria-hidden />
          : diff > 0 ? <TrendingUp className="size-3" aria-hidden />
          : <TrendingDown className="size-3" aria-hidden />}
        {flat ? "no change" : `${diff > 0 ? "+" : ""}${round1(diff)}${unit ?? ""}${pct !== null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}`}
      </p>
    </div>
  );
}

function Legendish({ items }: { items: { color: string; label: string; icon?: React.ReactNode }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.icon}{i.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-800 text-left">
            {columns.map((c) => (
              <th key={c} scope="col" className="py-2 pr-4 font-medium text-ink-400">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-ink-800/60 last:border-0">
              {r.map((cell, j) => (
                <td key={j} className={cn("py-2 pr-4", j === 0 ? "text-ink-200" : "text-ink-300 tnum")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-ink-500">{children}</p>;
}

function fmt(n: number | null, unit: string) { return n === null ? "—" : `${Math.round(n)} ${unit}`; }
function round1(n: number) { return Math.round(n * 10) / 10; }
function median(xs: number[]) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}
