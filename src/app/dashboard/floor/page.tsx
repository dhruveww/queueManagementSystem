import Link from "next/link";
import { Box, Lock } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { loadBoard } from "@/lib/domain/board";
import { FloorView } from "./FloorView";

export const metadata = { title: "Floor plan" };
export const dynamic = "force-dynamic";

export default async function FloorPage() {
  const session = await requireStaff();

  if (!session.isPro) return <ProUpsell canEdit={session.canEdit} />;

  const board = await loadBoard(session.outlet.id);

  return (
    <FloorView
      outletId={session.outlet.id}
      canEdit={session.canEdit}
      floors={board.floors}
      zones={board.zones}
      zoneHeat={board.zoneHeat}
      initial={{ entries: board.entries, tables: board.tables, groups: board.groups }}
    />
  );
}

function ProUpsell({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="mx-auto max-w-lg px-5 py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-saffron-500/15">
        <Box className="size-7 text-saffron-400" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-white">The 3D floor plan is a Pro feature</h1>
      <p className="mt-3 text-sm text-ink-400">
        See every table on a rotatable, zoomable floor plan that colours itself live as
        tables free up. Seat a guest by tapping them, then tapping a table. Add, move,
        merge and renumber tables directly on the plan — and get live-availability wait
        estimates instead of a rolling average.
      </p>
      <p className="mt-3 text-sm text-ink-500">
        Your tables, floors and zones are already stored — upgrading switches the view on
        immediately, with nothing to migrate.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        {canEdit ? (
          <Link
            href="/dashboard/billing"
            className="rounded-xl bg-saffron-500 px-5 py-3 font-semibold text-white"
          >
            Upgrade to Pro
          </Link>
        ) : (
          <span className="flex items-center gap-2 text-sm text-ink-500">
            <Lock className="size-4" aria-hidden /> Ask an owner or manager to upgrade
          </span>
        )}
        <Link
          href="/dashboard"
          className="rounded-xl border border-ink-700 px-5 py-3 font-semibold text-ink-200"
        >
          Back to the queue
        </Link>
      </div>
    </div>
  );
}
