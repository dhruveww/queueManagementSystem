# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Baari** ("meri baari" — my turn) is a WhatsApp-first virtual queuing SaaS for
Indian restaurants. Guests scan a QR at the door, join a virtual line, and get a
WhatsApp message when their table is ready. Staff run the queue from a list view
(Basic plan) or an interactive 3D floor plan (Pro plan).

Next.js 15 App Router · React 19 · Supabase (Postgres + Realtime) · Tailwind v4 ·
react-three-fiber · Razorpay · deployed on Vercel.

## Commands

```bash
npm run dev              # dev server
npm run build            # production build — run before claiming a change works
npm run typecheck        # tsc --noEmit
npm test                 # vitest (wait-time engine)
npm run test:watch
npx vitest run tests/waitTime.test.ts -t "rolling average"   # single test/suite

npm run db:push          # apply supabase/migrations to the linked project
npm run db:reset         # wipe + re-apply (local)
npm run seed             # demo tenant + 30 days of history
```

Env lives in `.env.local`; `.env.example` lists every key. `WHATSAPP_PROVIDER=mock`
is the dev default — it logs rendered messages to the console instead of calling
Meta, so the full queue lifecycle is exercisable with no WhatsApp account. Numbers
ending `0000` simulate "not on WhatsApp" and trigger the host-fallback path.

## Architecture

### The plan flag is the only difference between tiers
Basic and Pro share one schema. `plan` on `subscriptions` decides two things:
whether `/dashboard/floor` renders and which wait-estimation method runs. Tables,
floors, zones and geometry are stored for every tenant regardless of plan, so an
upgrade is a flag change with nothing to migrate. Don't add plan-conditional
columns — gate at the read.

### Guests never touch the database
Guests are anonymous — no Supabase session ever. `/q/[slug]` and `/s/[token]` run
server-side through `createAdminSupabase()` (service role) and filter by slug or
ticket token. RLS therefore grants `anon` nothing but a public read of open
outlets, and guest phone numbers are unreachable from any browser. Staff routes
use the RLS-bound client via `createServerSupabase()`.

### Three Supabase clients, deliberately
- `lib/supabase/client.ts` — browser, staff session, RLS applies
- `lib/supabase/server.ts` — server components, staff session, RLS applies
- `lib/supabase/admin.ts` — service role, **bypasses RLS**; only import from
  server code that has already authorised the caller (`assertOutletAccess`)

### Multi-writer safety lives in SQL, not TypeScript
Two hosts tapping the same table is the normal case, not an edge case.
`seat_guest`, `clear_table`, `merge_tables` and `unmerge_group` are plpgsql
functions in `0003_functions.sql` that claim the table and move the queue entry
in one transaction. Server actions call them via `.rpc()` — never replicate that
logic as separate JS updates.

### Wait estimation (`lib/domain/waitTime.ts`)
Both modes answer one question: *"I'm Nth in line for a table my size — when does
the Nth-soonest table free up?"*
- `live_availability` (Pro) — real per-table status plus how long each occupied
  table has already been sitting
- `rolling_average` (Basic) — every matching table assumed mid-turn (half the
  average turn)

Output is always a range (`band()`), never a single number. This file is pure and
fully unit-tested; keep it that way — no I/O, no Supabase imports.

**The join-time quote is immutable.** `est_wait_low_min`/`est_wait_high_min` on a
queue entry are set once at join and never updated, because predicted-vs-actual
accuracy is measured against them. Later messages pass a live re-quote via
`NotifyContext.estimate` instead of overwriting the stored quote.

### Realtime
One channel per outlet (`useOutletRealtime`), shared by the list board and the 3D
view. Rows merge into local state on INSERT/UPDATE/DELETE; a resubscribe triggers
a full refetch because a dropped socket may have missed events. Both views render
the same `loadBoard()` snapshot — only the presentation differs.

### The 3D floor view is pure presentation
`src/components/floor3d/` takes all data as props and emits every mutation
through a callback. It contains no Supabase calls and no fetching. The parent
(`app/dashboard/floor/FloorView.tsx`) owns realtime and the server actions.
Keep that boundary: it's why table colours update live with no code inside the
scene knowing what a subscription is. Loaded via `next/dynamic` with `ssr: false`.

### Analytics
Historical numbers come from `analytics_daily`, a pre-aggregated rollup rebuilt
by `rebuild_analytics_daily(outlet, day)` from the cron route. Only the live
snapshot and row-level drill-downs (abandonment buckets, zone/host performance)
hit the operational tables. Adding a metric usually means extending the rollup
function *and* `AnalyticsDaily` in `lib/types.ts` together.

Chart colours come from `lib/analytics/palette.ts` and are validated against the
dashboard's dark surface (`#0e1116`). Categorical slots are assigned in fixed
order and never cycled; no chart runs more than three categorical series. Never
build a dual-axis chart — split into two panels (see "By hour of day").

### The cron heartbeat
`/api/cron/tick` runs every minute (`vercel.json`) and does what nobody is
sitting there to do: grace-period nudges and auto no-show, proactive "you're
getting close" messages, analytics rollups for today and yesterday, and the DPDP
retention purge. It is the only writer for those transitions.

## Conventions

- **WhatsApp only.** There is no SMS anywhere and no SMS fallback. A failed send
  sets `notify_failed` on the queue entry, which the board renders as a "call this
  guest" flag. Don't add another channel.
- **Every guest message is a pre-approved template.** Add one to
  `lib/whatsapp/templates.ts` *and* the `notif_template` enum, then submit it to
  Meta. Never send free-form text.
- **Server actions return `{ ok: true } | { ok: false, error }`** — they don't
  throw at the UI. Every one calls `assertOutletAccess` before touching data.
- **Phone numbers are normalised to E.164 at the edge** (`lib/domain/phone.ts`)
  and rejected if they can't be an Indian mobile — a landline means a guest who
  never hears their table is ready.
- `restaurant_tables` is the table name; `tables` is reserved in Postgres contexts
  and `RestaurantTable` is the TS type.
- Merged tables: members keep their own geometry and point at a `table_groups`
  row. The group is what gets seated. Un-merge is a delete of the group row.

## Schema changes

`supabase/migrations/` is ordered and additive: `0001_schema`, `0002_rls`,
`0003_functions`. Any new table carrying `outlet_id` needs its three policies
added to the `do $$` loop in `0002_rls.sql`, and `src/lib/types.ts` updated in the
same change — that file is the hand-maintained contract the whole app compiles
against.
