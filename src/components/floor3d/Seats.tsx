"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { RestaurantTable } from "@/lib/types";
import { SEAT_HEIGHT, seatTransformsFor } from "./geometry";

const SEAT_GEOMETRY = new THREE.CylinderGeometry(0.14, 0.17, SEAT_HEIGHT, 8);
const SEAT_MATERIAL = new THREE.MeshStandardMaterial({ color: "#3f3a34", roughness: 0.95, metalness: 0.05 });

/**
 * One instanced draw call for every chair on the floor, regardless of how
 * many tables there are. Re-keyed on total seat count so growth/shrink
 * (add table, delete, capacity change) gets a fresh instance buffer without
 * hand-rolling a resizable one; per-drag position updates reuse it via a
 * plain matrix rewrite.
 */
export function Seats({ tables }: { tables: RestaurantTable[] }) {
  const transforms = useMemo(() => tables.flatMap((t) => seatTransformsFor(t)), [tables]);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);
    transforms.forEach((t, i) => {
      quat.setFromAxisAngle(axis, t.rotY);
      m.compose(new THREE.Vector3(t.x, SEAT_HEIGHT / 2, t.z), quat, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [transforms]);

  if (transforms.length === 0) return null;

  return (
    <instancedMesh
      key={transforms.length}
      ref={meshRef}
      args={[SEAT_GEOMETRY, SEAT_MATERIAL, transforms.length]}
      castShadow={false}
      receiveShadow={false}
    />
  );
}
