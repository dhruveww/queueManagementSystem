"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { TABLE_STATUS_COLOR, type RestaurantTable, type TableGroup } from "@/lib/types";
import { centroid, convexHull, expandHull, tableCorners } from "./geometry";
import { TableLabel } from "./TableLabel";
import type { FitState } from "./types";

interface GroupHullProps {
  group: TableGroup;
  members: RestaurantTable[];
  selected: boolean;
  fitState: FitState;
  onSelect: () => void;
}

/** The unified footprint tying a merged group's tables together. */
export function GroupHull({ group, members, selected, fitState, onSelect }: GroupHullProps) {
  const points = useMemo(() => members.flatMap((t) => tableCorners(t)), [members]);
  const hull = useMemo(() => expandHull(convexHull(points), 0.35), [points]);
  const center = useMemo(() => centroid(hull.length ? hull : points), [hull, points]);

  const geometry = useMemo(() => {
    if (hull.length < 3) return null;
    const shape = new THREE.Shape(hull.map(([hx, hz]) => new THREE.Vector2(hx, hz)));
    return new THREE.ShapeGeometry(shape);
  }, [hull]);

  if (!geometry) return null;

  const baseColor = TABLE_STATUS_COLOR[group.status];
  const opacity = fitState === "unfit" ? 0.18 : 0.42;
  const emissive = fitState === "fit" ? "#22c55e" : "#000000";
  const emissiveIntensity = fitState === "fit" ? 0.4 : 0;

  const handlePointer = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  };

  return (
    <group>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} onClick={handlePointer}>
        <meshStandardMaterial
          color={baseColor}
          transparent
          opacity={opacity}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side={THREE.DoubleSide}
        />
      </mesh>
      {selected && (
        <lineLoop position={[0, 0.04, 0]}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(hull.flatMap(([hx, hz]) => [hx, 0, hz])), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#fbbf24" linewidth={2} />
        </lineLoop>
      )}
      <TableLabel x={center.x} z={center.z} label={group.label} capacity={group.capacity} dim={fitState === "unfit"} />
    </group>
  );
}
