import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { OutletSwitcher } from "./OutletSwitcher";
import { NavTabs } from "./NavTabs";

export default async function DashboardLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await requireStaff();

  return (
    // h-dvh (not min-h-dvh) so `flex-1` below has a definite height to divide —
    // the 3D floor canvas sizes itself with h-full and collapses without it.
    <div className="staff-shell flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink-800 px-4 py-3">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight text-white">Baari</span>
          {session.isPro && (
            <span className="rounded bg-saffron-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-saffron-400">
              Pro
            </span>
          )}
        </Link>

        <OutletSwitcher outlets={session.outlets} currentId={session.outlet.id} />

        <div className="ml-auto flex items-center gap-3 text-sm text-ink-400">
          <span className="hidden sm:inline">
            {session.user.full_name ?? session.user.email}
          </span>
          <span className="rounded bg-ink-800 px-2 py-0.5 text-xs capitalize">
            {session.user.role}
          </span>
        </div>

        <NavTabs isPro={session.isPro} canEdit={session.canEdit} />
      </header>

      {/* min-h-0 lets this shrink below its content so long pages scroll here
          rather than pushing the shell taller than the viewport. */}
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
