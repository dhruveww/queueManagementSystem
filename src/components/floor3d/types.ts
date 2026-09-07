"use client";

import type { TableShape } from "@/lib/types";

/** Internal-only selection state — never leaves this folder. */
export type Selection = { kind: "table"; id: string } | { kind: "group"; id: string } | null;

/** Imperative handle exposed by CameraRig so 2D chrome can drive the camera. */
export interface CameraApi {
  resetView: () => void;
  topDown: () => void;
}

/** Draft state for the "add table" popover before it becomes a real row. */
export interface NewTableDraft {
  shape: TableShape;
  capacity: number;
  zoneId: string;
}

/** How a table/group should render while a guest is armed for seating. */
export type FitState = "neutral" | "fit" | "unfit";
