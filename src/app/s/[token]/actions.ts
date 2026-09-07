"use server";

import { revalidatePath } from "next/cache";
import { getGuestStatus, closeEntry } from "@/lib/domain/queue";

export async function leaveQueueAction(token: string) {
  const status = await getGuestStatus(token);
  if (!status) return { error: "We couldn't find your place in line" };
  // The guest chose to go — no "sorry we missed you" message for that.
  await closeEntry(status.entry.id, "left", { notify: false });
  revalidatePath(`/s/${token}`);
  return { ok: true };
}
