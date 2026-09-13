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
    const session = await assertOutletAccess(entry.outlet_id);
    // seat_guest is a single transaction: it claims the table and moves the
    // entry together, so two hosts tapping the same table race safely.
    // The acting host is passed explicitly — the service-role client carries no
    // auth.uid(), so the function can't derive it (see migration 0004).
    const { error } = await createAdminSupabase().rpc("seat_guest", {
      p_entry: entryId,
      p_table: target.tableId ?? null,
      p_group: target.groupId ?? null,
      p_seated_by: session.user.id,
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
      // Allowlist, not denylist. This previously stripped only `id` and
      // `outlet_id` and passed everything else straight to the update, but
      // `input` is a server-action argument the client fully controls — so a
      // manager could set `merged_group_id` to a group in another outlet
      // (nothing in SQL constrains that FK to the same tenant), or rewrite
      // `status`, `created_at`, or `zone_id`/`floor_id` to a foreign floor.
      // These are exactly the columns the 3D editor's drag/resize path sends.
      const EDITABLE = [
        "pos_x", "pos_z", "rot_y", "width", "depth",
        "label", "capacity", "shape", "zone_id", "floor_id", "sort_index",
      ] as const;

      const patch = Object.fromEntries(
        EDITABLE.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]),
      );
      if (Object.keys(patch).length === 0) throw new Error("Nothing to update");

      // A zone or floor can only be swapped for one in the same outlet.
      for (const key of ["zone_id", "floor_id"] as const) {
        const value = patch[key];
        if (value == null) continue;
        const table = key === "zone_id" ? "zones" : "floors";
        const { data: owner } = await db.from(table)
          .select("outlet_id").eq("id", value).single();
        if (!owner || (owner as { outlet_id: string }).outlet_id !== input.outlet_id) {
          throw new Error(`That ${key === "zone_id" ? "zone" : "floor"} belongs to another outlet`);
        }
      }

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

    // `tableIds` is caller-supplied. This used to resolve the outlet from one
    // arbitrary row (.limit(1) with no ORDER BY) and authorise against that, so
    // a manager could slip a table belonging to another restaurant into the
    // array and — depending on which row Postgres happened to return — pass the
    // access check. Load them all and require a single, authorised outlet.
    const { data: rows } = await db.from("restaurant_tables")
      .select("id, outlet_id").in("id", tableIds);
    const tables = (rows ?? []) as { id: string; outlet_id: string }[];

    const wanted = new Set(tableIds);
    if (wanted.size < 2) throw new Error("Pick at least two tables to merge");
    if (tables.length !== wanted.size) throw new Error("Tables not found");

    const outletIds = new Set(tables.map((t) => t.outlet_id));
    if (outletIds.size !== 1) throw new Error("Every table in a merge must belong to one outlet");
    const outletId = tables[0].outlet_id;

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
  store.set("baari_outlet", outletId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/dashboard");
}
