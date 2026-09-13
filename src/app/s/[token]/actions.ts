"use server";

import { revalidatePath } from "next/cache";
import { getGuestStatus, closeEntry } from "@/lib/domain/queue";
import { clientIp, enforceLeaveLimit } from "@/lib/rateLimit";

export async function leaveQueueAction(token: string) {
  // The token is a bearer capability in a URL that gets shared via the OS share
  // sheet and the clipboard. It is long enough not to be guessable, but there
  // was no attempt counter at all, so a slow scan cost an attacker nothing.
  // This sends no messages and cannot spend money, so an in-memory guard is
  // proportionate — no database round trip on the hot path.
  const limit = enforceLeaveLimit(await clientIp());
  if (!limit.ok) return { error: limit.error };

  const status = await getGuestStatus(token);
  if (!status) return { error: "We couldn't find your place in line" };
  // The guest chose to go — no "sorry we missed you" message for that.
  await closeEntry(status.entry.id, "left", { notify: false });
  revalidatePath(`/s/${token}`);
  return { ok: true };
}
