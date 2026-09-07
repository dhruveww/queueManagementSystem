import { requireStaff } from "@/lib/auth";
import { loadBoard } from "@/lib/domain/board";
import { loadEstimateContext } from "@/lib/domain/estimate";
import { QueueBoard } from "./QueueBoard";

export const metadata = { title: "Queue" };
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const session = await requireStaff();
  const [board, ctx] = await Promise.all([
    loadBoard(session.outlet.id),
    loadEstimateContext(session.outlet.id, session.plan),
  ]);

  return (
    <QueueBoard
      outletId={session.outlet.id}
      outletName={session.outlet.name}
      gracePeriodMin={session.outlet.grace_period_min}
      method={ctx.method}
      turnStats={ctx.turnStats}
      floors={board.floors}
      zones={board.zones}
      occupiedSince={board.occupiedSince}
      initial={{ entries: board.entries, tables: board.tables, groups: board.groups }}
    />
  );
}
