"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { requireManager, assertOutletAccess } from "@/lib/auth";

const OutletSchema = z.object({
  outletId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
  is_open: z.coerce.boolean(),
  grace_period_min: z.coerce.number().int().min(1).max(60),
  grace_reoffers: z.coerce.number().int().min(0).max(3),
  notify_lead_min: z.coerce.number().int().min(5).max(60),
  max_party_size: z.coerce.number().int().min(2).max(50),
  pii_retention_days: z.coerce.number().int().min(1).max(365),
  feedback_url: z.string().trim().url().or(z.literal("")).optional(),
});

export async function updateOutletAction(formData: FormData) {
  const parsed = OutletSchema.safeParse({
    outletId: formData.get("outletId"),
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
    is_open: formData.get("is_open") === "on",
    grace_period_min: formData.get("grace_period_min"),
    grace_reoffers: formData.get("grace_reoffers"),
    notify_lead_min: formData.get("notify_lead_min"),
    max_party_size: formData.get("max_party_size"),
    pii_retention_days: formData.get("pii_retention_days"),
    feedback_url: formData.get("feedback_url") || "",
  });

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  }

  const { outletId, ...patch } = parsed.data;
  await requireManager();
  await assertOutletAccess(outletId);

  const { error } = await createAdminSupabase()
    .from("outlets")
    .update({ ...patch, feedback_url: patch.feedback_url || null })
    .eq("id", outletId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

const FloorSchema = z.object({
  outletId: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  level: z.coerce.number().int().min(-5).max(50),
});

export async function addFloorAction(formData: FormData) {
  const input = FloorSchema.parse({
    outletId: formData.get("outletId"),
    name: formData.get("name"),
    level: formData.get("level"),
  });
  await requireManager();
  await assertOutletAccess(input.outletId);

  const { error } = await createAdminSupabase().from("floors").insert({
    outlet_id: input.outletId, name: input.name, level: input.level,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/settings");
  return { ok: true as const };
}

const ZoneSchema = z.object({
  outletId: z.string().uuid(),
  floorId: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  kind: z.enum(["indoor", "outdoor", "ac", "rooftop", "bar", "private"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function addZoneAction(formData: FormData) {
  const input = ZoneSchema.parse({
    outletId: formData.get("outletId"),
    floorId: formData.get("floorId"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color"),
  });
  await requireManager();
  await assertOutletAccess(input.outletId);

  const { error } = await createAdminSupabase().from("zones").insert({
    outlet_id: input.outletId, floor_id: input.floorId,
    name: input.name, kind: input.kind, color: input.color,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/settings");
  return { ok: true as const };
}
