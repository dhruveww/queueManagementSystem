"use client";

import { AlertTriangle, Trash2, Ungroup, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  TABLE_STATUS_COLOR,
  TABLE_STATUS_LABEL,
  type RestaurantTable,
  type TableGroup,
  type TableShape,
  type TableStatus,
  type Zone,
} from "@/lib/types";
import { cn } from "./utils";

const SHAPES: TableShape[] = ["round", "square", "rect", "booth"];
const STATUSES: TableStatus[] = ["free", "occupied", "clearing", "reserved", "blocked"];

interface TablePanelProps {
  table?: RestaurantTable;
  group?: TableGroup;
  members?: RestaurantTable[];
  zones: Zone[];
  allTables: RestaurantTable[];
  canEdit: boolean;
  busy: boolean;
  onStatusChange: (status: TableStatus) => void;
  onUpdate: (patch: Partial<RestaurantTable>) => void;
  onDelete: () => void;
  onUnmerge: () => void;
  onClose: () => void;
}

/** Detail + editor panel for whatever is currently selected in the scene. */
export function TablePanel({ table, group, members, zones, allTables, canEdit, busy, onStatusChange, onUpdate, onDelete, onUnmerge, onClose }: TablePanelProps) {
  const [label, setLabel] = useState(table?.label ?? "");
  const [capacity, setCapacity] = useState(String(table?.capacity ?? group?.capacity ?? ""));
  const [labelError, setLabelError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLabel(table?.label ?? "");
    setCapacity(String(table?.capacity ?? group?.capacity ?? ""));
    setLabelError(null);
    setConfirmDelete(false);
  }, [table?.id, group?.id, table?.label, table?.capacity, group?.capacity]);

  const status = table?.status ?? group?.status;
  const capacityValue = table?.capacity ?? group?.capacity ?? 0;
  const title = table?.label ?? group?.label ?? "";

  const commitLabel = () => {
    if (!table) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setLabelError("Label can't be empty");
      return;
    }
    const clash = allTables.some((t) => t.id !== table.id && t.label.toLowerCase() === trimmed.toLowerCase());
    if (clash) {
      setLabelError("Another table already uses this label");
      return;
    }
    setLabelError(null);
    if (trimmed !== table.label) onUpdate({ label: trimmed });
  };

  const commitCapacity = () => {
    if (!table) return;
    const n = Math.max(1, Math.round(Number(capacity) || table.capacity));
    setCapacity(String(n));
    if (n !== table.capacity) onUpdate({ capacity: n });
  };

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 w-80 rounded-xl bg-slate-900/95 text-slate-100 shadow-2xl ring-1 ring-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
          <X size={16} />
        </button>
      </div>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-3">
        {group && members && (
          <p className="text-xs text-slate-400">
            Merged: {members.map((m) => m.label).join(" + ")}
          </p>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Status</p>
          <div className="grid grid-cols-2 gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!canEdit || busy}
                onClick={() => onStatusChange(s)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  status === s ? "ring-white/40 bg-slate-700" : "ring-white/10 bg-slate-800/60 hover:bg-slate-800"
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: TABLE_STATUS_COLOR[s] }} />
                {TABLE_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {!canEdit && <p className="mt-1 text-[11px] text-slate-500">Seat a guest to change status automatically.</p>}
        </div>

        {!canEdit && (
          <div className="rounded-md bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
            Seats {capacityValue}
            {table && <> · {table.shape}</>}
          </div>
        )}

        {canEdit && table && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Label</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                className="w-full rounded-md border border-white/10 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
              {labelError && <p className="mt-1 text-[11px] text-red-400">{labelError}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Capacity</label>
                <input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  onBlur={commitCapacity}
                  onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                  className="w-full rounded-md border border-white/10 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Shape</label>
                <select
                  value={table.shape}
                  onChange={(e) => onUpdate({ shape: e.target.value as TableShape })}
                  className="w-full rounded-md border border-white/10 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
                >
                  {SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Zone</label>
              <select
                value={table.zone_id}
                onChange={(e) => onUpdate({ zone_id: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[11px] text-slate-500">Drag the table to move it, use the cyan handle to rotate and the amber handle(s) to resize.</p>
          </>
        )}

        {canEdit && (
          <div className="flex gap-2 border-t border-white/10 pt-3">
            {group ? (
              <button
                type="button"
                disabled={busy}
                onClick={onUnmerge}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 ring-1 ring-white/10 hover:bg-slate-700 disabled:opacity-50"
              >
                <Ungroup size={14} /> Un-merge
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium ring-1 transition-colors disabled:opacity-50",
                  confirmDelete
                    ? "bg-red-600 text-white ring-red-500 hover:bg-red-500"
                    : "bg-slate-800 text-slate-200 ring-white/10 hover:bg-slate-700"
                )}
              >
                {confirmDelete ? <AlertTriangle size={14} /> : <Trash2 size={14} />}
                {confirmDelete ? "Confirm delete?" : "Delete table"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
