/**
 * Chart palette for the Baari dashboard.
 *
 * The dashboard renders on a single dark surface (--color-ink-950, #0e1116),
 * so only the dark steps are used. Validated against that exact surface:
 * lightness band, chroma floor, adjacent-pair CVD separation (worst ΔE 8.4),
 * normal-vision floor (worst ΔE 19.8) and 3:1 contrast all pass.
 *
 * Categorical slots are assigned in fixed order and never cycled. No chart here
 * runs more than three categorical series at once — past that it folds into a
 * facet or a table.
 */

export const SURFACE = "#0e1116";
export const SURFACE_RAISED = "#191d26";

/** Categorical — identity. Fixed order. */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500"] as const;

/** Sequential — magnitude, one hue, dark surface so low → near-surface. */
export const SEQ_BLUE = [
  "#16233a", "#104281", "#184f95", "#1c5cab", "#256abf",
  "#3987e5", "#5598e7", "#86b6ef", "#b7d3f6",
] as const;

/** Ordinal — discrete ordered stages (funnel). Clears 2:1 on the dark surface. */
export const ORDINAL_BLUE = [
  "#b7d3f6", "#86b6ef", "#5598e7", "#3987e5", "#256abf", "#184f95",
] as const;

/** Status — reserved, never reused as a series colour. Always with icon + label. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** Chrome. Text always wears an ink token, never a series colour. */
export const INK = {
  primary: "#ffffff",
  secondary: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
};

/** Position on a sequential ramp for a 0..1 intensity. */
export function seqColor(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return SEQ_BLUE[0];
  const i = Math.min(SEQ_BLUE.length - 1, Math.round(t * (SEQ_BLUE.length - 1)));
  return SEQ_BLUE[i];
}
