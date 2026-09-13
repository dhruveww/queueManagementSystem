import "server-only";

/**
 * Google OAuth — refresh-token flow for a single account (the owner's).
 *
 * A service account is deliberately not used: this needs to act as a specific
 * human on their own Gmail and their own calendar, and a service account has
 * neither without domain-wide delegation (which needs Workspace).
 *
 * Raw fetch rather than googleapis — the same choice MetaCloudProvider makes,
 * and it keeps a ~50MB dependency out of a serverless bundle for two endpoints.
 */

export class GoogleAuthError extends Error {
  constructor(message: string, readonly fatal: boolean) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN,
  );
}

// Access tokens last an hour; cache in module scope and refresh a minute early.
// Serverless instances are short-lived, so this is a cheap win, not a leak.
let token: { value: string; expiresAt: number } | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;

  if (!isGoogleConfigured()) {
    throw new GoogleAuthError("Google OAuth env vars are not set", true);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string; expires_in?: number; error?: string; error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    // `invalid_grant` is the one that will actually happen in production: the
    // refresh token was revoked, the account password changed, or — by far the
    // most likely — the OAuth consent screen is still in "Testing", where
    // Google expires refresh tokens after seven days. Flagged fatal so callers
    // can surface it rather than retrying into the same wall.
    const fatal = json.error === "invalid_grant";
    throw new GoogleAuthError(
      `${json.error ?? `http ${res.status}`}: ${json.error_description ?? "token refresh failed"}` +
      (fatal ? " — if the consent screen is still in Testing mode, publish it and re-mint the refresh token" : ""),
      fatal,
    );
  }

  token = {
    value: json.access_token,
    expiresAt: Date.now() + ((json.expires_in ?? 3600) - 60) * 1000,
  };
  return token.value;
}

export function resetGoogleToken() {
  token = null;
}
