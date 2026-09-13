"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { joinQueue, guestToken, getOutletBySlug } from "@/lib/domain/queue";
import { normalisePhone } from "@/lib/domain/phone";
import { clientIp, enforceJoinLimit, hashIp, isHoneypotTripped } from "@/lib/rateLimit";

const JoinSchema = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(2, "Please enter your name").max(60),
  phone: z.string().min(6, "Enter your WhatsApp number"),
  partySize: z.coerce.number().int().min(1).max(30),
  zonePref: z.enum(["indoor", "outdoor", "ac", "rooftop", "bar", "private"]).nullable().optional(),
  notes: z.string().trim().max(200).optional(),
  consent: z.literal("on", { message: "We need your consent to message you on WhatsApp" }),
});

export type JoinState = { error?: string; fieldErrors?: Record<string, string> };

export async function joinQueueAction(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const parsed = JoinSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    partySize: formData.get("partySize"),
    zonePref: formData.get("zonePref") || null,
    notes: formData.get("notes") || undefined,
    consent: formData.get("consent"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const phone = normalisePhone(parsed.data.phone);
  if (!phone) {
    return { fieldErrors: { phone: "That doesn't look like an Indian mobile number" } };
  }

  // A bot that filled the hidden field gets a plausible-looking success and no
  // row, so it has nothing to tune against. Nothing is sent and nothing is
  // billed; from the attacker's side the endpoint simply looks like it worked.
  if (isHoneypotTripped(formData.get("company_website"))) {
    console.warn("[join] honeypot tripped — ignoring submission");
    redirect("/");
  }

  // Resolve the outlet before the limiter so the per-outlet ceiling is scoped
  // to a real restaurant rather than to whatever slug was typed.
  const found = await getOutletBySlug(parsed.data.slug);
  if (!found) return { error: "Restaurant not found" };

  const ip = await clientIp();
  const limit = await enforceJoinLimit(found.outlet.id, ip);
  if (!limit.ok) return { error: limit.error };

  let token: string;
  try {
    const result = await joinQueue({
      outletSlug: parsed.data.slug,
      guestName: parsed.data.name,
      phone,
      partySize: parsed.data.partySize,
      zonePref: parsed.data.zonePref ?? null,
      notes: parsed.data.notes ?? null,
      ipHash: hashIp(ip),
    });
    token = guestToken(result.entry);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }

  redirect(`/s/${token}`);
}
