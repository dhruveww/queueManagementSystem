"use client";

import { Billboard, Text } from "@react-three/drei";

interface TableLabelProps {
  x: number;
  z: number;
  y?: number;
  label: string;
  capacity: number;
  dim?: boolean;
}

/** A small always-facing-camera tag floating above a table or group. */
export function TableLabel({ x, z, y = 1.35, label, capacity, dim = false }: TableLabelProps) {
  return (
    <Billboard position={[x, y, z]} follow>
      <Text
        fontSize={0.22}
        color={dim ? "#94a3b8" : "#f8fafc"}
        outlineWidth={0.018}
        outlineColor="#0f172a"
        anchorX="center"
        anchorY="bottom"
        fontWeight="bold"
      >
        {label}
      </Text>
      <Text
        position={[0, -0.22, 0]}
        fontSize={0.15}
        color={dim ? "#64748b" : "#cbd5e1"}
        outlineWidth={0.014}
        outlineColor="#0f172a"
        anchorX="center"
        anchorY="bottom"
      >
        {`seats ${capacity}`}
      </Text>
    </Billboard>
  );
}
