import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOutletBySlug } from "@/lib/domain/queue";
import { loadEstimateContext, estimateForNewParty } from "@/lib/domain/estimate";
import { formatWait } from "@/lib/domain/waitTime";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { JoinForm } from "./JoinForm";
import type { ZoneKind } from "@/lib/types";

// The guest join page is the one thing that must stay fast on a doorway 4G
// connection: server-rendered, no client data fetching, revalidated often
// enough that the "people ahead" number is honest.
export const revalidate = 15;

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await getOutletBySlug(slug);
  return {
    title: found ? `Join the line at ${found.outlet.name}` : "Restaurant not found",
    description: found
      ? `Skip the physical queue at ${found.outlet.name}. Scan, join, and we'll WhatsApp you when your table is ready.`
      : undefined,
  };
}

export default async function JoinPage({ params }: Props) {
  const { slug } = await params;
  const found = await getOutletBySlug(slug);
  if (!found) notFound();
  const { outlet, plan } = found;

  const db = createAdminSupabase();
  const [ctx, zonesRes] = await Promise.all([
    loadEstimateContext(outlet.id, plan),
    db.from("zones").select("kind").eq("outlet_id", outlet.id),
  ]);

  const zoneOptions = [
    ...new Set(((zonesRes.data ?? []) as { kind: ZoneKind }[]).map((z) => z.kind)),
  ];
  const est = estimateForNewParty(ctx, 2);

  if (!outlet.is_open) {
    return (
      <Shell name={outlet.name} address={outlet.address}>
        <div className="rounded-2xl border border-ink-200 bg-white p-6 text-center">
          <p className="text-lg font-semibold text-ink-900">The line is closed right now</p>
          <p className="mt-2 text-sm text-ink-500">
            {outlet.name} isn't taking queue entries at the moment. Please check with the host desk.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell name={outlet.name} address={outlet.address}>
      <JoinForm
        slug={slug}
        maxPartySize={outlet.max_party_size}
        zoneOptions={zoneOptions}
        estimateLabel={formatWait(est.lowMin, est.highMin)}
        peopleAhead={ctx.openEntries.length}
      />
    </Shell>
  );
}

function Shell({
  name, address, children,
}: { name: string; address: string | null; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-5 pb-16 pt-8">
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-saffron-600">
          Baari · Virtual queue
        </p>
        <h1 className="mt-1 text-3xl font-bold leading-tight text-ink-900">{name}</h1>
        {address && <p className="mt-1 text-sm text-ink-500">{address}</p>}
      </header>
      {children}
    </main>
  );
}
