"use client";

import { useThree } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * Raycasts the current pointer against the y=0 floor plane using the
 * scene's live raycaster (already aimed at the pointer by fiber before any
 * pointer handler runs). Works during a captured drag even when the
 * pointer has moved off the mesh that captured it.
 */
export function useFloorRaycast() {
  const raycaster = useThree((s) => s.raycaster);
  const point = useRef(new THREE.Vector3()).current;
  return useCallback((): { x: number; z: number } | null => {
    if (raycaster.ray.intersectPlane(FLOOR_PLANE, point)) {
      return { x: point.x, z: point.z };
    }
    return null;
  }, [raycaster, point]);
}

export interface DragHandlers {
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (e: ThreeEvent<PointerEvent>) => void;
}

/**
 * Generic "grab a point on the floor plane, track delta from the start"
 * drag primitive. `onStart` fires immediately (also doubling as a select).
 * `onMove(dx, dz, moved)` fires with the cumulative delta from the grab
 * point every pointer move. `onEnd(moved)` fires on release.
 */
export function useFloorDrag(opts: {
  enabled: boolean;
  onStart?: () => void;
  onMove: (dx: number, dz: number) => void;
  onEnd: (moved: boolean) => void;
  invalidate: () => void;
}): DragHandlers {
  const { enabled, onStart, onMove, onEnd, invalidate } = opts;
  const floorPoint = useFloorRaycast();
  const state = useRef<{ startX: number; startZ: number; moved: boolean } | null>(null);

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!enabled) return;
      e.stopPropagation();
      const target = e.target as Element & { setPointerCapture?: (id: number) => void };
      target.setPointerCapture?.(e.pointerId);
      const p = floorPoint();
      state.current = { startX: p?.x ?? 0, startZ: p?.z ?? 0, moved: false };
      onStart?.();
      invalidate();
    },
    [enabled, floorPoint, onStart, invalidate]
  );

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!state.current) return;
      e.stopPropagation();
      const p = floorPoint();
      if (!p) return;
      const dx = p.x - state.current.startX;
      const dz = p.z - state.current.startZ;
      if (Math.hypot(dx, dz) > 0.02) state.current.moved = true;
      onMove(dx, dz);
      invalidate();
    },
    [floorPoint, onMove, invalidate]
  );

  const onPointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!state.current) return;
      e.stopPropagation();
      const moved = state.current.moved;
      state.current = null;
      onEnd(moved);
      invalidate();
    },
    [onEnd, invalidate]
  );

  return { onPointerDown, onPointerMove, onPointerUp };
}
