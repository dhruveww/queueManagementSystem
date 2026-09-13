import type { Lead } from "@/lib/types";
import { formatIstSlot } from "@/lib/meetings/time";
import {
  C, FONT, button, detailRow, emailShell, esc, eyebrow, gap, headline, quoteBlock, rule, slotCard,
} from "./theme";

/**
 * Every email Baari sends to a person who is not a guest.
 *
 * One registry, each entry returning { subject, html, text } — the same
 * single-source-of-truth shape as TEMPLATES in lib/whatsapp/templates.ts, so
 * the mock provider, the real provider and any preview all read from one place.
 *
 * Plain-text alternatives are real, not afterthoughts: they matter for
 * deliverability, and they are what the mock provider prints to the console.
 */

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const MAX_FREE_TEXT = 800;

/** Gmail clips at ~102KB and the clip hides the footer, so long free text is trimmed here. */
function trim(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > MAX_FREE_TEXT ? `${t.slice(0, MAX_FREE_TEXT)}…` : t;
}

function slotOf(lead: Lead): string {
  if (!lead.slot_start || !lead.slot_end) return "no time chosen yet";
  return formatIstSlot(lead.slot_start, lead.slot_end);
}

// ------------------------------------------------------- owner: new lead

export function ownerNewLead(lead: Lead, links: {
  approve: string; reschedule: string; decline: string;
}): BuiltEmail {
  const requests = trim(lead.requests);
  const pricing = trim(lead.pricing_note);
  const slot = slotOf(lead);
  const waNumber = lead.phone_e164.replace(/^\+/, "");

  const html = emailShell({
    preheader: `${lead.restaurant_name}, ${lead.city} · ${lead.outlets_count} outlet${lead.outlets_count === 1 ? "" : "s"} · ${slot}`,
    footNote: "One tap confirms on the next screen — nothing changes until you do. Links expire in 14 days.",
    children: [
      eyebrow("New lead"),
      headline(lead.restaurant_name, lead.city),
      gap(14),
      slotCard({ label: "Requested slot", slot, note: "Held tentatively on your calendar." }),

      `<tr><td>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${detailRow("Contact", lead.contact_name)}
          ${detailRow("Phone", `<a href="https://wa.me/${esc(waNumber)}" style="color:${C.saffronLight};text-decoration:none;">${esc(lead.phone_e164)}</a>`, true)}
          ${detailRow("Email", `<a href="mailto:${esc(lead.email)}" style="color:${C.saffronLight};text-decoration:none;">${esc(lead.email)}</a>`, true)}
          ${detailRow("Outlets", String(lead.outlets_count))}
        </table>
      </td></tr>`,

      requests ? `${gap(18)}<tr><td>${quoteBlock("What they asked", requests)}</td></tr>` : "",
      pricing ? `${gap(14)}<tr><td>${quoteBlock("Pricing note — needs a decision", pricing, C.emerald)}</td></tr>` : "",

      gap(26),
      rule(),
      gap(20),

      // Stacked, never side by side: Outlook breaks multi-column buttons, and a
      // mis-tap that declines a lead cannot be undone.
      `<tr><td>${button({ href: links.approve, label: "Approve this call", variant: "primary" })}</td></tr>`,
      gap(10),
      `<tr><td>${button({ href: links.reschedule, label: "Suggest other times", variant: "ghost" })}</td></tr>`,
      gap(10),
      `<tr><td>${button({ href: links.decline, label: "Decline", variant: "danger" })}</td></tr>`,
    ].join(""),
  });

  const text = [
    `NEW LEAD — ${lead.restaurant_name}, ${lead.city}`,
    ``,
    `Requested slot: ${slot} (held tentatively)`,
    `Contact:  ${lead.contact_name}`,
    `Phone:    ${lead.phone_e164}`,
    `Email:    ${lead.email}`,
    `Outlets:  ${lead.outlets_count}`,
    requests ? `\nWhat they asked:\n${requests}` : "",
    pricing ? `\nPricing note:\n${pricing}` : "",
    ``,
    `Approve:          ${links.approve}`,
    `Suggest others:   ${links.reschedule}`,
    `Decline:          ${links.decline}`,
    ``,
    `Each link opens a confirmation page — nothing changes until you tap through.`,
  ].filter((l) => l !== "").join("\n");

  return {
    subject: `${lead.restaurant_name} (${lead.city}) wants a Baari demo — ${slot}`,
    html,
    text,
  };
}

// ---------------------------------------------------- lead: confirmed

export function leadConfirmed(lead: Lead): BuiltEmail {
  const slot = slotOf(lead);
  const first = lead.contact_name.split(" ")[0] || "there";

  const html = emailShell({
    preheader: `Confirmed — ${slot}`,
    footNote: "Need to move it? Just reply to this email.",
    children: [
      eyebrow("Confirmed", C.emerald),
      headline(`See you ${slot.split(" · ")[0]},`, first),
      gap(12),
      `<tr><td style="font-family:${FONT.body};font-size:15px;line-height:1.6;color:${C.text};padding-bottom:18px;">
        Your intro call is locked in. A calendar invite is on its way separately.
      </td></tr>`,
      slotCard({ label: "Your call", slot, note: `About ${lead.restaurant_name} · 1 hour` }),
      lead.meet_url
        ? `<tr><td>${button({ href: lead.meet_url, label: "Join on Google Meet", variant: "primary" })}</td></tr>${gap(20)}`
        : gap(4),
      `<tr><td>
        <div style="font-family:${FONT.mono};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${C.faint};padding-bottom:9px;">What we'll cover</div>
        <div style="font-family:${FONT.body};font-size:14px;line-height:1.75;color:${C.text};">
          · Your floor — how many tables, how many floors, where the queue jams<br>
          · A live walk-through of the 3D floor plan and table merging<br>
          · WhatsApp setup, and what Meta needs from you<br>
          · Pricing for ${esc(String(lead.outlets_count))} outlet${lead.outlets_count === 1 ? "" : "s"}
        </div>
      </td></tr>`,
    ].join(""),
  });

  const text = [
    `Confirmed — ${slot}`,
    ``,
    `Hi ${first}, your Baari intro call is locked in.`,
    `A calendar invite is on its way separately.`,
    lead.meet_url ? `\nJoin: ${lead.meet_url}` : "",
    ``,
    `What we'll cover:`,
    `- Your floor: tables, floors, where the queue jams`,
    `- The 3D floor plan and table merging, live`,
    `- WhatsApp setup and what Meta needs`,
    `- Pricing for ${lead.outlets_count} outlet(s)`,
  ].filter((l) => l !== "").join("\n");

  return { subject: `Confirmed — your Baari call, ${slot}`, html, text };
}

// --------------------------------------------------- lead: reschedule

export function leadReschedule(lead: Lead, options: { iso: string; label: string; href: string }[]): BuiltEmail {
  const first = lead.contact_name.split(" ")[0] || "there";
  const note = trim(lead.owner_note);

  const html = emailShell({
    preheader: `A few other times for your Baari call`,
    footNote: "These links expire in 7 days. Reply to this email if none of them work.",
    children: [
      eyebrow("New times"),
      headline("Could we try", "another slot?"),
      gap(12),
      `<tr><td style="font-family:${FONT.body};font-size:15px;line-height:1.6;color:${C.text};padding-bottom:16px;">
        Hi ${esc(first)} — that time just stopped working on our side. Any of these good?
      </td></tr>`,
      note ? `<tr><td>${quoteBlock("Note from Dhruvi", note)}</td></tr>${gap(18)}` : "",
      ...options.flatMap((o) => [
        `<tr><td>${button({ href: o.href, label: o.label, variant: "ghost" })}</td></tr>`,
        gap(10),
      ]),
    ].join(""),
  });

  const text = [
    `Hi ${first} — that time stopped working on our side. Any of these?`,
    note ? `\n${note}\n` : "",
    ...options.map((o) => `${o.label}\n  ${o.href}`),
    ``,
    `Reply to this email if none of them work.`,
  ].filter((l) => l !== "").join("\n");

  return { subject: "A few other times for your Baari call", html, text };
}

// ----------------------------------------------------- lead: declined

export function leadDeclined(lead: Lead): BuiltEmail {
  const first = lead.contact_name.split(" ")[0] || "there";
  const note = trim(lead.owner_note);
  const owner = process.env.OWNER_EMAIL ?? "dhruvi0326@gmail.com";

  const html = emailShell({
    preheader: "About your Baari demo request",
    footNote: "Baari — WhatsApp-first virtual queuing for Indian restaurants.",
    children: [
      eyebrow("Thanks for asking", C.muted),
      headline("Not right now,", "but do stay in touch."),
      gap(12),
      `<tr><td style="font-family:${FONT.body};font-size:15px;line-height:1.6;color:${C.text};padding-bottom:16px;">
        Hi ${esc(first)} — thank you for looking at Baari for ${esc(lead.restaurant_name)}.
        We can't take this one on at the moment, but the door is genuinely open:
        reply here any time and we'll pick it straight back up.
      </td></tr>`,
      note ? `<tr><td>${quoteBlock("Note", note)}</td></tr>${gap(18)}` : "",
      `<tr><td>${button({ href: `mailto:${owner}`, label: "Reply to Dhruvi", variant: "ghost" })}</td></tr>`,
    ].join(""),
  });

  const text = [
    `Hi ${first},`,
    ``,
    `Thank you for looking at Baari for ${lead.restaurant_name}. We can't take this`,
    `one on right now, but the door is open — reply any time.`,
    note ? `\n${note}` : "",
    ``,
    owner,
  ].filter((l) => l !== "").join("\n");

  return { subject: "About your Baari demo request", html, text };
}

// -------------------------------------------------- lead: acknowledgement

export function leadReceived(lead: Lead): BuiltEmail {
  const first = lead.contact_name.split(" ")[0] || "there";
  const slot = slotOf(lead);

  const html = emailShell({
    preheader: `We've got your request — ${slot}`,
    footNote: "You'll hear from a human, usually the same day.",
    children: [
      eyebrow("Got it"),
      headline("We've got your", "request."),
      gap(12),
      `<tr><td style="font-family:${FONT.body};font-size:15px;line-height:1.6;color:${C.text};padding-bottom:16px;">
        Thanks ${esc(first)} — we're holding this slot while Dhruvi confirms.
        You'll get a note either way, usually the same day.
      </td></tr>`,
      slotCard({ label: "Requested", slot, note: "Not confirmed yet." }),
    ].join(""),
  });

  const text = [
    `Thanks ${first} — we've got your request for ${lead.restaurant_name}.`,
    ``,
    `Requested: ${slot} (not confirmed yet)`,
    `We're holding it while Dhruvi confirms. You'll hear back either way,`,
    `usually the same day.`,
  ].join("\n");

  return { subject: "We've got your Baari request", html, text };
}
