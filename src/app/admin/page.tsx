import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { TEMPLATES } from "@/lib/whatsapp/templates";
import type { NotifTemplate } from "@/lib/types";

export const metadata = { title: "Baari ops" };
export const dynamic = "force-dynamic";

/**
 * Internal ops console. Onboarding state per tenant: whether their WhatsApp
 * templates are approved (which gates go-live), what they're paying, and
 * whether they're actually using the product.
 */
export default async function AdminPage() {
  const session = await requireStaff();
  if (session.user.role !== "superadmin") redirect("/dashboard");

  const db = createAdminSupabase();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [orgsRes, outletsRes, subsRes, templatesRes, usageRes] = await Promise.all([
    db.from("organizations").select("*").order("created_at", { ascending: false }),
    db.from("outlets").select("id, org_id, name, slug, is_open"),
    db.from("subscriptions").select("*"),
    db.from("whatsapp_templates").select("org_id, template, approval"),
    db.from("queue_entries").select("outlet_id").gte("joined_at", since),
  ]);

  const orgs = (orgsRes.data ?? []) as { id: string; name: string; gstin: string | null; created_at: string }[];
  const outlets = (outletsRes.data ?? []) as { id: string; org_id: string; name: string; slug: string; is_open: boolean }[];
  const subs = new Map(((subsRes.data ?? []) as { org_id: string; plan: string; status: string; razorpay_subscription_id: string | null }[])
    .map((s) => [s.org_id, s]));

  const approvedByOrg = new Map<string, number>();
  for (const t of (templatesRes.data ?? []) as { org_id: string; approval: string }[]) {
    if (t.approval === "approved") approvedByOrg.set(t.org_id, (approvedByOrg.get(t.org_id) ?? 0) + 1);
  }

  const usageByOutlet = new Map<string, number>();
  for (const u of (usageRes.data ?? []) as { outlet_id: string }[]) {
    usageByOutlet.set(u.outlet_id, (usageByOutlet.get(u.outlet_id) ?? 0) + 1);
  }

  const totalTemplates = Object.keys(TEMPLATES).length;

  return (
    <div className="staff-shell min-h-dvh px-4 py-6">
      <h1 className="text-xl font-semibold text-white">Baari ops</h1>
      <p className="mt-1 text-sm text-ink-400">
        {orgs.length} tenants · {outlets.length} outlets
      </p>

      <div className="mt-6 space-y-3">
        {orgs.map((org) => {
          const sub = subs.get(org.id);
          const orgOutlets = outlets.filter((o) => o.org_id === org.id);
          const approved = approvedByOrg.get(org.id) ?? 0;
          const weekly = orgOutlets.reduce((a, o) => a + (usageByOutlet.get(o.id) ?? 0), 0);

          return (
            <div key={org.id} className="rounded-xl border border-ink-800 bg-ink-900 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-semibold text-white">{org.name}</h2>
                <span className="rounded bg-saffron-500/15 px-2 py-0.5 text-xs font-semibold capitalize text-saffron-400">
                  {sub?.plan ?? "none"}
                </span>
                <span className="rounded bg-ink-800 px-2 py-0.5 text-xs capitalize text-ink-300">
                  {sub?.status ?? "no subscription"}
                </span>
                {org.gstin && <span className="font-mono text-xs text-ink-500">{org.gstin}</span>}
                <span className="ml-auto text-xs text-ink-500 tnum">
                  {weekly} guests / 7d
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-400">
                <span>
                  WhatsApp templates:{" "}
                  <strong className={approved === totalTemplates ? "text-status-free" : "text-status-clearing"}>
                    {approved}/{totalTemplates} approved
                  </strong>
                  {approved < totalTemplates && " — cannot go live"}
                </span>
                <span>
                  Razorpay:{" "}
                  <span className="font-mono">{sub?.razorpay_subscription_id ?? "not linked"}</span>
                </span>
                <span>Joined {new Date(org.created_at).toLocaleDateString("en-IN")}</span>
              </div>

              <ul className="mt-3 flex flex-wrap gap-2">
                {orgOutlets.map((o) => (
                  <li key={o.id} className="rounded-lg bg-ink-950 px-2.5 py-1.5 text-xs text-ink-300">
                    {o.name}
                    <span className="ml-2 font-mono text-ink-500">/q/{o.slug}</span>
                    {!o.is_open && <span className="ml-2 text-status-clearing">closed</span>}
                    <span className="ml-2 text-ink-500 tnum">{usageByOutlet.get(o.id) ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
