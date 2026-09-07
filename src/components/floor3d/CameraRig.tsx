"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CameraApi } from "./types";
import type { FloorBounds } from "./Room";

interface CameraRigProps {
  bounds: FloorBounds;
  enabled: boolean;
  invalidate: () => void;
}

/** Orbit camera with sane clamps, plus an imperative reset/top-down API for the 2D toolbar. */
export const CameraRig = forwardRef<CameraApi, CameraRigProps>(function CameraRig({ bounds, enabled, invalidate }, ref) {
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const flight = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  const home = useMemo(() => {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const size = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 4);
    return {
      target: new THREE.Vector3(cx, 0, cz),
      pos: new THREE.Vector3(cx + size * 0.85, size * 0.95, cz + size * 0.85),
      topPos: new THREE.Vector3(cx + 0.001, size * 1.4, cz + 0.001),
      maxDistance: Math.max(size * 3, 16),
    };
  }, [bounds]);

  useImperativeHandle(
    ref,
    () => ({
      resetView: () => {
        flight.current = { pos: home.pos.clone(), target: home.target.clone() };
        invalidate();
      },
      topDown: () => {
        flight.current = { pos: home.topPos.clone(), target: home.target.clone() };
        invalidate();
      },
    }),
    [home, invalidate]
  );

  // Snap straight to the new floor's home view on mount / floor switch —
  // no flight animation here, that's reserved for explicit reset/top-down.
  useLayoutEffect(() => {
    camera.position.copy(home.pos);
    const controls = controlsRef.current as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (controls) {
      controls.target.copy(home.target);
      controls.update();
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home]);

  useFrame(() => {
    if (!flight.current || !controlsRef.current) return;
    const controls = controlsRef.current as unknown as { target: THREE.Vector3; update: () => void };
    camera.position.lerp(flight.current.pos, 0.18);
    controls.target.lerp(flight.current.target, 0.18);
    controls.update();
    const done =
      camera.position.distanceTo(flight.current.pos) < 0.03 && controls.target.distanceTo(flight.current.target) < 0.03;
    if (done) {
      camera.position.copy(flight.current.pos);
      controls.target.copy(flight.current.target);
      controls.update();
      flight.current = null;
    }
    invalidate();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={enabled}
      enableDamping
      dampingFactor={0.12}
      minDistance={1.5}
      maxDistance={home.maxDistance}
      minPolarAngle={0.02}
      maxPolarAngle={Math.PI / 2 - 0.03}
      target={home.target}
      camera={camera}
    />
  );
});
