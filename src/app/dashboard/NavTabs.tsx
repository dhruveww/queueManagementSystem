"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, Box, BarChart3, Settings, CreditCard, Lock } from "lucide-react";
import { cn } from "@/lib/cn";

export function NavTabs({ isPro, canEdit }: { isPro: boolean; canEdit: boolean }) {
  const path = usePathname();

  const tabs = [
    { href: "/dashboard", label: "Queue", icon: List, show: true },
    { href: "/dashboard/floor", label: "Floor 3D", icon: isPro ? Box : Lock, show: true, locked: !isPro },
    { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, show: true },
    { href: "/dashboard/billing", label: "Billing", icon: CreditCard, show: canEdit },
    { href: "/dashboard/settings", label: "Settings", icon: Settings, show: canEdit },
  ].filter((t) => t.show);

  return (
    <nav className="order-last flex w-full gap-1 overflow-x-auto">
      {tabs.map(({ href, label, icon: Icon, locked }) => {
        const active = href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href} href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-ink-800 text-white" : "text-ink-400 hover:bg-ink-900 hover:text-ink-200",
              locked && "opacity-60",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
