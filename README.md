# Baari

**Your turn — on WhatsApp.**

Virtual queuing and floor management for Indian restaurants. A guest scans the QR
at your door, joins the line, and walks away. Baari WhatsApps them when their
table is ready. Staff run the whole service from a tablet — a list board on the
Basic plan, a live 3D floor plan on Pro.

*Baari* is "meri baari" — my turn.

---

## Why this shape

- **WhatsApp only, no SMS.** India runs on WhatsApp, and cutting SMS entirely
  removes DLT/DND compliance work and a recurring per-message cost. When a
  WhatsApp message fails, the host gets a "call this guest" flag — that's the
  fallback, not a paid channel.
- **Guests never sign in and never touch the database.** The join page is
  server-rendered and anonymous. Phone numbers are unreachable from any browser
  and auto-purged after a configurable window (DPDP Act 2023).
- **Honest wait times.** Always a range, never a false-precision single number,
  and the app measures its own accuracy so you can see whether to trust it.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 ·
Supabase (Postgres, Realtime, Auth) · react-three-fiber · Recharts · Razorpay ·
Vercel

## Getting started

```bash
npm install
cp .env.example .env.local        # fill in Supabase at minimum
```

Create a Supabase project, then apply the schema:

```bash
supabase link --project-ref <ref>
npm run db:push
```

Seed a demo restaurant with three floors, 28 tables and 30 days of history:

```bash
npm run seed
```

Then create a staff login in Supabase Auth and link it (the seed prints the
exact SQL, with the org id filled in):

```sql
insert into staff_users (id, org_id, full_name, email, role)
values ('<auth-user-uuid>', '<org-id>', 'Demo Manager', 'you@example.com', 'owner');
```

```bash
npm run dev
```

- Guest join page — `/q/thindi-house-indiranagar`
- Staff dashboard — `/dashboard`

`WHATSAPP_PROVIDER=mock` (the default) prints rendered messages to your terminal
instead of calling Meta, so you can walk the entire queue lifecycle with no
WhatsApp account. A number ending in `0000` simulates "not on WhatsApp" and
exercises the host-fallback path.

## What's in it

### Guest
QR → mobile page (name, WhatsApp number, party size, seating preference, notes,
explicit consent) → live position, wait range, leave-queue, notify-a-friend.
No app, no login. Targets a fast first load on a doorway 4G connection.

### WhatsApp
Six pre-approved templates covering the whole lifecycle: confirmation, "you're
getting close", table ready, grace nudge, queue left, post-visit feedback.
Delivery and read receipts flow back through a signed webhook; an "On my way"
quick reply checks the guest in automatically. Adapters for Meta Cloud API,
Gupshup/Interakt, and a local mock.

### Staff — Basic
Live queue board with one-tap notify / seat / no-show / VIP-bump, manual
walk-in entry, and a table status grid. Realtime across every device.

### Staff — Pro
A 3D floor plan: multi-floor switching, full orbit camera, live colour-coded
table status, floating editable table numbers, zone heatmap overlay, and
tap-a-guest-then-tap-a-table seating. Managers get a drag-and-drop editor to add,
move, rotate, resize, renumber, merge and un-merge tables directly on the plan.

### Analytics (both plans)
Live snapshot · period-over-period deltas · queue funnel with step conversion ·
abandonment by wait-time bucket · volume and wait by hour · peak-window heatmap
(hour × day of week) · daily trends · new vs returning guests · WhatsApp delivery
performance · host time-to-seat · estimate accuracy tracked separately per method ·
zone/floor performance and multi-outlet rollup · CSV and print-to-PDF export.

Zone- and table-level depth is Pro-only, because Basic doesn't track live table
geometry to build it on.

### Billing
Razorpay Subscriptions, flat monthly INR per outlet, GST invoicing. The plan is
only ever changed by the signed webhook — never by the browser — so a closed tab
mid-payment can't leave an org on a tier it isn't paying for.

## Deployment

Push to Vercel and set the environment variables from `.env.example`.
`vercel.json` registers the one-minute cron that drives grace periods, proactive
position updates, analytics rollups and the PII purge. Point two webhooks at the
deployment:

| Provider | URL |
|---|---|
| Meta / BSP | `/api/whatsapp/webhook` |
| Razorpay | `/api/razorpay/webhook` |

Before going live, all six WhatsApp templates must be approved by Meta —
Settings shows the per-template approval state, and the ops console at `/admin`
shows it per tenant.

## Tests

```bash
npm test
```

The wait-time engine is the piece that has to be right — it drives what guests
are told, what the board shows, and what the accuracy metric is measured
against — so it's pure, dependency-free and unit-tested (21 cases covering both
estimation modes, party-size bucketing, zone fallback, and queue position).

## Notes

- PDF export is served as a print-optimised HTML report that opens the browser's
  print dialog ("Save as PDF"). That keeps headless Chrome and its cold-start
  cost out of a once-a-month action; the output is the same.
- `restaurant_tables`, not `tables` — the latter collides in Postgres contexts.
