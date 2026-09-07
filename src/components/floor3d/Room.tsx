"use client";

import { Grid } from "@react-three/drei";
import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { RestaurantTable, Zone } from "@/lib/types";
import { heatColor } from "./geometry";

export interface FloorBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface RoomProps {
  bounds: FloorBounds;
  zones: Zone[];
  tables: RestaurantTable[];
  zoneHeat: Record<string, number>;
  heatmapOn: boolean;
  showGrid: boolean;
  onBackgroundClick: () => void;
}

/** The floor slab, reference grid, and per-zone heatmap wash discs. */
export function Room({ bounds, zones, tables, zoneHeat, heatmapOn, showGrid, onBackgroundClick }: RoomProps) {
  const width = Math.max(bounds.maxX - bounds.minX + 6, 8);
  const depth = Math.max(bounds.maxZ - bounds.minZ + 6, 8);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  const zoneDiscs = useMemo(() => {
    return zones.map((zone) => {
      const members = tables.filter((t) => t.zone_id === zone.id);
      if (members.length === 0) return null;
      const zcx = members.reduce((s, t) => s + t.pos_x, 0) / members.length;
      const zcz = members.reduce((s, t) => s + t.pos_z, 0) / members.length;
      const radius =
        Math.max(...members.map((t) => Math.hypot(t.pos_x - zcx, t.pos_z - zcz) + Math.max(t.width, t.depth) / 2)) +
        1.4;
      const heat = zoneHeat[zone.id];
      return { id: zone.id, x: zcx, z: zcz, radius, color: heat != null ? heatColor(heat) : zone.color };
    });
  }, [zones, tables, zoneHeat]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onBackgroundClick();
  };

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} onClick={handleClick}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#1e2530" roughness={0.95} />
      </mesh>

      {heatmapOn &&
        zoneDiscs.map(
          (d) =>
            d && (
              <mesh key={d.id} rotation={[-Math.PI / 2, 0, 0]} position={[d.x, 0.012, d.z]}>
                <circleGeometry args={[d.radius, 32]} />
                <meshBasicMaterial color={d.color} transparent opacity={0.38} />
              </mesh>
            )
        )}

      <Grid
        position={[cx, 0.008, cz]}
        args={[width, depth]}
        cellSize={0.25}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={1}
        sectionThickness={showGrid ? 1.2 : 0.6}
        sectionColor={showGrid ? "#60a5fa" : "#3f4a5c"}
        fadeDistance={showGrid ? 40 : 22}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />
    </group>
  );
}
