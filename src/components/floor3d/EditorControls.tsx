"use client";

import { useCallback, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { TableShape } from "@/lib/types";
import { MAX_DIM, MIN_DIM, angleFromCenter, clamp, halfExtents, rotatePoint, snap, snapAngle, unrotatePoint } from "./geometry";
import { useFloorRaycast } from "./useTableDrag";

interface EditorControlsProps {
  shape: TableShape;
  x: number;
  z: number;
  rotY: number;
  width: number;
  depth: number;
  onRotatePreview: (rotY: number) => void;
  onRotateCommit: (rotY: number) => void;
  onResizePreview: (dims: { width: number; depth: number }) => void;
  onResizeCommit: (dims: { width: number; depth: number }) => void;
  onDraggingChange: (dragging: boolean) => void;
  invalidate: () => void;
}

/** In-scene rotate + resize handles for the selected, editable table. */
export function EditorControls({
  shape,
  x,
  z,
  rotY,
  width,
  depth,
  onRotatePreview,
  onRotateCommit,
  onResizePreview,
  onResizeCommit,
  onDraggingChange,
  invalidate,
}: EditorControlsProps) {
  const floorPoint = useFloorRaycast();
  const { hw, hd } = halfExtents(shape, width, depth);
  const dragKind = useRef<"rotate" | "width" | "depth" | "radius" | null>(null);

  const handlePointerDown = useCallback(
    (kind: "rotate" | "width" | "depth" | "radius") => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const target = e.target as Element & { setPointerCapture?: (id: number) => void };
      target.setPointerCapture?.(e.pointerId);
      dragKind.current = kind;
      onDraggingChange(true);
      invalidate();
    },
    [onDraggingChange, invalidate]
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!dragKind.current) return;
      e.stopPropagation();
      const p = floorPoint();
      if (!p) return;

      if (dragKind.current === "rotate") {
        const theta = angleFromCenter(x, z, p.x, p.z);
        onRotatePreview(snapAngle(theta));
      } else {
        const [lx, lz] = unrotatePoint(p.x - x, p.z - z, rotY);
        if (dragKind.current === "radius") {
          const r = clamp(snap(Math.max(lx, lz), 0.1), MIN_DIM, MAX_DIM);
          onResizePreview({ width: r, depth: r });
        } else if (dragKind.current === "width") {
          const w = clamp(snap(lx * 2, 0.1), MIN_DIM, MAX_DIM);
          onResizePreview({ width: w, depth });
        } else {
          const d = clamp(snap(lz * 2, 0.1), MIN_DIM, MAX_DIM);
          onResizePreview({ width, depth: d });
        }
      }
      invalidate();
    },
    [floorPoint, x, z, rotY, width, depth, onRotatePreview, onResizePreview, invalidate]
  );

  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!dragKind.current) return;
      e.stopPropagation();
      const kind = dragKind.current;
      dragKind.current = null;
      onDraggingChange(false);
      if (kind === "rotate") onRotateCommit(rotY);
      else onResizeCommit({ width, depth });
      invalidate();
    },
    [rotY, width, depth, onRotateCommit, onResizeCommit, onDraggingChange, invalidate]
  );

  const rotateR = Math.max(hw, hd) + 0.55;
  const [rhx, rhz] = rotatePoint(rotateR, 0, rotY);

  return (
    <group>
      {/* rotate handle */}
      <mesh
        position={[x + rhx, 0.95, z + rhz]}
        onPointerDown={handlePointerDown("rotate")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.5} />
      </mesh>

      {shape === "round" ? (
        <mesh
          position={(() => {
            const [hx, hz2] = rotatePoint(hw, hw, rotY);
            return [x + hx, 0.4, z + hz2];
          })()}
          onPointerDown={handlePointerDown("radius")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <boxGeometry args={[0.16, 0.16, 0.16]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.4} />
        </mesh>
      ) : (
        <>
          <mesh
            position={(() => {
              const [hx, hz2] = rotatePoint(hw + 0.2, 0, rotY);
              return [x + hx, 0.4, z + hz2];
            })()}
            onPointerDown={handlePointerDown("width")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <boxGeometry args={[0.16, 0.16, 0.16]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.4} />
          </mesh>
          <mesh
            position={(() => {
              const [hx, hz2] = rotatePoint(0, hd + 0.2, rotY);
              return [x + hx, 0.4, z + hz2];
            })()}
            onPointerDown={handlePointerDown("depth")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <boxGeometry args={[0.16, 0.16, 0.16]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.4} />
          </mesh>
        </>
      )}
    </group>
  );
}
