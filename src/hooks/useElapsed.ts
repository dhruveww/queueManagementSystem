"use client";

import { useEffect, useState } from "react";

/**
 * Minutes elapsed since a timestamp, ticking every 15s.
 * The board's whole job is showing how long someone has been waiting, so this
 * has to move on its own without a server round trip.
 */
export function useElapsedMinutes(since: string | null | undefined): number {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  if (!since) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60_000));
}

export function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
