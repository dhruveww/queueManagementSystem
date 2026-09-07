/**
 * WhatsApp Business Platform template registry.
 *
 * Every message Baari sends is a pre-approved template — there is no SMS
 * channel and no free-form fallback. Template names here must match what was
 * submitted to Meta (or the BSP) for review; the `whatsapp_templates` table
 * tracks per-org approval state so onboarding can block launch until all six
 * are approved.
 *
 * Body text is kept alongside the definition so the mock provider, the
 * onboarding preview, and the Meta submission all read from one source.
 */

import type { NotifTemplate } from "@/lib/types";

export interface TemplateDef {
  /** Name registered with Meta. */
  name: string;
  language: string;
  /** Ordered body parameter names — index maps to {{1}}, {{2}}, ... */
  params: string[];
  /** Human preview with {{n}} placeholders, used in onboarding + mock sends. */
  body: string;
  /** Quick-reply / URL buttons declared on the template. */
  buttons?: { type: "url" | "quick_reply"; text: string }[];
}

export const TEMPLATES: Record<NotifTemplate, TemplateDef> = {
  queue_confirmation: {
    name: "baari_queue_confirmation",
    language: "en",
    params: ["guest_name", "outlet_name", "ticket_code", "position", "wait_range"],
    body:
      "Hi {{1}}, you're in the line at {{2}}. " +
      "Your token is {{3}} — you're #{{4}} in queue, roughly {{5}} away. " +
      "We'll message you the moment your table is ready.",
    buttons: [{ type: "url", text: "Track my place" }],
  },

  position_update: {
    name: "baari_position_update",
    language: "en",
    params: ["guest_name", "outlet_name", "position", "wait_range"],
    body:
      "{{1}}, you're getting close at {{2}} — #{{3}} in line, about {{4}} to go. " +
      "Good time to start heading over.",
    buttons: [{ type: "url", text: "Track my place" }],
  },

  table_ready: {
    name: "baari_table_ready",
    language: "en",
    params: ["guest_name", "outlet_name", "table_label", "grace_minutes"],
    body:
      "{{1}}, your table is ready at {{2}}! Table {{3}} is being held for you. " +
      "Please come to the host desk within {{4}} minutes.",
    buttons: [{ type: "quick_reply", text: "On my way" }],
  },

  grace_nudge: {
    name: "baari_grace_nudge",
    language: "en",
    params: ["guest_name", "outlet_name", "grace_minutes"],
    body:
      "{{1}}, we're still holding your table at {{2}}. " +
      "We can keep it for {{3}} more minutes before it goes to the next guest.",
    buttons: [{ type: "quick_reply", text: "On my way" }],
  },

  queue_left: {
    name: "baari_queue_left",
    language: "en",
    params: ["guest_name", "outlet_name"],
    body:
      "{{1}}, you've been removed from the line at {{2}}. " +
      "Sorry we missed you — scan the QR at the door any time to join again.",
  },

  feedback_request: {
    name: "baari_feedback_request",
    language: "en",
    params: ["guest_name", "outlet_name"],
    body:
      "Thanks for dining with us, {{1}}! How was your visit to {{2}}? " +
      "Your feedback takes 30 seconds and genuinely helps.",
    buttons: [{ type: "url", text: "Leave feedback" }],
  },
};

/** Fill the preview body — used by the mock provider and the template previewer. */
export function renderPreview(template: NotifTemplate, params: string[]): string {
  return TEMPLATES[template].body.replace(/\{\{(\d+)\}\}/g, (_, i) =>
    params[Number(i) - 1] ?? "");
}
