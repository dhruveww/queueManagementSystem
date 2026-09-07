"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { switchOutletAction } from "./actions";
import type { Outlet } from "@/lib/types";

export function OutletSwitcher({
  outlets, currentId,
}: { outlets: Outlet[]; currentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (outlets.length === 1) {
    return <span className="text-sm text-ink-300">{outlets[0].name}</span>;
  }

  return (
    <div className="relative">
      <select
        value={currentId}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            await switchOutletAction(id);
            router.refresh();
          });
        }}
        className="appearance-none rounded-lg border border-ink-700 bg-ink-900 py-1.5 pl-3 pr-8 text-sm text-ink-100 outline-none focus:border-saffron-500"
        aria-label="Switch outlet"
      >
        {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
    </div>
  );
}
