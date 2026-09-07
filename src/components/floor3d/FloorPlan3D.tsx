"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Floor,
  QueueEntry,
  RestaurantTable,
  TableGroup,
  TableStatus,
  Zone,
} from "@/lib/types";
import { FloorScene } from "./FloorScene";
import { defaultDims, fitsCapacity, nextTableLabel } from "./geometry";
import { HeatmapOverlay } from "./HeatmapOverlay";
import { SeatingPanel } from "./SeatingPanel";
import { TablePanel } from "./TablePanel";
import { Toolbar } from "./Toolbar";
import type { CameraApi, NewTableDraft, Selection } from "./types";

export interface FloorPlan3DProps {
  floors: Floor[];
  zones: Zone[];
  tables: RestaurantTable[];
  groups: TableGroup[];
  /** Open queue entries (waiting/notified/checked_in), already sorted by position. */
  waiting: QueueEntry[];
  /** Normalised 0..1 turnover rate per zone id — drives the heatmap wash. */
  zoneHeat?: Record<string, number>;
  /** Manager/owner get the editor; hosts get view + seat only. */
  canEdit: boolean;

  onSeat: (entryId: string, target: { tableId?: string; groupId?: string }) => Promise<void>;
  onStatusChange: (tableId: string, status: TableStatus) => Promise<void>;
  onTableUpsert: (table: Partial<RestaurantTable> & { id?: string }) => Promise<void>;
  onTableDelete: (tableId: string) => Promise<void>;
  onMerge: (tableIds: string[], label?: string) => Promise<void>;
  onUnmerge: (groupId: string) => Promise<void>;
}

/**
 * The flagship 3D floor-plan. Pure presentation + interaction — every byte
 * of data comes in as props, every mutation goes out through a callback.
 * No Supabase, no fetching: the parent owns realtime and just re-renders
 * this with fresh props, which is exactly what re-colours tables live.
 */
export function FloorPlan3D({
  floors,
  zones,
  tables,
  groups,
  waiting,
  zoneHeat,
  canEdit,
  onSeat,
  onStatusChange,
  onTableUpsert,
  onTableDelete,
  onMerge,
  onUnmerge,
}: FloorPlan3DProps) {
  const sortedFloors = useMemo(() => [...floors].sort((a, b) => a.level - b.level), [floors]);

  const [activeFloorId, setActiveFloorId] = useState<string>(() => sortedFloors[0]?.id ?? "");
  const [editMode, setEditMode] = useState(false);
  const [heatmapOn, setHeatmapOn] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeLabel, setMergeLabel] = useState("");
  const [armedEntryId, setArmedEntryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cameraApiRef = useRef<CameraApi>(null);
  const pendingLabelRef = useRef<string | null>(null);
  const prevTablesRef = useRef<RestaurantTable[]>(tables);

  // Keep the active floor valid as `floors` streams in / changes.
  useEffect(() => {
    if (sortedFloors.length === 0) return;
    if (!sortedFloors.some((f) => f.id === activeFloorId)) setActiveFloorId(sortedFloors[0].id);
  }, [sortedFloors, activeFloorId]);

  // Hosts never get the editor, regardless of local toggles.
  useEffect(() => {
    if (!canEdit && (editMode || mergeMode)) {
      setEditMode(false);
      setMergeMode(false);
      setMergeSelection([]);
    }
  }, [canEdit, editMode, mergeMode]);

  const activeFloor = sortedFloors.find((f) => f.id === activeFloorId);
  const floorTables = useMemo(() => tables.filter((t) => t.floor_id === activeFloorId), [tables, activeFloorId]);
  const floorGroups = useMemo(() => groups.filter((g) => g.floor_id === activeFloorId), [groups, activeFloorId]);
  const floorZones = useMemo(() => zones.filter((z) => z.floor_id === activeFloorId), [zones, activeFloorId]);

  const selectedTable = selection?.kind === "table" ? floorTables.find((t) => t.id === selection.id) : undefined;
  const selectedGroup = selection?.kind === "group" ? floorGroups.find((g) => g.id === selection.id) : undefined;
  const selectedGroupMembers = selectedGroup
    ? floorTables.filter((t) => t.merged_group_id === selectedGroup.id)
    : undefined;
  const armedEntry = armedEntryId ? waiting.find((w) => w.id === armedEntryId) : undefined;
  const armedPartySize = armedEntry?.party_size ?? null;

  // If the selected row disappears (deleted / unmerged / seated elsewhere), drop the panel.
  useEffect(() => {
    if (selection?.kind === "table" && !selectedTable) setSelection(null);
    if (selection?.kind === "group" && !selectedGroup) setSelection(null);
  }, [selection, selectedTable, selectedGroup]);

  // If the armed guest gets seated/removed from another device, disarm quietly.
  useEffect(() => {
    if (armedEntryId && !armedEntry) setArmedEntryId(null);
  }, [armedEntryId, armedEntry]);

  // Auto-select a freshly-added table once its realtime echo lands in `tables`.
  useEffect(() => {
    const prevIds = new Set(prevTablesRef.current.map((t) => t.id));
    if (pendingLabelRef.current) {
      const created = tables.find(
        (t) => !prevIds.has(t.id) && t.label === pendingLabelRef.current && t.floor_id === activeFloorId
      );
      if (created) {
        setSelection({ kind: "table", id: created.id });
        pendingLabelRef.current = null;
      }
    }
    prevTablesRef.current = tables;
  }, [tables, activeFloorId]);

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const handleFloorChange = useCallback((id: string) => {
    setActiveFloorId(id);
    setSelection(null);
    setMergeMode(false);
    setMergeSelection([]);
  }, []);

  const armSeating = useCallback((entryId: string) => {
    setArmedEntryId((prev) => (prev === entryId ? null : entryId));
    setSelection(null);
    setMergeMode(false);
    setMergeSelection([]);
  }, []);

  const cancelSeating = useCallback(() => setArmedEntryId(null), []);

  const handleSelectTable = useCallback(
    (table: RestaurantTable) => {
      if (mergeMode) {
        if (table.status !== "free" || table.merged_group_id) return;
        setMergeSelection((prev) => (prev.includes(table.id) ? prev.filter((id) => id !== table.id) : [...prev, table.id]));
        return;
      }
      if (armedEntryId) {
        if (!armedEntry) return;
        if (table.status === "free" && fitsCapacity(table.capacity, armedEntry.party_size)) {
          withBusy(() => onSeat(armedEntryId, { tableId: table.id })).then(() => setArmedEntryId(null));
        }
        return;
      }
      setSelection({ kind: "table", id: table.id });
    },
    [mergeMode, armedEntryId, armedEntry, onSeat, withBusy]
  );

  const handleSelectGroup = useCallback(
    (group: TableGroup) => {
      if (mergeMode) return;
      if (armedEntryId) {
        if (!armedEntry) return;
        if (group.status === "free" && fitsCapacity(group.capacity, armedEntry.party_size)) {
          withBusy(() => onSeat(armedEntryId, { groupId: group.id })).then(() => setArmedEntryId(null));
        }
        return;
      }
      setSelection({ kind: "group", id: group.id });
    },
    [mergeMode, armedEntryId, armedEntry, onSeat, withBusy]
  );

  const handleDeselect = useCallback(() => setSelection(null), []);

  const handleCommitTable = useCallback(
    (tableId: string, patch: Partial<Pick<RestaurantTable, "pos_x" | "pos_z" | "rot_y" | "width" | "depth">>) => {
      onTableUpsert({ id: tableId, ...patch });
    },
    [onTableUpsert]
  );

  const handleStatusChange = useCallback(
    (status: TableStatus) => {
      const id = selectedTable?.id ?? selectedGroup?.id;
      if (!id) return;
      withBusy(() => onStatusChange(id, status));
    },
    [selectedTable, selectedGroup, onStatusChange, withBusy]
  );

  const handleUpdateSelected = useCallback(
    (patch: Partial<RestaurantTable>) => {
      if (!selectedTable) return;
      withBusy(() => onTableUpsert({ id: selectedTable.id, ...patch }));
    },
    [selectedTable, onTableUpsert, withBusy]
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selectedTable) return;
    withBusy(() => onTableDelete(selectedTable.id)).then(() => setSelection(null));
  }, [selectedTable, onTableDelete, withBusy]);

  const handleUnmergeSelected = useCallback(() => {
    if (!selectedGroup) return;
    withBusy(() => onUnmerge(selectedGroup.id)).then(() => setSelection(null));
  }, [selectedGroup, onUnmerge, withBusy]);

  const toggleEditMode = useCallback(() => {
    setEditMode((v) => !v);
    setSelection(null);
    setMergeMode(false);
    setMergeSelection([]);
  }, []);

  const toggleMergeMode = useCallback(() => {
    setMergeMode((v) => !v);
    setMergeSelection([]);
    setMergeLabel("");
    setSelection(null);
    setArmedEntryId(null);
  }, []);

  const confirmMerge = useCallback(() => {
    if (mergeSelection.length < 2) return;
    withBusy(() => onMerge(mergeSelection, mergeLabel.trim() || undefined)).then(() => {
      setMergeMode(false);
      setMergeSelection([]);
      setMergeLabel("");
    });
  }, [mergeSelection, mergeLabel, onMerge, withBusy]);

  const cancelMerge = useCallback(() => {
    setMergeMode(false);
    setMergeSelection([]);
    setMergeLabel("");
  }, []);

  const handleAddTable = useCallback(
    (draft: NewTableDraft) => {
      const label = nextTableLabel(tables);
      const { width, depth } = defaultDims(draft.shape, draft.capacity);
      const idx = floorTables.length;
      const cols = 4;
      const spacing = Math.max(width, depth) + 0.5;
      const pos_x = (idx % cols) * spacing - ((cols - 1) * spacing) / 2;
      const pos_z = Math.floor(idx / cols) * spacing;
      pendingLabelRef.current = label;
      withBusy(() =>
        onTableUpsert({
          outlet_id: activeFloor?.outlet_id,
          floor_id: activeFloorId,
          zone_id: draft.zoneId,
          label,
          shape: draft.shape,
          capacity: draft.capacity,
          pos_x,
          pos_z,
          rot_y: 0,
          width,
          depth,
          status: "free",
          sort_index: floorTables.length,
        })
      );
    },
    [tables, floorTables, activeFloor, activeFloorId, onTableUpsert, withBusy]
  );

  const resetView = useCallback(() => cameraApiRef.current?.resetView(), []);
  const topDown = useCallback(() => cameraApiRef.current?.topDown(), []);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-950 text-slate-100">
      <Toolbar
        floors={sortedFloors}
        activeFloorId={activeFloorId}
        onFloorChange={handleFloorChange}
        canEdit={canEdit}
        editMode={editMode}
        onToggleEditMode={toggleEditMode}
        heatmapOn={heatmapOn}
        onToggleHeatmap={() => setHeatmapOn((v) => !v)}
        mergeMode={mergeMode}
        mergeCount={mergeSelection.length}
        mergeLabel={mergeLabel}
        onMergeLabelChange={setMergeLabel}
        onToggleMergeMode={toggleMergeMode}
        onConfirmMerge={confirmMerge}
        onCancelMerge={cancelMerge}
        zones={floorZones}
        onAddTable={handleAddTable}
        onResetView={resetView}
        onTopDown={topDown}
        busy={busy}
      />

      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {activeFloor ? (
            <Canvas dpr={[1, 2]} frameloop="demand" gl={{ antialias: true }} camera={{ fov: 50, near: 0.1, far: 200 }}>
              <Suspense fallback={null}>
                <FloorScene
                  key={activeFloorId}
                  ref={cameraApiRef}
                  tables={floorTables}
                  groups={floorGroups}
                  zones={floorZones}
                  zoneHeat={zoneHeat ?? {}}
                  heatmapOn={heatmapOn}
                  canEdit={canEdit}
                  editMode={editMode}
                  selection={selection}
                  mergeMode={mergeMode}
                  mergeSelectionIds={mergeSelection}
                  armedPartySize={armedPartySize}
                  onSelectTable={handleSelectTable}
                  onSelectGroup={handleSelectGroup}
                  onDeselect={handleDeselect}
                  onCommitTable={handleCommitTable}
                />
              </Suspense>
            </Canvas>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">No floors configured yet.</div>
          )}

          {heatmapOn && <HeatmapOverlay zones={floorZones} zoneHeat={zoneHeat ?? {}} />}

          {(selectedTable || selectedGroup) && (
            <TablePanel
              table={selectedTable}
              group={selectedGroup}
              members={selectedGroupMembers}
              zones={floorZones}
              allTables={tables}
              canEdit={canEdit}
              busy={busy}
              onStatusChange={handleStatusChange}
              onUpdate={handleUpdateSelected}
              onDelete={handleDeleteSelected}
              onUnmerge={handleUnmergeSelected}
              onClose={() => setSelection(null)}
            />
          )}
        </div>

        <SeatingPanel waiting={waiting} armedEntryId={armedEntryId} onArm={armSeating} onCancel={cancelSeating} />
      </div>
    </div>
  );
}
