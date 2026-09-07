# Virtual Queuing for Restaurants (India) — Master Build Prompt + Market Analysis

---

## PART 1: MASTER PROMPT (paste into Claude Code / Cursor / Bolt / v0 / a dev team brief)

```
You are building "QueueX" — a virtual queuing and waitlist management SaaS
product for restaurants in India, competing with Qwaiting, Frontlion,
Queue-Fair, and Zilicius but built India-first: WhatsApp-only communication
(no SMS), a 3D interactive floor-plan for the flagship Pro tier, Supabase
for data/storage, Vercel for hosting, and Razorpay for billing.

PRODUCT GOAL
A restaurant with a walk-in queue (no reservation) lets guests join a
virtual line by scanning a QR code at the door or on a standee, instead of
standing in a physical line. Guests get a live queue position and wait-time
estimate, and are notified via WhatsApp when their table is ready. Staff
manage the whole queue, table assignment, and analytics from a tablet/web
dashboard — in a plain list view (Basic plan) or a fully interactive 3D
floor-plan view (Pro plan).

COMMUNICATION CHANNEL — WHATSAPP ONLY
- All guest notifications go through the WhatsApp Business API
  (via a BSP such as Gupshup, Interakt, Wati, or Meta's Cloud API
  directly). No SMS anywhere in the product — no SMS fallback, no SMS
  billing, no DLT/SMS-sender-ID setup required. This simplifies
  compliance scope to WhatsApp Business Platform policies only.
- Guest join flow requires a WhatsApp-reachable phone number; the join
  page should validate/nudge for this at entry (e.g., "Enter the number
  linked to your WhatsApp for updates").
- Message templates needed (all pre-approved via the WhatsApp Business
  Platform template review process before launch):
  1. Queue confirmation (position + estimated wait range)
  2. Position update / "you're getting close" (~15 min away)
  3. Table ready (with a check-in deadline, e.g., "arrive within 5 min")
  4. Grace-period nudge if guest hasn't checked in
  5. Queue-left / no-show confirmation
  6. (Pro plan) Optional post-visit thank-you / feedback link

CORE USER FLOWS

1. Guest join flow
   - Guest scans QR code (table-side standee, entrance poster, or Google
     Maps/Instagram link) → lands on a no-login mobile web page.
   - Enters: name, WhatsApp number, party size, seating preference
     (indoor/outdoor/AC/rooftop — driven by the zones defined in the
     restaurant's floor plan), optional special notes (birthday,
     wheelchair access).
   - Gets: queue number, live position in line, estimated wait time,
     option to "leave queue" or "notify a friend."
   - Consents to WhatsApp notifications (DPDP Act 2023 compliant
     consent checkbox, explicit opt-in, not pre-ticked).

2. Notification flow (WhatsApp only)
   - Automated WhatsApp messages at each stage listed above.
   - If guest doesn't check in within a grace window, auto-skip with one
     grace re-offer, then move to next in line — configurable per outlet.
   - Delivery-failure handling: if a WhatsApp message fails (invalid
     number, not on WhatsApp), flag the queue entry visually on the
     staff dashboard so the host can call the guest directly — this is
     the fallback, not a paid SMS channel.

3. Staff dashboard — TWO VIEWS BY PLAN

   BASIC PLAN — Standard list view
   - Live queue board: name, party size, wait time, status (waiting,
     notified, seated, no-show, left).
   - One-tap actions: notify, seat, mark no-show, add walk-in manually,
     merge/split parties, reorder for VIP/reservation priority.
   - Simple table status list (table number, capacity, zone, status)
     as a list/grid, not a visual floor plan.
   - Manual override for host judgment.

   PRO PLAN — Full 3D interactive floor-plan view
   - Fully rendered 3D restaurant layout (built with a WebGL/Three.js
     based renderer — e.g. react-three-fiber), showing every table as a
     3D object positioned and shaped to match the real floor.
   - FLOOR-WISE VIEW: restaurants with multiple floors/sections (e.g.
     ground floor, rooftop, private dining room) get a floor switcher;
     each floor is its own 3D scene with its own table layout.
   - FULLY ROTATABLE + ZOOMABLE camera (orbit controls) — staff can spin,
     tilt, and zoom the floor plan from any angle, tap/click any table
     to see or change its status.
   - COLOR-CODED LIVE STATUS per table: free (green), occupied (red),
     being cleared (amber), reserved (blue) — updates in real time via
     Supabase Realtime so every staff device stays in sync instantly.
   - TABLE MANAGEMENT (drag-and-drop 3D editor, available to
     managers/admins):
     - Add a new table: pick a shape (round/square/rectangular/booth),
       set capacity, assign a zone and floor, drag to position, rotate
       to orientation.
     - Edit an existing table: resize, reposition, rotate, recolor by
       zone, rename/renumber.
     - MERGE TABLES: select two or more adjacent tables and merge them
       into a single combined table object (for large walk-in groups) —
       the merged table gets a combined capacity and a composite table
       number (e.g., "T4+T5"); un-merge restores the originals.
     - TABLE NUMBERING: every table has a unique, editable table number/
       label visible directly on the 3D model (floating label above the
       table), auto-suggested sequentially per zone/floor but fully
       editable (so it matches whatever numbering the restaurant already
       uses on physical table tents).
   - ONE-TAP SEATING FROM THE 3D VIEW: tap a waiting guest from a side
     panel, then tap a free table in the 3D scene to seat them — this
     directly updates table status and removes them from the queue list
     in one action.
   - VISUAL ZONE HEATMAP OVERLAY (toggle): color-wash the floor by how
     fast each zone is turning over, so a manager can see at a glance
     which section (e.g., outdoor seating) is the current bottleneck.

4. Owner/manager analytics dashboard — "give me everything" tier
   Build this as a genuinely comprehensive, visually rich analytics
   suite (charts, not just numbers) covering:
   - Live operational snapshot: guests currently waiting, average
     current wait, tables free vs. occupied right now, active floor
     utilization %.
   - Wait-time analytics: average/median wait by hour-of-day, day-of-
     week, and party size; predicted-vs-actual wait accuracy over time
     (are your estimates trustworthy?).
   - Queue funnel: joined → notified → checked-in → seated → no-show/
     left, as a funnel chart, with conversion % at each step.
   - Abandonment analytics: % of guests who leave before being seated,
     broken down by wait-time bucket (do people abandon mostly after
     20+ min? 40+ min?) so the owner knows exactly where they're losing
     guests.
   - Table/zone performance: average turn time per table and per zone,
     utilization % per zone, per floor (Pro plan ties this directly to
     the 3D heatmap overlay).
   - Peak-hours heatmap: footfall by hour × day-of-week grid, so an
     owner instantly spots their busiest windows across a month.
   - Repeat-guest recognition: returning-guest rate by phone number
     match (no external CRM needed — this is derivable from your own
     queue data), with a simple "new vs. returning" split per day.
   - Notification performance: WhatsApp delivery rate, read rate (where
     the API exposes it), and time-from-notify-to-seated.
   - Staff/host performance: average time-to-action per host (how fast
     do they mark a table ready/seat a guest after notification) —
     useful for multi-host outlets.
   - Trend comparisons: week-over-week and month-over-month trend lines
     for every metric above, plus a simple "this week vs. last week"
     summary card at the top of the dashboard.
   - Multi-outlet rollup (for restaurant groups): all of the above,
     aggregated across outlets with an outlet-comparison view.
   - Exportable reports: CSV and PDF export for any date range, for
     weekly/monthly ops reviews and investor/board reporting.
   - All charts should be interactive (hover for exact values, click to
     drill into a specific day/table/zone) — this dashboard is meant to
     be a genuine "wow" moment in demos, not just a stats page.

5. Admin/super-admin (QueueX internal ops)
   - Onboarding new restaurant tenants, WhatsApp template approval
     status tracking, Razorpay subscription/billing management, plan
     upgrades (Basic → Pro), usage monitoring.

DATA MODEL (minimum entities)
- Organization (restaurant group) → Outlet (physical location) → Floor
  (name, order/level) → Zone (indoor/outdoor/AC/rooftop, belongs to a
  floor) → Table (table_number, shape, capacity, position_x/y/z,
  rotation, zone_id, floor_id, status, merged_group_id nullable) →
  TableGroup (for merged tables: member table_ids, combined capacity,
  combined label) → QueueEntry (guest, party size, status, timestamps,
  assigned_table_id) → NotificationLog (WhatsApp template used, delivery
  status, timestamp) → StaffUser (role: host/manager/owner) →
  Subscription/Plan (Basic/Pro, Razorpay subscription id) →
  UsageMetrics/AnalyticsSnapshots (pre-aggregated daily/hourly rollups
  so the analytics dashboard stays fast at scale).

WAIT-TIME ESTIMATION ALGORITHM
- Live-availability based (not just historical average), since the Pro
  plan's real-time table status feed makes this possible:
  actual_free_tables_of_matching_size, plus
  currently-occupied-tables' elapsed-time-vs-avg-turn-time to estimate
  which will clear next, plus queue position for that table size.
- Basic plan (no live 3D table tracking) falls back to the
  rolling-average method: avg_table_turn_time (30-day rolling, per
  outlet, per party-size bucket) × position-in-queue-for-matching-size.
- Always show a range, not a false-precision single number ("15–20 min"
  not "17 min").

TECH STACK (as specified)
- Hosting: Vercel (frontend + serverless/edge functions for API routes).
- Database + storage + realtime: Supabase (Postgres + Supabase Realtime
  for live table-status sync across every staff device + Supabase
  Storage for any floor-plan assets/exports).
- Frontend: Next.js/React, mobile-first for the guest join page; the
  Pro-plan 3D floor view built with react-three-fiber + drei (orbit
  controls, drag controls for the table editor) on top of Three.js.
- Auth: Supabase Auth — OTP-based guest flow (no password) for guests;
  email/password + role-based access control for staff/admin.
- Notifications: WhatsApp Business API via a BSP (Gupshup/Interakt/Wati
  or Meta Cloud API directly) — no other channel.
- Payments/billing: Razorpay Subscriptions for recurring Basic/Pro plan
  billing, Razorpay for any one-time setup fees, GST-compliant invoicing
  via Razorpay's invoicing support.
- Realtime sync: Supabase Realtime channels per outlet, so every table
  status change (list view or 3D view) reflects instantly on every
  connected staff device.

NON-FUNCTIONAL REQUIREMENTS
- Multi-tenant from day one (row-level security in Supabase/Postgres
  keyed by organization/outlet).
- 99.9% uptime target for the guest-facing join page.
- Mobile network resilience: guest page must load fast on 3G/patchy
  wifi (target <2s on mid-range Android over 4G) — this matters more
  for the guest join page than the 3D staff view, which runs on
  restaurant wifi on a dedicated tablet.
- 3D view performance: target smooth interaction (60fps where possible,
  30fps minimum) on a mid-range Android tablet — keep table models
  low-poly, use instancing for repeated shapes, lazy-load floors not
  currently in view.
- Data privacy: DPDP Act 2023 — clear consent, right to erasure, minimal
  PII retention (auto-purge guest phone numbers after a configurable
  window, e.g. 90 days).

SCOPE — SINGLE BUILD, NO PHASED V2
Build both plans (Basic list-view and Pro 3D-view) as part of the same
initial build — there is no deferred "V2 in months 3–6" phase. Table
add/edit/merge/numbering, floor-wise switching, full rotation/zoom, and
the complete analytics dashboard described above are all in scope for
this build, not a later release.

PLANS

BASIC PLAN
- WhatsApp queue join + notifications.
- Standard list-based staff dashboard (queue list + simple table status
  list, no visual floor plan).
- Rolling-average wait-time estimate.
- Core analytics (wait times, funnel, abandonment, peak hours).
- Single floor/zone set assumed (no floor-switcher UI needed, though the
  data model already supports multiple floors so upgrading to Pro is a
  plan-flag change, not a data migration).

PRO PLAN
- Everything in Basic, plus:
- Full 3D interactive floor-plan staff view: floor-wise switching, fully
  rotatable/zoomable camera, live color-coded table status.
- 3D table editor: add/edit/reposition/rotate/merge/renumber tables.
- Live-availability-based wait-time estimate (more accurate than Basic's
  rolling average).
- Zone heatmap overlay on the 3D view.
- Full "everything" analytics suite including table/zone/floor
  performance, staff performance, repeat-guest recognition, and
  multi-outlet rollup.
- Priced and positioned as the flagship, demo-winning tier — this is the
  plan that should make a restaurant owner say "I haven't seen anything
  like this."

MVP DEFINITION (single build, both plans, no phased roadmap)
1. QR-based guest join page (WhatsApp number capture, consent).
2. WhatsApp notifications for all queue lifecycle events.
3. Basic plan: list-based staff dashboard.
4. Pro plan: full 3D floor-plan staff dashboard (multi-floor, rotatable,
   add/edit/merge/renumber tables, live color-coded status).
5. Full analytics dashboard (all metrics listed above) available to
   both plans, with table/zone/floor-level depth unlocked for Pro (since
   Basic doesn't track live table position/geometry).
6. Razorpay subscription billing for Basic/Pro plan selection and
   upgrades.

SUCCESS METRICS TO INSTRUMENT FROM LAUNCH
- Queue abandonment rate (guests who leave before being seated).
- Notification-to-seating conversion rate.
- Average wait-time estimate accuracy (predicted vs. actual) — track
  separately for Basic (average-based) vs. Pro (live-availability-based)
  to prove the Pro plan's accuracy edge with real data.
- Host adoption: do staff actually use the 3D view day-to-day, or find
  it slower than a list for simple operations? Instrument time-to-seat-
  a-guest for both view types so you have real evidence for which plan
  actually performs better operationally, not just visually.
```

---

## PART 2: MARKET ANALYSIS

### 2.1 The four references, what they represent

| Player | Positioning | Likely target segment |
|---|---|---|
| Frontlion | Restaurant-specific virtual queuing, positions itself as an affordable, quick-to-deploy solution | Independent restaurants, small-to-mid chains |
| Queue-Fair | Broader "virtual waiting room" tech, historically strong in high-demand ticketing/e-commerce traffic control, the restaurant demo is one vertical among many | Enterprise, high-traffic events/retail more than restaurant floor management specifically |
| Qwaiting | Multi-industry queue management (banks, hospitals, retail, restaurants), India-linked in parts of its go-to-market | SMBs across many verticals, India-aware pricing in some cases |
| Zilicius | Enterprise queue/token management, broader B2B service industries | Larger institutional clients (banks, government offices, hospitals) more than casual dining |

Caveat: I wasn't able to load these pages live in this conversation, so treat the above as directional based on how each product is generally known to position itself, not a verified feature-by-feature audit.

### 2.2 Why the 3D floor-plan Pro plan is a genuine differentiator

None of the four references appear to offer a fully rotatable, floor-wise, staff-editable 3D operational view (Queue-Fair's "rotunda3d" demo is closer to a guest-facing visual than a staff operations tool with merge/edit/renumber capability). A live, editable, merge-capable 3D floor plan tied directly into the wait-time algorithm and analytics is a real product moat, not just a visual gimmick — it's also the single most demo-able feature you have, which matters enormously for selling into restaurant owners who are comparing several vendors and will remember whichever demo actually impressed them.

### 2.3 Why India is a distinct market, not just "the same product, cheaper"

- **WhatsApp-only is the right call for India**, both for guest adoption (India has one of the largest WhatsApp user bases globally) and for your own cost control — cutting SMS entirely removes DLT/DND compliance overhead and a recurring per-message cost.
- **Price sensitivity is structural.** Most global queuing SaaS pricing is denominated in USD/GBP with per-agent/per-location fees that read as expensive once converted for a mid-size Indian restaurant. Flat, low, INR-denominated pricing via Razorpay is a real wedge.
- **The organized dining segment is growing but host/queue management is still manual almost everywhere outside large QSR chains.** Most standalone and even many mid-size chain restaurants in India still manage walk-in queues with a paper list or nothing at all — that's your market gap.
- **Vercel + Supabase is a lean, fast-to-ship stack** well suited to a small team shipping both a Basic and Pro tier without infra overhead — Supabase Realtime in particular is exactly what the live 3D table-status sync needs.

### 2.4 Business model

- **Basic plan**: flat monthly SaaS fee per outlet, billed in INR via Razorpay, GST-compliant invoicing — positioned for independent restaurants and small chains.
- **Pro plan**: higher flat monthly fee per outlet, same billing rail, positioned for higher-footfall restaurants, chains with multiple floors/large table counts, and anyone who wants the demo-winning 3D view.
- **Go-to-market wedge**: free or heavily discounted pilot (30–60 days) with a single high-visibility busy restaurant, using the Pro plan's 3D demo as the hook, then use "average wait reduced by X%, no-shows down Y%" as the case study to sell the next several restaurants in the same food street/mall.

### 2.5 Where the target-restaurant list needs a live check

I can name restaurants generally known in Bangalore for regular walk-in queues (this part is stable, well-known information), but "not currently using a queuing system" is a live, verifiable fact I shouldn't guess at — some of these may already have piloted a system I'm not aware of. High-footfall clusters worth focusing on for outreach: Indiranagar, Koramangala, HSR Layout, Jayanagar, and Malleswaram/Basavanagudi (known for South Indian breakfast institutions, popular biryani/Andhra-style spots, and busy casual dining chains). A focused, sourced pass could confirm current names with recent evidence (reviews, news, social posts) that they still use manual/paper queues rather than any digital system, so your first outreach calls aren't wasted on someone already using a competitor.
