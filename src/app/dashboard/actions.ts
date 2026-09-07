"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { assertOutletAccess, requireStaff } from "@/lib/auth";
import { markNotified, sendPositionUpdate, closeEntry, joinQueue } from "@/lib/domain/queue";
import { normalisePhone } from "@/lib/domain/phone";
import type { TableStatus, RestaurantTable } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

function fail(err: unknown): Result {
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

async function audit(outletId: string, action: string, target?: string, meta?: unknown) {
  const session = await requireStaff();
  await createAdminSupabase().from("audit_events").insert({
    outlet_id: outletId, actor_id: session.user.id, action, target, meta: meta ?? null,
  });
}

// ------------------------------------------------------------ queue actions
export async function notifyGuestAction(entryId: string, tableLabel?: string): Promise<Result> {
  try {
    const entry = await loadEntry(entryId);
    await assertOutletAccess(entry.outlet_id);
    const res = await markNotified(entryId, tableLabel);
    await audit(entry.outlet_id, "notify_guest", entryId);
    revalidatePath("/dashboard");
    // A failed WhatsApp send is not a failed action — the entry is still
    // notified and the board now shows a "call this guest" flag.
    return res.ok
      ? { ok: true }
      : { ok: false, error: `WhatsApp failed (${res.error}) — please call the guest` };
  } catch (err) { return fail(err); }
}

export async function nudgeGuestAction(entryId: string): Promise<Result> {
  try {
    const entry = await loadEntry(entryId);
    await assertOutletAccess(entry.outlet_id);
    await sendPositionUpdate(entryId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) { return fail(err); }
}

export async function seatGuestAction(
  entryId: string,
  target: { tableId?: string; groupId?: string },
): Promise<Result> {
  try {
    const entry = await loadEntry(entryId);
    await assertOutletAccess(entry.outlet_id);
    // seat_guest is a single transaction: it claims the table and moves the
    // entry together, so two hosts tapping the same table race safely.
    const { error } = await createAdminSupabase().rpc("seat_guest", {
      p_entry: entryId,
      p_table: target.tableId ?? null,
      p_group: target.groupId ?? null,
    });
    if (error) throw new Error(error.message);
    await audit(entry.outlet_id, "seat_guest", entryId, target);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) { return fail(err); }
}

export async function closeEntryAction(
  entryId: string,
  status: "no_show" | "left" | "cancelled",
): Promise<Result> {
  try {
    const entry = await loadEntry(entryId);
    await assertOutletAccess(entry.outlet_id);
    await closeEntry(entryId, status, { notify: status !== "cancelled" });
    await audit(entry.outlet_id, `close_${status}`, entryId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) { return fail(err); }
}

export async function setPriorityAction(entryId: string, priority: number): Promise<Result> {
  try {
    const entry = await loadEntry(entryId);
    await assertOutletAccess(entry.outlet_id);
    await createAdminSupabase().from("queue_entries")
      .update({ priority }).eq("id", entryId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) { return fail(err); }
}

const WalkInSchema = z.object({
  outletId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  phone: z.string().optional(),
  partySize: z.coerce.number().int().min(1).max(30),
  notes: z.string().trim().max(200).optional(),
});

/** Host adds someone who walked up to the desk without scanning. */
export async function addWalkInAction(formData: FormData): Promise<Result> {
  try {
    const input = WalkInSchema.parse({
      outletId: formData.get("outletId"),
      name: formData.get("name"),
      phone: formData.get("phone") || undefined,
      partySize: formData.get("partySize"),
      notes: formData.get("notes") || undefined,
    });
    const session = await assertOutletAccess(input.outletId);
    const outlet = session.outlets.find((o) => o.id === input.outletId)!;

    const phone = input.phone ? normalisePhone(input.phone) : null;
    if (input.phone && !phone) {
      return { ok: false, error: "That doesn't look like an Indian mobile number" };
    }

    if (phone) {
      await joinQueue({
        outletSlug: outlet.slug, guestName: input.name, phone,
        partySize: input.partySize, notes: input.notes ?? null, source: "walkin",
      });
    } else {
      // No number means no WhatsApp — the host will call this party by name.
      const db = createAdminSupabase();
      const { data: code } = await db.rpc("next_ticket_code", { p_outlet: input.outletId });
      await db.from("queue_entries").insert({
        outlet_id: input.outletId,
        ticket_code: (code as string) ?? `W${Date.now() % 100}`,
        guest_name: input.name,
        party_size: input.partySize,
        notes: input.notes ?? null,
        source: "walkin",
        notify_failed: true,
      });
    }

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) { return fail(err); }
}

// ------------------------------------------------------------ table actions
export async function setTableStatusAction(
  tableId: string, status: TableStatus,
): Promise<Result> {
  try {
    const db = createAdminSupabase();
    const { data } = await db.from("restaurant_tables")
      .select("outlet_id, merged_group_id").eq("id", tableId).single();
    if (!data) throw new Error("Table not found");
    const row = data as { outlet_id: string; merged_group_id: string | null };
    await assertOutletAccess(row.outlet_id);

    if (status === "free" || status === "clearing") {
      // Going free or to clearing closes the open session — that's what turn
      // time is measured from.
      const { error } = await db.rpc("clear_table", { p_table: tableId, p_to: status });
      if (error) throw new Error(error.message);
    } else if (row.merged_group_id) {
      await db.from("table_groups").update({ status }).eq("id", row.merged_group_id);
      await db.from("restaurant_tables").update({ status }).eq("merged_group_id", row.merged_group_id);
    } else {
      await db.from("restaurant_tables").update({ status }).eq("id", tableId);
    }

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) { return fail(err); }
}

const TableSchema = z.object({
  id: z.string().uuid().optional(),
  outlet_id: z.string().uuid(),
  floor_id: z.string().uuid(),
  zone_id: z.string().uuid(),
  label: z.string().trim().min(1).max(12),
  shape: z.enum(["round", "square", "rect", "booth"]),
  capacity: z.coerce.number().int().min(1).max(30),
  pos_x: z.coerce.number(),
  pos_z: z.coerce.number(),
  rot_y: z.coerce.number(),
  width: z.coerce.number().min(0.3).max(10),
  depth: z.coerce.number().min(0.3).max(10),
});

export async function upsertTableAction(
  input: Partial<RestaurantTable> & { id?: string },
): Promise<Result> {
  try {
    const db = createAdminSupabase();

    // Position-only drags are the hot path in the 3D editor — patch without
    // demanding the whole row.
    if (input.id && input.outlet_id === undefined) {
      const { data } = await db.from("restaurant_tables")
        .select("outlet_id").eq("id", input.id).single();
      if (!data) throw new Error("Table not found");
      input = { ...input, outlet_id: (data as { outlet_id: string }).outlet_id };
    }

    const session = await assertOutletAccess(input.outlet_id!);
    if (!session.canEdit) throw new Error("Manager access required to edit the floor plan");

    if (input.id) {
      const patch = Object.fromEntries(
        Object.entries(input).filter(([k, v]) => v !== undefined && k !== "id" && k !== "outlet_id"),
      );
      const { error } = await db.from("restaurant_tables").update(patch).eq("id", input.id);
      if (error) throw new Error(error.message);
    } else {
      const parsed = TableSchema.parse(input);
      const { error } = await db.from("restaurant_tables").insert(parsed);
      if (error) throw new Error(error.message);
      await audit(parsed.outlet_id, "table_create", parsed.label);
    }

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) { return fail(err); }
}

export async function deleteTableAction(tableId: string): Promise<Result> {
  try {
    const db = createAdminSupabase();
    const { data } = await db.from("restaurant_tables")
      .select("outlet_id, label, status").eq("id", tableId).single();
    if (!data) throw new Error("Table not found");
    const row = data as { outlet_id: string; label: string; status: TableStatus };

    const session = await assertOutletAccess(row.outlet_id);
    if (!session.canEdit) throw new Error("Manager access required");
    if (row.status === "occupied") throw new Error("Can't delete a table that's occupied");

    await db.from("restaurant_tables").delete().eq("id", tableId);
    await audit(row.outlet_id, "table_delete", row.label);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) { return fail(err); }
}

export async function mergeTablesAction(tableIds: string[], label?: string): Promise<Result> {
  try {
    const db = createAdminSupabase();
    const { data } = await db.from("restaurant_tables")
      .select("outlet_id").in("id", tableIds).limit(1).single();
    if (!data) throw new Error("Tables not found");
    const outletId = (data as { outlet_id: string }).outlet_id;

    const session = await assertOutletAccess(outletId);
    if (!session.canEdit) throw new Error("Manager access required to merge tables");

    const { error } = await db.rpc("merge_tables", { p_ids: tableIds, p_label: label ?? null });
    if (error) throw new Error(error.message);
    await audit(outletId, "tables_merge", label, { tableIds });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) { return fail(err); }
}

export async function unmergeGroupAction(groupId: string): Promise<Result> {
  try {
    const db = createAdminSupabase();
    const { data } = await db.from("table_groups")
      .select("outlet_id, label").eq("id", groupId).single();
    if (!data) throw new Error("Merged table not found");
    const row = data as { outlet_id: string; label: string };

    const session = await assertOutletAccess(row.outlet_id);
    if (!session.canEdit) throw new Error("Manager access required");

    const { error } = await db.rpc("unmerge_group", { p_group: groupId });
    if (error) throw new Error(error.message);
    await audit(row.outlet_id, "tables_unmerge", row.label);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) { return fail(err); }
}

// ------------------------------------------------------------------ helpers
async function loadEntry(entryId: string) {
  const { data } = await createAdminSupabase()
    .from("queue_entries").select("id, outlet_id").eq("id", entryId).single();
  if (!data) throw new Error("Queue entry not found");
  return data as { id: string; outlet_id: string };
}

export async function switchOutletAction(outletId: string) {
  const { cookies } = await import("next/headers");
  await assertOutletAccess(outletId);
  const store = await cookies();
  store.set("baari_outlet", outletId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/dashboard");
}
