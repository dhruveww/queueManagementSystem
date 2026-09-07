"use client";

import { Check, ChevronsDown, Combine, Flame, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { TableShape, Zone } from "@/lib/types";
import type { Floor } from "@/lib/types";
import { FloorSwitcher } from "./FloorSwitcher";
import type { NewTableDraft } from "./types";
import { cn } from "./utils";

const SHAPES: TableShape[] = ["round", "square", "rect", "booth"];

interface ToolbarProps {
  floors: Floor[];
  activeFloorId: string;
  onFloorChange: (id: string) => void;
  canEdit: boolean;
  editMode: boolean;
  onToggleEditMode: () => void;
  heatmapOn: boolean;
  onToggleHeatmap: () => void;
  mergeMode: boolean;
  mergeCount: number;
  mergeLabel: string;
  onMergeLabelChange: (v: string) => void;
  onToggleMergeMode: () => void;
  onConfirmMerge: () => void;
  onCancelMerge: () => void;
  zones: Zone[];
  onAddTable: (draft: NewTableDraft) => void;
  onResetView: () => void;
  onTopDown: () => void;
  busy: boolean;
}

function ToolbarButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-sky-500 text-white ring-sky-400" : "bg-slate-800/80 text-slate-200 ring-white/10 hover:bg-slate-700"
      )}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  floors,
  activeFloorId,
  onFloorChange,
  canEdit,
  editMode,
  onToggleEditMode,
  heatmapOn,
  onToggleHeatmap,
  mergeMode,
  mergeCount,
  mergeLabel,
  onMergeLabelChange,
  onToggleMergeMode,
  onConfirmMerge,
  onCancelMerge,
  zones,
  onAddTable,
  onResetView,
  onTopDown,
  busy,
}: ToolbarProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [shape, setShape] = useState<TableShape>("round");
  const [capacity, setCapacity] = useState(4);
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");

  useEffect(() => {
    if (!zones.some((z) => z.id === zoneId)) setZoneId(zones[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones]);

  const submitAdd = () => {
    if (!zoneId) return;
    onAddTable({ shape, capacity, zoneId });
    setAddOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-slate-950/80 px-3 py-2">
      <FloorSwitcher floors={floors} activeFloorId={activeFloorId} onChange={onFloorChange} />

      <div className="mx-1 h-6 w-px bg-white/10" />

      <ToolbarButton onClick={onResetView} disabled={busy}>
        <RotateCcw size={14} /> Reset view
      </ToolbarButton>
      <ToolbarButton onClick={onTopDown} disabled={busy}>
        <ChevronsDown size={14} /> Top-down
      </ToolbarButton>

      <ToolbarButton active={heatmapOn} onClick={onToggleHeatmap}>
        <Flame size={14} /> Heatmap
      </ToolbarButton>

      {canEdit && (
        <>
          <div className="mx-1 h-6 w-px bg-white/10" />

          <ToolbarButton active={editMode} onClick={onToggleEditMode} disabled={busy}>
            <Pencil size={14} /> {editMode ? "Editing" : "Edit layout"}
          </ToolbarButton>

          {editMode && !mergeMode && (
            <ToolbarButton onClick={onToggleMergeMode} disabled={busy}>
              <Combine size={14} /> Merge tables
            </ToolbarButton>
          )}

          {editMode && (
            <div className="relative">
              <ToolbarButton onClick={() => setAddOpen((v) => !v)} disabled={busy}>
                <Plus size={14} /> Add table
              </ToolbarButton>
              {addOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-64 space-y-2 rounded-lg bg-slate-900 p-3 text-slate-100 shadow-2xl ring-1 ring-white/10">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Shape</label>
                    <select
                      value={shape}
                      onChange={(e) => setShape(e.target.value as TableShape)}
                      className="w-full rounded-md border border-white/10 bg-slate-800 px-2.5 py-1.5 text-sm"
                    >
                      {SHAPES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Capacity</label>
                    <input
                      type="number"
                      min={1}
                      value={capacity}
                      onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full rounded-md border border-white/10 bg-slate-800 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Zone</label>
                    <select
                      value={zoneId}
                      onChange={(e) => setZoneId(e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-slate-800 px-2.5 py-1.5 text-sm"
                    >
                      {zones.length === 0 && <option value="">No zones on this floor</option>}
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setAddOpen(false)} className="rounded-md px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitAdd}
                      disabled={!zoneId}
                      className="rounded-md bg-sky-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-400 disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mergeMode && (
        <div className="flex flex-1 items-center gap-2 rounded-md bg-cyan-500/10 px-3 py-1.5 ring-1 ring-cyan-500/30">
          <span className="text-xs font-medium text-cyan-200">{mergeCount} selected — tap free tables to merge</span>
          <input
            value={mergeLabel}
            onChange={(e) => onMergeLabelChange(e.target.value)}
            placeholder="Label (optional)"
            className="w-36 rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-400"
          />
          <button
            type="button"
            onClick={onConfirmMerge}
            disabled={mergeCount < 2 || busy}
            className="flex items-center gap-1 rounded-md bg-cyan-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Check size={13} /> Merge
          </button>
          <button type="button" onClick={onCancelMerge} className="flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700">
            <X size={13} /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}
