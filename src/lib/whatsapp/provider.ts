/**
 * WhatsApp provider adapters.
 *
 * Baari sends through one of: Meta's Cloud API directly, or a BSP (Gupshup /
 * Interakt / Wati). They differ only in transport, so everything above this
 * file talks to `WhatsAppProvider`. `mock` is the local-dev default — it logs
 * the rendered message and returns a fake message id, so the whole queue
 * lifecycle is testable without a Meta account.
 *
 * There is deliberately no SMS adapter. A failed WhatsApp send flags the queue
 * entry so the host can phone the guest; it never falls through to a paid
 * channel.
 */

import type { NotifTemplate } from "@/lib/types";
import { TEMPLATES, renderPreview } from "./templates";

export interface SendArgs {
  to: string;                 // E.164, no leading +
  template: NotifTemplate;
  params: string[];
  /** Appended to a URL button, e.g. the guest's live-status page path. */
  buttonUrlSuffix?: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** True when the number simply isn't on WhatsApp — the host must call instead. */
  unreachable?: boolean;
}

export interface WhatsAppProvider {
  readonly name: string;
  send(args: SendArgs): Promise<SendResult>;
}

// ------------------------------------------------------------ Meta Cloud API
class MetaCloudProvider implements WhatsAppProvider {
  readonly name = "meta_cloud";

  constructor(
    private phoneNumberId: string,
    private accessToken: string,
    private apiVersion = "v21.0",
  ) {}

  async send({ to, template, params, buttonUrlSuffix }: SendArgs): Promise<SendResult> {
    const def = TEMPLATES[template];
    const components: unknown[] = [
      { type: "body", parameters: params.map((text) => ({ type: "text", text })) },
    ];
    if (buttonUrlSuffix && def.buttons?.[0]?.type === "url") {
      components.push({
        type: "button", sub_type: "url", index: "0",
        parameters: [{ type: "text", text: buttonUrlSuffix }],
      });
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: def.name,
              language: { code: def.language },
              components,
            },
          }),
        },
      );

      const json = (await res.json()) as {
        messages?: { id: string }[];
        error?: { message: string; code: number };
      };

      if (!res.ok || json.error) {
        const code = json.error?.code;
        return {
          ok: false,
          error: json.error?.message ?? `HTTP ${res.status}`,
          // 131026: message undeliverable — usually "not a WhatsApp user".
          unreachable: code === 131026 || code === 131047,
        };
      }
      return { ok: true, providerMessageId: json.messages?.[0]?.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

// ------------------------------------------------------------------ Gupshup
class GupshupProvider implements WhatsAppProvider {
  readonly name = "gupshup";

  constructor(private apiKey: string, private source: string) {}

  async send({ to, template, params }: SendArgs): Promise<SendResult> {
    const def = TEMPLATES[template];
    try {
      const res = await fetch("https://api.gupshup.io/wa/api/v1/template/msg", {
        method: "POST",
        headers: {
          apikey: this.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          source: this.source,
          destination: to,
          "src.name": "Baari",
          template: JSON.stringify({ id: def.name, params }),
        }),
      });
      const json = (await res.json()) as { messageId?: string; message?: string };
      if (!res.ok) return { ok: false, error: json.message ?? `HTTP ${res.status}` };
      return { ok: true, providerMessageId: json.messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

// --------------------------------------------------------------------- mock
class MockProvider implements WhatsAppProvider {
  readonly name = "mock";

  async send({ to, template, params }: SendArgs): Promise<SendResult> {
    // Numbers ending in 0000 simulate "not on WhatsApp" so the host-fallback
    // path is exercisable in dev.
    if (to.endsWith("0000")) {
      return { ok: false, error: "mock: not a WhatsApp user", unreachable: true };
    }
    console.info(`[whatsapp:mock] -> +${to}\n  ${renderPreview(template, params)}`);
    return { ok: true, providerMessageId: `mock_${crypto.randomUUID()}` };
  }
}

let cached: WhatsAppProvider | null = null;

export function getProvider(): WhatsAppProvider {
  if (cached) return cached;
  const kind = process.env.WHATSAPP_PROVIDER ?? "mock";

  switch (kind) {
    case "meta_cloud":
      cached = new MetaCloudProvider(
        requireEnv("WHATSAPP_PHONE_NUMBER_ID"),
        requireEnv("WHATSAPP_ACCESS_TOKEN"),
      );
      break;
    case "gupshup":
    case "interakt":
      cached = new GupshupProvider(
        requireEnv("WHATSAPP_BSP_API_KEY"),
        requireEnv("WHATSAPP_BSP_SOURCE_NUMBER"),
      );
      break;
    default:
      cached = new MockProvider();
  }
  return cached;
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is required when WHATSAPP_PROVIDER=${process.env.WHATSAPP_PROVIDER}`);
  return v;
}
