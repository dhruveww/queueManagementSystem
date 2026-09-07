"use client";

/**
 * Pure math helpers shared across the 3D scene. No React, no THREE side
 * effects beyond plain number/array crunching — keeps this file trivially
 * testable and safe to import from anywhere (including module scope).
 *
 * Rotation convention matches three.js's rotation-about-Y exactly, since
 * these numbers must agree with what <group rotation-y={rot_y}> actually
 * renders:
 *   x' =  x*cos(theta) + z*sin(theta)
 *   z' = -x*sin(theta) + z*cos(theta)
 */

import type { RestaurantTable, TableShape } from "@/lib/types";

export const GRID_SIZE = 0.25; // metres
export const TABLE_HEIGHT = 0.75;
export const SEAT_HEIGHT = 0.42;
export const SEAT_GAP = 0.34; // clearance between table edge and a seat
export const MIN_DIM = 0.4;
export const MAX_DIM = 4;

export function snap(value: number, size = GRID_SIZE): number {
  return Math.round(value / size) * size;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snapAngle(radians: number, stepDeg = 15): number {
  const step = (stepDeg * Math.PI) / 180;
  return Math.round(radians / step) * step;
}

/** Rotate a local (x,z) offset by theta using three.js's Y-rotation convention. */
export function rotatePoint(x: number, z: number, theta: number): [number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [x * c + z * s, -x * s + z * c];
}

/** Inverse of rotatePoint. */
export function unrotatePoint(x: number, z: number, theta: number): [number, number] {
  return rotatePoint(x, z, -theta);
}

/** The rotation theta such that rotatePoint(r,0,theta) lands on (px-cx, pz-cz). */
export function angleFromCenter(cx: number, cz: number, px: number, pz: number): number {
  return Math.atan2(-(pz - cz), px - cx);
}

/** Footprint half-extents in local space. Round tables use width as diameter. */
export function halfExtents(shape: TableShape, width: number, depth: number) {
  if (shape === "round") {
    const r = width / 2;
    return { hw: r, hd: r };
  }
  return { hw: width / 2, hd: depth / 2 };
}

/** World-space corners of a table's oriented footprint, going around CCW. */
export function tableCorners(table: Pick<RestaurantTable, "shape" | "width" | "depth" | "pos_x" | "pos_z" | "rot_y">): [number, number][] {
  const { hw, hd } = halfExtents(table.shape, table.width, table.depth);
  const local: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return local.map(([lx, lz]) => {
    const [rx, rz] = rotatePoint(lx, lz, table.rot_y);
    return [table.pos_x + rx, table.pos_z + rz];
  });
}

export interface SeatTransform {
  x: number;
  z: number;
  rotY: number;
}

/** World-space seat positions/orientations around a table, scaled to capacity. */
export function seatTransformsFor(
  table: Pick<RestaurantTable, "shape" | "width" | "depth" | "capacity" | "pos_x" | "pos_z" | "rot_y">
): SeatTransform[] {
  const { shape, capacity, pos_x, pos_z, rot_y } = table;
  const n = Math.max(0, Math.round(capacity));
  if (n === 0) return [];
  const local: { x: number; z: number; rot: number }[] = [];

  if (shape === "round") {
    const r = table.width / 2 + SEAT_GAP;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const lx = Math.cos(angle) * r;
      const lz = Math.sin(angle) * r;
      local.push({ x: lx, z: lz, rot: angleFromCenter(0, 0, lx, lz) + Math.PI });
    }
  } else if (shape === "booth") {
    // Back bench sits on local -z; guests seat facing it from local +z (front).
    const { hw, hd } = halfExtents(shape, table.width, table.depth);
    const z = hd + SEAT_GAP;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const x = -hw + t * (2 * hw);
      local.push({ x, z, rot: Math.PI });
    }
  } else {
    // square / rect: distribute around the perimeter proportional to side length.
    const { hw, hd } = halfExtents(shape, table.width, table.depth);
    const width = hw * 2;
    const depth = hd * 2;
    const perimeter = 2 * (width + depth);
    const sides = [
      { len: width, count: 0 },
      { len: depth, count: 0 },
      { len: width, count: 0 },
      { len: depth, count: 0 },
    ];
    let assigned = 0;
    const raw = sides.map((s) => (n * s.len) / perimeter);
    sides.forEach((s, i) => {
      s.count = Math.floor(raw[i]);
      assigned += s.count;
    });
    // hand out remaining seats to the sides with the largest fractional remainder
    const remainders = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
    let remaining = n - assigned;
    for (const { i } of remainders) {
      if (remaining <= 0) break;
      sides[i].count += 1;
      remaining -= 1;
    }

    const place = (side: number, count: number) => {
      for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1);
        if (side === 0) local.push({ x: -hw + t * width, z: -hd - SEAT_GAP, rot: 0 });
        else if (side === 1) local.push({ x: hw + SEAT_GAP, z: -hd + t * depth, rot: -Math.PI / 2 });
        else if (side === 2) local.push({ x: hw - t * width, z: hd + SEAT_GAP, rot: Math.PI });
        else local.push({ x: -hw - SEAT_GAP, z: hd - t * depth, rot: Math.PI / 2 });
      }
    };
    sides.forEach((s, i) => place(i, s.count));
  }

  return local.map(({ x, z, rot }) => {
    const [wx, wz] = rotatePoint(x, z, rot_y);
    return { x: pos_x + wx, z: pos_z + wz, rotY: rot_y + rot };
  });
}

/** Sensible default width/depth for a freshly-added table. */
export function defaultDims(shape: TableShape, capacity: number): { width: number; depth: number } {
  const n = clamp(capacity, 1, 20);
  if (shape === "round") {
    const d = clamp(0.55 + n * 0.12, 0.7, 1.8);
    return { width: d, depth: d };
  }
  if (shape === "square") {
    const s = clamp(0.6 + n * 0.08, 0.7, 1.6);
    return { width: s, depth: s };
  }
  if (shape === "booth") {
    return { width: clamp(0.5 * n, 1, 3.2), depth: 1.1 };
  }
  // rect
  return { width: clamp(0.45 * n, 1, 3.6), depth: 0.9 };
}

/** Next free "T<n>" label given every table currently on the outlet. */
export function nextTableLabel(existing: { label: string }[]): string {
  let max = 0;
  for (const t of existing) {
    const m = /^T(\d+)$/i.exec(t.label.trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `T${max + 1}`;
}

export function fitsCapacity(capacity: number, partySize: number): boolean {
  return capacity >= partySize;
}

// ---------------------------------------------------------------- hulls

/** Andrew's monotone-chain convex hull. Returns points in CCW order. */
export function convexHull(points: [number, number][]): [number, number][] {
  const pts = Array.from(new Map(points.map((p) => [`${p[0]}_${p[1]}`, p])).values()).sort(
    (a, b) => a[0] - b[0] || a[1] - b[1]
  );
  if (pts.length <= 2) return pts;

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

/** Expand a convex polygon outward from its centroid by `margin` metres. */
export function expandHull(hull: [number, number][], margin: number): [number, number][] {
  if (hull.length === 0) return hull;
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cz = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const dist = Math.hypot(dx, dz) || 1;
    const scale = (dist + margin) / dist;
    return [cx + dx * scale, cz + dz * scale];
  });
}

export function centroid(points: [number, number][]): { x: number; z: number } {
  if (points.length === 0) return { x: 0, z: 0 };
  const x = points.reduce((s, p) => s + p[0], 0) / points.length;
  const z = points.reduce((s, p) => s + p[1], 0) / points.length;
  return { x, z };
}

// -------------------------------------------------------------- heatmap

/** 0..1 turnover -> a cool-to-hot RGB, used for the zone heatmap wash. */
export function heatColor(t: number): string {
  const v = clamp(t, 0, 1);
  // slate (cool/low) -> amber -> red (hot/high)
  const stops: [number, [number, number, number]][] = [
    [0, [56, 96, 148]],
    [0.5, [217, 158, 45]],
    [1, [220, 38, 38]],
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i][0] && v <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const f = (v - lo[0]) / span;
  const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * f);
  const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * f);
  const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * f);
  return `rgb(${r}, ${g}, ${b})`;
}
