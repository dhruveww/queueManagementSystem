/**
 * Staff session resolution.
 *
 * One call gives a server component everything it needs to decide what to
 * render: who the user is, what plan their org is on (which gates the 3D floor
 * view), and which outlet they're currently working. Outlet selection is
 * sticky via a cookie so a host on a tablet doesn't re-pick every shift.
 */

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Outlet, PlanTier, StaffUser, Subscription } from "@/lib/types";

export const OUTLET_COOKIE = "baari_outlet";

export interface StaffSession {
  user: StaffUser;
  outlets: Outlet[];
  outlet: Outlet;
  plan: PlanTier;
  subscription: Subscription | null;
  canEdit: boolean;   // manager/owner — geometry edits and settings
  isPro: boolean;
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const supabase = await createServerSupabase();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const db = createAdminSupabase();
  const { data: staff } = await db
    .from("staff_users").select("*").eq("id", authUser.id).maybeSingle();
  if (!staff) return null;
  const user = staff as StaffUser;
  if (!user.org_id) return null;

  const [{ data: outletRows }, { data: sub }, { data: assigned }] = await Promise.all([
    db.from("outlets").select("*").eq("org_id", user.org_id).order("name"),
    db.from("subscriptions").select("*").eq("org_id", user.org_id).maybeSingle(),
    db.from("staff_outlets").select("outlet_id").eq("staff_id", user.id),
  ]);

  const canEdit = ["owner", "manager", "superadmin"].includes(user.role);
  const assignedIds = new Set(((assigned ?? []) as { outlet_id: string }[]).map((a) => a.outlet_id));
  const all = (outletRows ?? []) as Outlet[];
  // Hosts are scoped to their assigned outlets; if none are assigned, they see
  // the whole org rather than an empty screen mid-shift.
  const outlets = canEdit || assignedIds.size === 0
    ? all
    : all.filter((o) => assignedIds.has(o.id));

  if (outlets.length === 0) return null;

  const cookieStore = await cookies();
  const preferred = cookieStore.get(OUTLET_COOKIE)?.value;
  const outlet = outlets.find((o) => o.id === preferred) ?? outlets[0];

  const subscription = (sub as Subscription | null) ?? null;
  const planActive = subscription
    && ["active", "trialing", "past_due"].includes(subscription.status);
  const plan: PlanTier = planActive ? subscription!.plan : "basic";

  return {
    user, outlets, outlet, plan, subscription, canEdit, isPro: plan === "pro",
  };
}

export async function requireStaff(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireManager(): Promise<StaffSession> {
  const session = await requireStaff();
  if (!session.canEdit) redirect("/dashboard");
  return session;
}

/** Throws unless the signed-in user may act on this outlet. */
export async function assertOutletAccess(outletId: string): Promise<StaffSession> {
  const session = await requireStaff();
  if (!session.outlets.some((o) => o.id === outletId)) {
    throw new Error("You don't have access to this outlet");
  }
  return session;
}
