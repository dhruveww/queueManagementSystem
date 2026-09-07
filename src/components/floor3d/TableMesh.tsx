"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { TABLE_STATUS_COLOR, type RestaurantTable, type TableStatus } from "@/lib/types";
import { EditorControls } from "./EditorControls";
import { TABLE_HEIGHT, clamp, halfExtents, snap } from "./geometry";
import { TableLabel } from "./TableLabel";
import type { FitState } from "./types";
import { useFloorDrag } from "./useTableDrag";

export interface TableMeshProps {
  table: RestaurantTable;
  status: TableStatus;
  selected: boolean;
  editable: boolean;
  showLabel: boolean;
  fitState: FitState;
  mergeState: "none" | "eligible" | "selected";
  onSelect: () => void;
  onCommit: (patch: Partial<Pick<RestaurantTable, "pos_x" | "pos_z" | "rot_y" | "width" | "depth">>) => void;
  onDraggingChange: (dragging: boolean) => void;
  invalidate: () => void;
}

const EPS = 0.001;

export function TableMesh({
  table,
  status,
  selected,
  editable,
  showLabel,
  fitState,
  mergeState,
  onSelect,
  onCommit,
  onDraggingChange,
  invalidate,
}: TableMeshProps) {
  const [posOverride, setPosOverride] = useState<{ x: number; z: number } | null>(null);
  const [rotOverride, setRotOverride] = useState<number | null>(null);
  const [dimOverride, setDimOverride] = useState<{ width: number; depth: number } | null>(null);

  // Once the authoritative prop catches up with what we optimistically
  // rendered (realtime echo of our own onTableUpsert), drop the override.
  useEffect(() => setPosOverride(null), [table.pos_x, table.pos_z]);
  useEffect(() => setRotOverride(null), [table.rot_y]);
  useEffect(() => setDimOverride(null), [table.width, table.depth]);

  const x = posOverride?.x ?? table.pos_x;
  const z = posOverride?.z ?? table.pos_z;
  const rotY = rotOverride ?? table.rot_y;
  const width = dimOverride?.width ?? table.width;
  const depth = dimOverride?.depth ?? table.depth;

  const dragOrigin = useMemo(() => ({ x: table.pos_x, z: table.pos_z }), [table.pos_x, table.pos_z]);

  const drag = useFloorDrag({
    enabled: editable,
    onStart: onSelect,
    onMove: (dx, dz) => {
      onDraggingChange(true);
      setPosOverride({ x: snap(dragOrigin.x + dx), z: snap(dragOrigin.z + dz) });
    },
    onEnd: (moved) => {
      onDraggingChange(false);
      if (moved) {
        const nx = posOverride?.x ?? table.pos_x;
        const nz = posOverride?.z ?? table.pos_z;
        if (Math.abs(nx - table.pos_x) > EPS || Math.abs(nz - table.pos_z) > EPS) {
          onCommit({ pos_x: nx, pos_z: nz });
        }
      }
    },
    invalidate,
  });

  const { hw, hd } = halfExtents(table.shape, width, depth);

  const geometry = useMemo(() => {
    if (table.shape === "round") return new THREE.CylinderGeometry(width / 2, width / 2, TABLE_HEIGHT, 24);
    if (table.shape === "booth") return new THREE.BoxGeometry(width, TABLE_HEIGHT * 0.85, depth);
    return new THREE.BoxGeometry(width, TABLE_HEIGHT, depth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.shape, width, depth]);

  const ringGeometry = useMemo(() => {
    const r = Math.max(hw, hd) + 0.22;
    return new THREE.RingGeometry(r, r + 0.06, 32);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw, hd]);

  const baseColor = TABLE_STATUS_COLOR[status];
  let color = baseColor;
  let opacity = 1;
  let emissive = "#000000";
  let emissiveIntensity = 0;

  if (fitState === "fit") {
    emissive = "#22c55e";
    emissiveIntensity = 0.55;
  } else if (fitState === "unfit") {
    opacity = 0.32;
  }

  if (mergeState === "selected") {
    emissive = "#06b6d4";
    emissiveIntensity = 0.6;
  } else if (mergeState === "eligible") {
    emissive = "#67e8f9";
    emissiveIntensity = 0.25;
  }

  const ringColor = mergeState === "selected" ? "#06b6d4" : "#fbbf24";

  const cursor = fitState === "unfit" ? "not-allowed" : editable ? "grab" : "pointer";

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!editable) onSelect();
  };

  return (
    <group>
      <group
        position={[x, 0, z]}
        rotation={[0, rotY, 0]}
        onClick={handleClick}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = cursor;
        }}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = "auto";
        }}
      >
        <mesh geometry={geometry} position={[0, TABLE_HEIGHT / 2, 0]}>
          <meshStandardMaterial
            color={color}
            transparent={opacity < 1}
            opacity={opacity}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            roughness={0.55}
          />
        </mesh>

        {table.shape === "booth" && (
          <mesh position={[0, TABLE_HEIGHT * 0.68, -hd]}>
            <boxGeometry args={[width, TABLE_HEIGHT * 1.3, 0.1]} />
            <meshStandardMaterial color={color} opacity={opacity} transparent={opacity < 1} roughness={0.6} />
          </mesh>
        )}

        {selected && (
          <mesh geometry={ringGeometry} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <meshBasicMaterial color={ringColor} side={THREE.DoubleSide} transparent opacity={0.9} />
          </mesh>
        )}
      </group>

      {showLabel && <TableLabel x={x} z={z} label={table.label} capacity={table.capacity} dim={fitState === "unfit"} />}

      {editable && selected && (
        <EditorControls
          shape={table.shape}
          x={x}
          z={z}
          rotY={rotY}
          width={width}
          depth={depth}
          onRotatePreview={(r) => setRotOverride(r)}
          onRotateCommit={(r) => {
            if (Math.abs(r - table.rot_y) > EPS) onCommit({ rot_y: r });
          }}
          onResizePreview={(d) => setDimOverride(d)}
          onResizeCommit={(d) => {
            const w = clamp(d.width, 0.4, 4);
            const dep = clamp(d.depth, 0.4, 4);
            if (Math.abs(w - table.width) > EPS || Math.abs(dep - table.depth) > EPS) {
              onCommit({ width: w, depth: dep });
            }
          }}
          onDraggingChange={onDraggingChange}
          invalidate={invalidate}
        />
      )}
    </group>
  );
}
