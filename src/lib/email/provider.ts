import "server-only";
import { getGoogleAccessToken, isGoogleConfigured } from "@/lib/google/auth";

/**
 * Transactional email, behind the same abstraction as WhatsApp.
 *
 * Structured to mirror lib/whatsapp/provider.ts deliberately: one interface,
 * a module-level cached singleton, selection by env var, and a mock default so
 * the entire lead flow is demoable with zero credentials.
 *
 * Like the WhatsApp provider after the hardening pass, a misconfigured
 * environment degrades to mock with a loud error rather than throwing — losing
 * a lead because a refresh token expired is far worse than losing the email.
 */

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(args: SendEmailArgs): Promise<EmailSendResult>;
}

function fromHeader(): string {
  const name = process.env.EMAIL_FROM_NAME ?? "Baari";
  const addr = process.env.EMAIL_FROM ?? process.env.OWNER_EMAIL ?? "noreply@example.com";
  // RFC 2047 encode the display name so a non-ASCII brand doesn't mojibake.
  const encoded = /^[\x20-\x7E]*$/.test(name)
    ? `"${name.replace(/"/g, "")}"`
    : `=?UTF-8?B?${Buffer.from(name).toString("base64")}?=`;
  return `${encoded} <${addr}>`;
}

/** Subjects routinely contain an em dash, which must not go out as raw 8-bit. */
function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
}

// --------------------------------------------------------------------- mock

class MockEmailProvider implements EmailProvider {
  readonly name = "mock";

  async send(args: SendEmailArgs): Promise<EmailSendResult> {
    // Pull every action URL out of the HTML so a developer can paste an approve
    // or decline link straight into a browser and drive the whole flow without
    // an inbox. This is the email analogue of the WhatsApp mock printing
    // renderPreview().
    const links = [...args.html.matchAll(/href="([^"]+\/(?:m|b)\/[^"]+)"/g)].map((m) => m[1]);
    console.info(
      `\n[email:mock] -> ${args.to}\n  subject: ${args.subject}\n` +
      `${args.text.split("\n").map((l) => `  | ${l}`).join("\n")}\n` +
      (links.length ? `  action links:\n${links.map((l) => `    ${l}`).join("\n")}\n` : ""),
    );
    return { ok: true, providerMessageId: `mock_${crypto.randomUUID()}` };
  }
}

// -------------------------------------------------------------------- gmail

class GmailProvider implements EmailProvider {
  readonly name = "gmail";

  async send(args: SendEmailArgs): Promise<EmailSendResult> {
    try {
      const token = await getGoogleAccessToken();

      // multipart/alternative so clients that refuse HTML still get a readable
      // message, which also helps deliverability.
      const boundary = `baari_${crypto.randomUUID().replace(/-/g, "")}`;
      const headers = [
        `From: ${fromHeader()}`,
        `To: ${args.to}`,
        args.replyTo ? `Reply-To: ${args.replyTo}` : null,
        `Subject: ${encodeSubject(args.subject)}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ].filter(Boolean).join("\r\n");

      const body = [
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(args.text).toString("base64"),
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(args.html).toString("base64"),
        `--${boundary}--`,
        "",
      ].join("\r\n");

      const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          // base64url, not base64 — the Gmail API rejects +/ and padding here.
          body: JSON.stringify({ raw: Buffer.from(headers + "\r\n" + body).toString("base64url") }),
        },
      );

      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
      if (!res.ok || json.error) {
        return { ok: false, error: json.error?.message ?? `gmail http ${res.status}` };
      }
      return { ok: true, providerMessageId: json.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "gmail send failed" };
    }
  }
}

// ------------------------------------------------------------------- resend

class ResendProvider implements EmailProvider {
  readonly name = "resend";

  constructor(private readonly apiKey: string) {}

  async send(args: SendEmailArgs): Promise<EmailSendResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromHeader(),
          to: [args.to],
          subject: args.subject,
          html: args.html,
          text: args.text,
          reply_to: args.replyTo,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) return { ok: false, error: json.message ?? `resend http ${res.status}` };
      return { ok: true, providerMessageId: json.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "resend send failed" };
    }
  }
}

// ----------------------------------------------------------------- selection

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;

  const kind = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase();
  const dryRun = process.env.EMAIL_DRY_RUN === "true";

  if (dryRun && kind !== "mock") {
    console.info(`[email] EMAIL_DRY_RUN is on — ${kind} credentials ignored, logging instead.`);
    cached = new MockEmailProvider();
    return cached;
  }

  switch (kind) {
    case "gmail":
      if (!isGoogleConfigured()) {
        console.error("[email] EMAIL_PROVIDER=gmail but Google OAuth is not configured — falling back to mock.");
        cached = new MockEmailProvider();
        break;
      }
      cached = new GmailProvider();
      break;

    case "resend": {
      const key = process.env.RESEND_API_KEY;
      if (!key) {
        console.error("[email] EMAIL_PROVIDER=resend but RESEND_API_KEY is unset — falling back to mock.");
        cached = new MockEmailProvider();
        break;
      }
      cached = new ResendProvider(key);
      break;
    }

    default:
      cached = new MockEmailProvider();
  }

  return cached;
}

/** Tests and the mock-vs-live switch in dev. */
export function resetEmailProvider() {
  cached = null;
}
