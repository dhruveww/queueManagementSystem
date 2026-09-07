import QRCode from "qrcode";
import { requireManager } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { TEMPLATES } from "@/lib/whatsapp/templates";
import { SettingsView } from "./SettingsView";
import type { Floor, NotifTemplate, Zone } from "@/lib/types";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireManager();
  const db = createAdminSupabase();

  const [floorsRes, zonesRes, templatesRes] = await Promise.all([
    db.from("floors").select("*").eq("outlet_id", session.outlet.id).order("level"),
    db.from("zones").select("*").eq("outlet_id", session.outlet.id).order("name"),
    db.from("whatsapp_templates").select("*").eq("org_id", session.user.org_id),
  ]);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const joinUrl = `${base}/q/${session.outlet.slug}`;
  // Rendered server-side so the standee QR is identical everywhere and the
  // page needs no client-side canvas work.
  const qrSvg = await QRCode.toString(joinUrl, {
    type: "svg", margin: 1, width: 260,
    color: { dark: "#191d26", light: "#ffffff" },
  });

  const approvals = new Map(
    ((templatesRes.data ?? []) as { template: NotifTemplate; approval: string }[])
      .map((t) => [t.template, t.approval]),
  );

  return (
    <SettingsView
      outlet={session.outlet}
      floors={(floorsRes.data ?? []) as Floor[]}
      zones={(zonesRes.data ?? []) as Zone[]}
      joinUrl={joinUrl}
      qrSvg={qrSvg}
      templates={(Object.keys(TEMPLATES) as NotifTemplate[]).map((key) => ({
        key,
        name: TEMPLATES[key].name,
        body: TEMPLATES[key].body,
        approval: approvals.get(key) ?? "not submitted",
      }))}
    />
  );
}
