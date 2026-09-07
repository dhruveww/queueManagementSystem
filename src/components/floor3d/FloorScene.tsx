"use client";

import { ContactShadows } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { forwardRef, useCallback, useMemo, useState } from "react";
import type { RestaurantTable, TableGroup, Zone } from "@/lib/types";
import { CameraRig } from "./CameraRig";
import { fitsCapacity } from "./geometry";
import { GroupHull } from "./GroupHull";
import { Room, type FloorBounds } from "./Room";
import { Seats } from "./Seats";
import { TableMesh } from "./TableMesh";
import type { CameraApi, FitState, Selection } from "./types";

interface FloorSceneProps {
  tables: RestaurantTable[];
  groups: TableGroup[];
  zones: Zone[];
  zoneHeat: Record<string, number>;
  heatmapOn: boolean;
  canEdit: boolean;
  editMode: boolean;
  selection: Selection;
  mergeMode: boolean;
  mergeSelectionIds: string[];
  armedPartySize: number | null;
  onSelectTable: (table: RestaurantTable) => void;
  onSelectGroup: (group: TableGroup) => void;
  onDeselect: () => void;
  onCommitTable: (tableId: string, patch: Partial<Pick<RestaurantTable, "pos_x" | "pos_z" | "rot_y" | "width" | "depth">>) => void;
}

function computeBounds(tables: RestaurantTable[]): FloorBounds {
  if (tables.length === 0) return { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const t of tables) {
    const half = Math.max(t.width, t.depth) / 2 + 1;
    minX = Math.min(minX, t.pos_x - half);
    maxX = Math.max(maxX, t.pos_x + half);
    minZ = Math.min(minZ, t.pos_z - half);
    maxZ = Math.max(maxZ, t.pos_z + half);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Everything inside the <Canvas> for exactly one floor. */
export const FloorScene = forwardRef<CameraApi, FloorSceneProps>(function FloorScene(
  {
    tables,
    groups,
    zones,
    zoneHeat,
    heatmapOn,
    canEdit,
    editMode,
    selection,
    mergeMode,
    mergeSelectionIds,
    armedPartySize,
    onSelectTable,
    onSelectGroup,
    onDeselect,
    onCommitTable,
  },
  cameraRef
) {
  const [dragging, setDragging] = useState(false);
  const invalidate = useThree((s) => s.invalidate);
  const bounds = useMemo(() => computeBounds(tables), [tables]);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const membersByGroup = useMemo(() => {
    const map = new Map<string, RestaurantTable[]>();
    for (const t of tables) {
      if (!t.merged_group_id) continue;
      const list = map.get(t.merged_group_id) ?? [];
      list.push(t);
      map.set(t.merged_group_id, list);
    }
    return map;
  }, [tables]);

  const standalone = useMemo(() => tables.filter((t) => !t.merged_group_id), [tables]);

  const fitStateFor = useCallback(
    (status: string, capacity: number): FitState => {
      if (armedPartySize == null) return "neutral";
      if (status !== "free") return "unfit";
      return fitsCapacity(capacity, armedPartySize) ? "fit" : "unfit";
    },
    [armedPartySize]
  );

  const handleDraggingChange = useCallback((d: boolean) => setDragging(d), []);

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 9, 4]} intensity={0.9} castShadow={false} />
      <directionalLight position={[-6, 6, -4]} intensity={0.25} />

      <CameraRig ref={cameraRef} bounds={bounds} enabled={!dragging} invalidate={invalidate} />

      <Room
        bounds={bounds}
        zones={zones}
        tables={tables}
        zoneHeat={zoneHeat}
        heatmapOn={heatmapOn}
        showGrid={dragging}
        onBackgroundClick={onDeselect}
      />

      <Seats tables={tables} />

      {standalone.map((table) => {
        const isSelected = selection?.kind === "table" && selection.id === table.id;
        const mergeState: "none" | "eligible" | "selected" = mergeMode
          ? mergeSelectionIds.includes(table.id)
            ? "selected"
            : table.status === "free"
              ? "eligible"
              : "none"
          : "none";
        return (
          <TableMesh
            key={table.id}
            table={table}
            status={table.status}
            selected={isSelected}
            editable={canEdit && editMode && !mergeMode && armedPartySize == null && isSelected}
            showLabel
            fitState={mergeMode ? "neutral" : fitStateFor(table.status, table.capacity)}
            mergeState={mergeState}
            onSelect={() => onSelectTable(table)}
            onCommit={(patch) => onCommitTable(table.id, patch)}
            onDraggingChange={handleDraggingChange}
            invalidate={invalidate}
          />
        );
      })}

      {Array.from(membersByGroup.entries()).map(([groupId, members]) => {
        const group = groupsById.get(groupId);
        if (!group) return null;
        const isSelected = selection?.kind === "group" && selection.id === groupId;
        return (
          <group key={groupId}>
            {members.map((table) => (
              <TableMesh
                key={table.id}
                table={table}
                status={group.status}
                selected={false}
                editable={false}
                showLabel={false}
                fitState="neutral"
                mergeState="none"
                onSelect={() => onSelectGroup(group)}
                onCommit={() => {}}
                onDraggingChange={handleDraggingChange}
                invalidate={invalidate}
              />
            ))}
            <GroupHull
              group={group}
              members={members}
              selected={isSelected}
              fitState={mergeMode ? "neutral" : fitStateFor(group.status, group.capacity)}
              onSelect={() => onSelectGroup(group)}
            />
          </group>
        );
      })}

      <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) + 10} blur={2.2} far={2} resolution={256} frames={1} />
    </>
  );
});
