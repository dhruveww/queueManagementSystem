"use client";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Local cn() helper — floor3d owns its own copy since src/lib is off limits. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** "12 min", "1 hr 4 min" style relative duration since an ISO timestamp. */
export function formatElapsed(sinceIso: string, nowMs: number): string {
  const since = new Date(sinceIso).getTime();
  const totalMin = Math.max(0, Math.round((nowMs - since) / 60000));
  if (totalMin < 1) return "just now";
  if (totalMin < 60) return `${totalMin} min`;
  const hrs = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min === 0 ? `${hrs} hr` : `${hrs} hr ${min} min`;
}
