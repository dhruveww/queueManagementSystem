"use client";

import type { Floor } from "@/lib/types";
import { cn } from "./utils";

interface FloorSwitcherProps {
  floors: Floor[];
  activeFloorId: string;
  onChange: (floorId: string) => void;
}

export function FloorSwitcher({ floors, activeFloorId, onChange }: FloorSwitcherProps) {
  const sorted = [...floors].sort((a, b) => a.level - b.level);
  if (sorted.length <= 1) return null;
  return (
    <div className="flex items-center gap-1 rounded-lg bg-slate-800/80 p-1 ring-1 ring-white/10">
      {sorted.map((floor) => (
        <button
          key={floor.id}
          type="button"
          onClick={() => onChange(floor.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            floor.id === activeFloorId ? "bg-sky-500 text-white" : "text-slate-300 hover:bg-slate-700/70"
          )}
        >
          {floor.name}
        </button>
      ))}
    </div>
  );
}
