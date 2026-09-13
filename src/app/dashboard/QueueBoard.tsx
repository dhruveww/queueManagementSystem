"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Bell, Check, UserX, Phone, Star, Plus, X, AlertTriangle, Wifi, WifiOff, Clock,
} from "lucide-react";
import { useOutletRealtime } from "@/hooks/useOutletRealtime";
import { useElapsedMinutes, formatElapsed } from "@/hooks/useElapsed";
import { overallPosition, estimateWait, unitsFromTables, positionInLine, formatWait, type TurnStats } from "@/lib/domain/waitTime";
import { displayPhone } from "@/lib/domain/phone";
import {
  notifyGuestAction, seatGuestAction, closeEntryAction,
  setPriorityAction, nudgeGuestAction, setTableStatusAction, addWalkInAction,
} from "./actions";
import {
  OPEN_QUEUE_STATUSES, QUEUE_STATUS_LABEL, TABLE_STATUS_COLOR, TABLE_STATUS_LABEL,
  type Floor, type QueueEntry, type RestaurantTable, type TableGroup,
  type TableStatus, type WaitMethod, type Zone,
} from "@/lib/types";
import { cn } from "@/lib/cn";

interface Props {
  outletId: string;
  outletName: string;
  gracePeriodMin: number;
  method: WaitMethod;
  turnStats: TurnStats;
  floors: Floor[];
  zones: Zone[];
  initial: { entries: QueueEntry[]; tables: RestaurantTable[]; groups: TableGroup[] };
  occupiedSince: Record<string, string>;
}

export function QueueBoard(props: Props) {
  const { entries, tables, groups, connected } = useOutletRealtime(props.outletId, props.initial);
  const [seating, setSeating] = useState<QueueEntry | null>(null);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);

  const open = useMemo(
    () => entries
      .filter((e) => OPEN_QUEUE_STATUSES.includes(e.status))
      .sort((a, b) => b.priority - a.priority || a.joined_at.localeCompare(b.joined_at)),
    [entries],
  );
  const closed = useMemo(
    () => entries.filter((e) => !OPEN_QUEUE_STATUSES.includes(e.status)).slice(-25).reverse(),
    [entries],
  );

  const zoneById = useMemo(() => new Map(props.zones.map((z) => [z.id, z])), [props.zones]);
  const units = useMemo(
    () => unitsFromTables(tables, groups, props.zones, props.occupiedSince),
    [tables, groups, props.zones, props.occupiedSince],
  );

  // Counted over seatable units: a merged group is one table to give away, not
  // one per member.
  const occupancy = useMemo(() => {
    const statuses = [
      ...tables.filter((t) => !t.merged_group_id).map((t) => t.status),
      ...groups.map((g) => g.status),
    ];
    const count = (s: TableStatus) => statuses.filter((x) => x === s).length;
    return {
      total: statuses.length,
      free: count("free"),
      occupied: count("occupied"),
      clearing: count("clearing"),
      reserved: count("reserved"),
    };
  }, [tables, groups]);

  function flash(text: string, bad = false) {
    setToast({ text, bad });
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
      {/* ------------------------------------------------------- the line */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-white">The line</h1>
          <span className="rounded-full bg-ink-800 px-2.5 py-0.5 text-sm font-semibold text-ink-200 tnum">
            {open.length} waiting
          </span>
          <span
            className={cn("flex items-center gap-1.5 text-xs",
              connected ? "text-status-free" : "text-status-clearing")}
            title={connected ? "Live — updates from every device" : "Reconnecting…"}
          >
            {connected ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
            {connected ? "Live" : "Reconnecting"}
          </span>
          <button
            onClick={() => setShowWalkIn(true)}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-saffron-500 px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus className="size-4" aria-hidden /> Add walk-in
          </button>
        </div>

        {seating && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-saffron-500/40 bg-saffron-500/10 p-3">
            <span className="text-sm text-saffron-200">
              Seating <strong>{seating.guest_name}</strong> (party of {seating.party_size}) —
              pick a table below.
            </span>
            <button onClick={() => setSeating(null)} className="ml-auto text-ink-400 hover:text-white">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {open.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-800 p-10 text-center text-ink-500">
            Nobody is waiting. The line is clear.
          </div>
        ) : (
          <ul className="space-y-2">
            {open.map((entry) => (
              <QueueRow
                key={entry.id}
                entry={entry}
                position={overallPosition(entry, open)}
                liveWait={formatWait(
                  ...(() => {
                    const est = estimateWait({
                      partySize: entry.party_size,
                      position: positionInLine(entry, open),
                      units, turnStats: props.turnStats, method: props.method,
                      zonePref: entry.zone_pref,
                    });
                    return [est.lowMin, est.highMin] as const;
                  })(),
                )}
                zoneName={entry.zone_pref ?? null}
                gracePeriodMin={props.gracePeriodMin}
                selected={seating?.id === entry.id}
                onSeatStart={() => setSeating(entry)}
                onFlash={flash}
              />
            ))}
          </ul>
        )}

        {closed.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-ink-400">
              Earlier today ({closed.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {closed.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-lg bg-ink-900 px-3 py-2 text-sm text-ink-400">
                  <span className="font-mono text-xs text-ink-500">{e.ticket_code}</span>
                  <span className="text-ink-300">{e.guest_name}</span>
                  <span className="tnum">·{e.party_size}</span>
                  <span className="ml-auto">{QUEUE_STATUS_LABEL[e.status]}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ------------------------------------------------------- tables */}
      <aside>
        <div className="mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-white">Tables</h2>
            <span className="ml-auto text-sm text-ink-400 tnum">
              {occupancy.occupied}/{occupancy.total} in use
            </span>
          </div>

          {/* A single bar reads faster than three numbers when the host is
              deciding whether to keep quoting waits. */}
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-ink-800">
            <div
              className="bg-status-occupied"
              style={{ width: `${pct(occupancy.occupied, occupancy.total)}%` }}
            />
            <div
              className="bg-status-clearing"
              style={{ width: `${pct(occupancy.clearing, occupancy.total)}%` }}
            />
          </div>

          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            <Key color="var(--color-status-free)" label={`${occupancy.free} free`} />
            <Key color="var(--color-status-occupied)" label={`${occupancy.occupied} occupied`} />
            {occupancy.clearing > 0 && (
              <Key color="var(--color-status-clearing)" label={`${occupancy.clearing} being cleared`} />
            )}
            {occupancy.reserved > 0 && (
              <Key color="var(--color-status-reserved)" label={`${occupancy.reserved} reserved`} />
            )}
          </div>
        </div>

        <TableList
          tables={tables}
          groups={groups}
          floors={props.floors}
          zoneById={zoneById}
          occupiedSince={props.occupiedSince}
          seating={seating}
          onSeat={async (target) => {
            if (!seating) return;
            const res = await seatGuestAction(seating.id, target);
            if (res.ok) { flash(`${seating.guest_name} seated`); setSeating(null); }
            else flash(res.error, true);
          }}
          onFlash={flash}
        />
      </aside>

      {showWalkIn && (
        <WalkInDialog
          outletId={props.outletId}
          onClose={() => setShowWalkIn(false)}
          onFlash={flash}
        />
      )}

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-medium shadow-xl",
            toast.bad ? "bg-red-600 text-white" : "bg-white text-ink-900",
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- queue row
function QueueRow({
  entry, position, liveWait, zoneName, gracePeriodMin, selected, onSeatStart, onFlash,
}: {
  entry: QueueEntry;
  position: number;
  liveWait: string;
  zoneName: string | null;
  gracePeriodMin: number;
  selected: boolean;
  onSeatStart: () => void;
  onFlash: (t: string, bad?: boolean) => void;
}) {
  const waited = useElapsedMinutes(entry.joined_at);
  const [pending, start] = useTransition();

  const graceLeft = entry.grace_expires_at
    ? Math.ceil((new Date(entry.grace_expires_at).getTime() - Date.now()) / 60_000)
    : null;
  const graceExpired = graceLeft !== null && graceLeft <= 0;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    start(async () => {
      const res = await fn();
      onFlash(res.ok ? okMsg : (res.error ?? "Failed"), !res.ok);
    });
  }

  return (
    <li
      className={cn(
        "rounded-xl border p-3 transition",
        selected ? "border-saffron-500 bg-saffron-500/10" : "border-ink-800 bg-ink-900",
        entry.status === "notified" && !graceExpired && "border-status-reserved/50",
        graceExpired && "border-status-clearing/70 bg-status-clearing/5",
        pending && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-sm font-bold text-ink-200 tnum">
          {position}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {entry.priority > 0 && <Star className="size-3.5 fill-saffron-400 text-saffron-400" aria-label="Priority" />}
            <span className="truncate font-semibold text-white">{entry.guest_name}</span>
            <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ink-400">
              {entry.ticket_code}
            </span>
            <span className="text-sm text-ink-300 tnum">party of {entry.party_size}</span>
            {zoneName && (
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-xs capitalize text-ink-400">
                {zoneName}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
            <span className="flex items-center gap-1 tnum">
              <Clock className="size-3" aria-hidden /> waited {formatElapsed(waited)}
            </span>
            <span className="tnum">quoted {liveWait}</span>
            {entry.notes && <span className="italic text-saffron-300">“{entry.notes}”</span>}
            {entry.notify_failed && (
              <a
                href={entry.phone_e164 ? `tel:${entry.phone_e164}` : undefined}
                className="flex items-center gap-1 rounded bg-status-clearing/20 px-1.5 py-0.5 font-medium text-status-clearing"
              >
                <AlertTriangle className="size-3" aria-hidden />
                WhatsApp failed — call {displayPhone(entry.phone_e164)}
              </a>
            )}
            {entry.status === "notified" && graceLeft !== null && (
              <span className={cn("rounded px-1.5 py-0.5 font-medium tnum",
                graceExpired ? "bg-status-clearing/20 text-status-clearing" : "bg-status-reserved/20 text-status-reserved")}>
                {graceExpired ? "grace expired" : `${graceLeft}m to check in`}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          {entry.status === "waiting" && (
            <>
              <Action
                icon={<Bell className="size-4" aria-hidden />} label="Notify"
                onClick={() => run(() => notifyGuestAction(entry.id), `Told ${entry.guest_name} their table is ready`)}
                title={`WhatsApp "table ready" with a ${gracePeriodMin} min check-in window`}
              />
              <Action
                icon={<Phone className="size-4" aria-hidden />} label="Nudge"
                onClick={() => run(() => nudgeGuestAction(entry.id), "Position update sent")}
                title="Send a 'you're getting close' update"
              />
            </>
          )}
          {entry.status === "notified" && (
            <Action
              icon={<Bell className="size-4" aria-hidden />} label="Re-send"
              onClick={() => run(() => notifyGuestAction(entry.id), "Reminder sent")}
            />
          )}
          <Action
            icon={<Check className="size-4" aria-hidden />} label="Seat"
            variant="primary" onClick={onSeatStart}
            title="Pick a table on the right"
          />
          <Action
            icon={<Star className="size-4" aria-hidden />} label=""
            onClick={() => run(() => setPriorityAction(entry.id, entry.priority > 0 ? 0 : 10),
              entry.priority > 0 ? "Priority removed" : "Bumped to priority")}
            title="Toggle VIP / reservation priority"
          />
          <Action
            icon={<UserX className="size-4" aria-hidden />} label=""
            variant="danger"
            onClick={() => run(() => closeEntryAction(entry.id, "no_show"), `${entry.guest_name} marked no-show`)}
            title="Mark no-show"
          />
        </div>
      </div>
    </li>
  );
}

function Action({
  icon, label, onClick, variant = "ghost", title,
}: {
  icon: React.ReactNode; label: string; onClick: () => void;
  variant?: "ghost" | "primary" | "danger"; title?: string;
}) {
  return (
    <button
      onClick={onClick} title={title} aria-label={title ?? label}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
        variant === "primary" && "bg-status-free/90 text-white hover:bg-status-free",
        variant === "danger" && "bg-ink-800 text-ink-400 hover:bg-red-600 hover:text-white",
        variant === "ghost" && "bg-ink-800 text-ink-200 hover:bg-ink-700",
      )}
    >
      {icon}
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

// -------------------------------------------------------------- table list
function TableList({
  tables, groups, floors, zoneById, occupiedSince, seating, onSeat, onFlash,
}: {
  tables: RestaurantTable[];
  groups: TableGroup[];
  floors: Floor[];
  zoneById: Map<string, Zone>;
  occupiedSince: Record<string, string>;
  seating: QueueEntry | null;
  onSeat: (target: { tableId?: string; groupId?: string }) => Promise<void>;
  onFlash: (t: string, bad?: boolean) => void;
}) {
  // Host desks usually work one floor at a time; on a multi-floor outlet the
  // full list is too long to scan mid-service.
  const [floorFilter, setFloorFilter] = useState<string>("all");

  const byFloor = floors
    .filter((f) => floorFilter === "all" || f.id === floorFilter)
    .map((f) => ({
      floor: f,
      tables: tables.filter((t) => t.floor_id === f.id && !t.merged_group_id),
      groups: groups.filter((g) => g.floor_id === f.id),
    }));

  return (
    <div className="space-y-4">
      {floors.length > 1 && (
        <select
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
          aria-label="Filter tables by floor"
          className="w-full rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-ink-200 outline-none focus:border-saffron-500"
        >
          <option value="all">All floors</option>
          {floors.map((f) => {
            const free = countFree(f.id, tables, groups);
            return (
              <option key={f.id} value={f.id}>
                {f.name} — {free.free} of {free.total} free
              </option>
            );
          })}
        </select>
      )}

      {byFloor.map(({ floor, tables: ts, groups: gs }) => (
        <div key={floor.id}>
          {floors.length > 1 && (
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
              {floor.name}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
            {gs.map((g) => (
              <TableCard
                key={g.id} label={g.label} capacity={g.capacity} status={g.status}
                zone={null} merged
                occupiedSince={occupiedSince[g.id]}
                fits={!seating || g.capacity >= seating.party_size}
                arming={!!seating}
                onSeat={() => onSeat({ groupId: g.id })}
                onStatus={async (s) => {
                  const t = tables.find((x) => x.merged_group_id === g.id);
                  if (!t) return;
                  const res = await setTableStatusAction(t.id, s);
                  if (!res.ok) onFlash(res.error, true);
                }}
              />
            ))}
            {ts.map((t) => (
              <TableCard
                key={t.id} label={t.label} capacity={t.capacity} status={t.status}
                zone={zoneById.get(t.zone_id)?.name ?? null}
                occupiedSince={occupiedSince[t.id]}
                fits={!seating || t.capacity >= seating.party_size}
                arming={!!seating}
                onSeat={() => onSeat({ tableId: t.id })}
                onStatus={async (s) => {
                  const res = await setTableStatusAction(t.id, s);
                  if (!res.ok) onFlash(res.error, true);
                }}
              />
            ))}
          </div>
        </div>
      ))}
      {tables.length === 0 && (
        <p className="rounded-xl border border-dashed border-ink-800 p-6 text-center text-sm text-ink-500">
          No tables set up yet. A manager can add them in Settings.
        </p>
      )}
    </div>
  );
}

/** Free vs total seatable units on a floor — merged groups count once. */
function countFree(
  floorId: string | null,
  tables: RestaurantTable[],
  groups: TableGroup[],
): { free: number; total: number; occupied: number } {
  const loose = tables.filter(
    (t) => !t.merged_group_id && (floorId === null || t.floor_id === floorId),
  );
  const merged = groups.filter((g) => floorId === null || g.floor_id === floorId);
  const units = [...loose.map((t) => t.status), ...merged.map((g) => g.status)];
  return {
    total: units.length,
    free: units.filter((s) => s === "free").length,
    occupied: units.filter((s) => s === "occupied").length,
  };
}

function TableCard({
  label, capacity, status, zone, merged, occupiedSince, fits, arming, onSeat, onStatus,
}: {
  label: string; capacity: number; status: TableStatus; zone: string | null;
  merged?: boolean; occupiedSince?: string; fits: boolean; arming: boolean;
  onSeat: () => void; onStatus: (s: TableStatus) => void;
}) {
  const sat = useElapsedMinutes(occupiedSince);
  const seatable = arming && fits && status !== "blocked" && status !== "occupied";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition",
        // The status is carried by a full-width bar, a tinted surface and a
        // word — not a 10px dot. A host reads this across a counter, at a
        // glance, while holding a menu.
        "border-ink-800 bg-ink-900",
        status === "occupied" && "border-status-occupied/40 bg-status-occupied/10",
        status === "free" && "border-status-free/30 bg-status-free/5",
        status === "clearing" && "border-status-clearing/40 bg-status-clearing/10",
        status === "reserved" && "border-status-reserved/40 bg-status-reserved/10",
        arming && !fits && "opacity-30",
        seatable && "cursor-pointer ring-2 ring-status-free/60 hover:bg-status-free/15",
      )}
      onClick={seatable ? onSeat : undefined}
      role={seatable ? "button" : undefined}
      tabIndex={seatable ? 0 : undefined}
      onKeyDown={seatable ? (e) => e.key === "Enter" && onSeat() : undefined}
    >
      <div className="h-1 w-full" style={{ background: TABLE_STATUS_COLOR[status] }} aria-hidden />

      <div className="p-2.5">
        <div className="flex items-baseline gap-2">
          {/* A merged label like "T4+T5" is the whole point of the card — never
              truncate it to fit a badge. */}
          <span className="text-base font-bold leading-tight text-white">{label}</span>
          <span className="ml-auto shrink-0 text-xs text-ink-400 tnum">seats {capacity}</span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {merged && (
            <span className="rounded bg-saffron-500/20 px-1 text-[10px] font-bold uppercase text-saffron-400">
              merged
            </span>
          )}
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
            style={{
              color: TABLE_STATUS_COLOR[status],
              background: `${TABLE_STATUS_COLOR[status]}22`,
            }}
          >
            {TABLE_STATUS_LABEL[status]}
          </span>
          {status === "occupied" && occupiedSince && (
            <span
              className={cn("text-[11px] font-medium tnum",
                sat >= 90 ? "text-status-clearing" : "text-ink-400")}
              title="How long this party has been seated"
            >
              {formatElapsed(sat)}
            </span>
          )}
          {zone && <span className="ml-auto truncate text-[11px] text-ink-500">{zone}</span>}
        </div>

      {!arming && (
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value as TableStatus)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Status for table ${label}`}
          className="mt-2 w-full rounded-md border border-ink-800 bg-ink-950 px-2 py-1 text-xs text-ink-300 outline-none focus:border-saffron-500"
        >
          {(Object.keys(TABLE_STATUS_LABEL) as TableStatus[]).map((s) => (
            <option key={s} value={s}>{TABLE_STATUS_LABEL[s]}</option>
          ))}
        </select>
      )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ walk-in form
function WalkInDialog({
  outletId, onClose, onFlash,
}: { outletId: string; onClose: () => void; onFlash: (t: string, bad?: boolean) => void }) {
  const [pending, start] = useTransition();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-ink-900 p-5 ring-1 ring-ink-800">
        <div className="mb-4 flex items-center">
          <h3 className="text-lg font-semibold text-white">Add a walk-in</h3>
          <button onClick={onClose} className="ml-auto text-ink-400 hover:text-white" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <form
          action={(fd) => start(async () => {
            fd.set("outletId", outletId);
            const res = await addWalkInAction(fd);
            if (res.ok) { onFlash("Added to the line"); onClose(); }
            else onFlash(res.error, true);
          })}
          className="space-y-3"
        >
          <input name="name" required placeholder="Guest name" className={dark} />
          <input
            name="phone" type="tel" inputMode="numeric" placeholder="WhatsApp number (optional)"
            className={cn(dark, "tnum")}
          />
          <input
            name="partySize" type="number" min={1} max={30} defaultValue={2} required
            placeholder="Party size" className={cn(dark, "tnum")}
          />
          <input name="notes" placeholder="Notes (optional)" className={dark} />
          <p className="text-xs text-ink-500">
            Without a number we can't WhatsApp them — they'll show on the board flagged
            for a shout-out at the desk.
          </p>
          <button
            type="submit" disabled={pending}
            className="w-full rounded-xl bg-saffron-500 py-3 font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Adding…" : "Add to the line"}
          </button>
        </form>
      </div>
    </div>
  );
}

const dark =
  "w-full rounded-xl border border-ink-800 bg-ink-950 px-3 py-2.5 text-white outline-none focus:border-saffron-500";

function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

/** A colour swatch plus its count — status is never carried by colour alone. */
function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-400">
      <span className="size-2 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
