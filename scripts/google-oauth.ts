/**
 * Mints a Google refresh token for the owner's account.
 *
 *   npm run google:auth
 *
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local, from an OAuth
 * client of type "Desktop app". Desktop clients are used deliberately: they
 * allow a loopback redirect, so no verified public domain is required.
 *
 * Prints the refresh token to stdout and writes nothing — paste it into
 * .env.local and into Vercel yourself.
 *
 * BEFORE RUNNING: publish the OAuth consent screen. While its status is
 * "Testing", Google expires refresh tokens after seven days, so the booking
 * flow would work all week and then die silently. Console -> APIs & Services
 * -> OAuth consent screen -> PUBLISH APP.
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.\n" +
    "Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth client ID -> Desktop app",
  );
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

const PORT = 8787;
const REDIRECT = `http://localhost:${PORT}/callback`;
const state = randomBytes(16).toString("hex");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent is what actually returns a refresh token. Without
    // prompt=consent Google omits it on every authorisation after the first.
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();

console.log("\nOpen this URL, sign in as the account that owns the calendar:\n");
console.log(`  ${authUrl}\n`);
console.log('You will see "Google hasn\'t verified this app" — that is expected for an');
console.log('unverified internal tool. Choose Advanced -> Go to Baari Ops (unsafe).\n');
console.log(`Waiting on ${REDIRECT} …\n`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const err = url.searchParams.get("error");
  if (err) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(`Authorisation failed: ${err}`);
    console.error(`\nAuthorisation failed: ${err}`);
    server.close();
    process.exit(1);
  }

  if (url.searchParams.get("state") !== state) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("State mismatch.");
    console.error("\nState mismatch — start again.");
    server.close();
    process.exit(1);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("No code returned.");
    server.close();
    process.exit(1);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });

  const json = (await tokenRes.json()) as {
    refresh_token?: string; access_token?: string; error_description?: string; error?: string;
  };

  if (!tokenRes.ok || !json.refresh_token) {
    const why = json.error_description ?? json.error ?? "no refresh_token returned";
    res.writeHead(500, { "Content-Type": "text/html" })
       .end(`<h1>Failed</h1><p>${why}</p><p>You can close this tab.</p>`);
    console.error(`\nToken exchange failed: ${why}`);
    if (!json.refresh_token && json.access_token) {
      console.error(
        "Google returned an access token but no refresh token. That happens when this\n" +
        "account has already authorised the app. Remove it at\n" +
        "https://myaccount.google.com/permissions and run this again.",
      );
    }
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
    `<body style="font-family:system-ui;background:#07090d;color:#e8ecf4;padding:48px">
       <h1 style="color:#ff8112">Done</h1>
       <p>Refresh token printed in your terminal. You can close this tab.</p>
     </body>`,
  );

  console.log("Add these to .env.local and to Vercel:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${json.refresh_token}`);
  console.log(`EMAIL_PROVIDER=gmail`);
  console.log(`MEETING_CALENDAR=google`);
  console.log(`GOOGLE_CALENDAR_ID=primary\n`);
  console.log("Then restart the dev server. Keep EMAIL_DRY_RUN=true for the first run");
  console.log("if you want to watch the wiring without sending anything real.\n");

  server.close();
  process.exit(0);
});

server.listen(PORT);
