-- Baari — core schema
-- Multi-tenant: organization -> outlet -> floor -> zone -> table
-- Every guest-facing and staff-facing row is keyed by outlet_id so RLS
-- (0002) can be a single predicate everywhere.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------- enums
create type plan_tier        as enum ('basic', 'pro');
create type staff_role       as enum ('owner', 'manager', 'host', 'superadmin');
create type table_shape      as enum ('round', 'square', 'rect', 'booth');
create type table_status     as enum ('free', 'occupied', 'clearing', 'reserved', 'blocked');
create type zone_kind        as enum ('indoor', 'outdoor', 'ac', 'rooftop', 'bar', 'private');
create type queue_status     as enum ('waiting', 'notified', 'checked_in', 'seated', 'no_show', 'left', 'cancelled');
create type wait_method      as enum ('rolling_average', 'live_availability');
create type notif_template   as enum (
  'queue_confirmation', 'position_update', 'table_ready',
  'grace_nudge', 'queue_left', 'feedback_request'
);
create type notif_status     as enum ('queued', 'sent', 'delivered', 'read', 'failed');
create type sub_status       as enum ('trialing', 'active', 'past_due', 'halted', 'cancelled');

-- --------------------------------------------------------- organizations
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  gstin       text,
  created_at  timestamptz not null default now()
);

create table subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references organizations(id) on delete cascade,
  plan                     plan_tier not null default 'basic',
  status                   sub_status not null default 'trialing',
  razorpay_subscription_id text unique,
  razorpay_customer_id     text,
  outlet_quota             int not null default 1,
  current_period_end       timestamptz,
  trial_ends_at            timestamptz default now() + interval '30 days',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index on subscriptions (org_id);

-- --------------------------------------------------------------- outlets
create table outlets (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizations(id) on delete cascade,
  slug      text not null unique,          -- used in the public QR url /q/<slug>
  name      text not null,
  address   text,
  timezone  text not null default 'Asia/Kolkata',
  phone     text,
  is_open   boolean not null default true,
  -- operational knobs, all per-outlet configurable
  grace_period_min      int  not null default 5,   -- check-in window after "table ready"
  grace_reoffers        int  not null default 1,   -- re-offers before auto no-show
  notify_lead_min       int  not null default 15,  -- "you're getting close" threshold
  max_party_size        int  not null default 20,
  pii_retention_days    int  not null default 90,  -- DPDP auto-purge window
  feedback_url          text,
  created_at            timestamptz not null default now()
);
create index on outlets (org_id);

-- ------------------------------------------------------------ staff auth
-- Mirrors auth.users. RLS on every other table resolves through this.
create table staff_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid references organizations(id) on delete cascade,
  full_name   text,
  email       text,
  role        staff_role not null default 'host',
  created_at  timestamptz not null default now()
);
create index on staff_users (org_id);

-- Hosts can be scoped to specific outlets; owners/managers see the whole org.
create table staff_outlets (
  staff_id  uuid not null references staff_users(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  primary key (staff_id, outlet_id)
);

-- ------------------------------------------------------ floors and zones
create table floors (
  id         uuid primary key default gen_random_uuid(),
  outlet_id  uuid not null references outlets(id) on delete cascade,
  name       text not null,               -- "Ground", "Rooftop", "Private Dining"
  level      int  not null default 0,     -- sort order, ground = 0
  created_at timestamptz not null default now(),
  unique (outlet_id, name)
);
create index on floors (outlet_id);

create table zones (
  id         uuid primary key default gen_random_uuid(),
  outlet_id  uuid not null references outlets(id) on delete cascade,
  floor_id   uuid not null references floors(id) on delete cascade,
  name       text not null,
  kind       zone_kind not null default 'indoor',
  color      text not null default '#64748b',   -- drives the 3D zone tint + heatmap base
  created_at timestamptz not null default now(),
  unique (outlet_id, floor_id, name)
);
create index on zones (outlet_id);
create index on zones (floor_id);

-- --------------------------------------------------------------- tables
-- Merged tables: members point at a table_groups row via merged_group_id.
-- The group is what gets seated; members keep their geometry so an un-merge
-- is a pure delete of the group row.
create table table_groups (
  id         uuid primary key default gen_random_uuid(),
  outlet_id  uuid not null references outlets(id) on delete cascade,
  floor_id   uuid not null references floors(id) on delete cascade,
  label      text not null,                -- "T4+T5"
  capacity   int  not null,                -- summed, manager-overridable
  status     table_status not null default 'free',
  created_at timestamptz not null default now()
);
create index on table_groups (outlet_id);

create table restaurant_tables (
  id              uuid primary key default gen_random_uuid(),
  outlet_id       uuid not null references outlets(id) on delete cascade,
  floor_id        uuid not null references floors(id) on delete cascade,
  zone_id         uuid not null references zones(id) on delete cascade,
  label           text not null,                       -- editable table tent number
  shape           table_shape not null default 'round',
  capacity        int  not null default 4,
  -- 3D transform. y is fixed at floor level; the renderer lays floors out
  -- as separate scenes, so only x/z position and y-rotation are stored.
  pos_x           real not null default 0,
  pos_z           real not null default 0,
  rot_y           real not null default 0,             -- radians
  width           real not null default 1.0,           -- metres
  depth           real not null default 1.0,
  status          table_status not null default 'free',
  merged_group_id uuid references table_groups(id) on delete set null,
  sort_index      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (outlet_id, label)
);
create index on restaurant_tables (outlet_id, status);
create index on restaurant_tables (floor_id);
create index on restaurant_tables (merged_group_id);

-- --------------------------------------------------------- queue entries
create table queue_entries (
  id                uuid primary key default gen_random_uuid(),
  outlet_id         uuid not null references outlets(id) on delete cascade,
  ticket_code       text not null,                     -- short human code, e.g. "B47"
  guest_name        text not null,
  phone_e164        text,                              -- nulled out by the DPDP purge
  party_size        int  not null check (party_size > 0),
  zone_pref         zone_kind,
  notes             text,
  status            queue_status not null default 'waiting',
  -- lifecycle timestamps drive the whole analytics suite
  joined_at         timestamptz not null default now(),
  notified_at       timestamptz,
  checked_in_at     timestamptz,
  seated_at         timestamptz,
  closed_at         timestamptz,                       -- no_show / left / cancelled
  grace_expires_at  timestamptz,
  grace_used        int not null default 0,
  assigned_table_id uuid references restaurant_tables(id) on delete set null,
  assigned_group_id uuid references table_groups(id) on delete set null,
  -- wait estimate captured at join time, so predicted-vs-actual is measurable
  est_wait_low_min  int,
  est_wait_high_min int,
  est_method        wait_method,
  priority          int not null default 0,            -- manual VIP bump, higher first
  source            text not null default 'qr',        -- qr | walkin | staff
  notify_failed     boolean not null default false,    -- host must phone this guest
  purged_at         timestamptz,
  unique (outlet_id, ticket_code)
);
create index on queue_entries (outlet_id, status, joined_at);
create index on queue_entries (outlet_id, joined_at desc);
create index on queue_entries (phone_e164);
create index on queue_entries (assigned_table_id);

-- Every seating is logged separately so turn-time survives table edits.
create table table_sessions (
  id             uuid primary key default gen_random_uuid(),
  outlet_id      uuid not null references outlets(id) on delete cascade,
  table_id       uuid references restaurant_tables(id) on delete set null,
  group_id       uuid references table_groups(id) on delete set null,
  zone_id        uuid references zones(id) on delete set null,
  floor_id       uuid references floors(id) on delete set null,
  queue_entry_id uuid references queue_entries(id) on delete set null,
  party_size     int,
  seated_at      timestamptz not null default now(),
  cleared_at     timestamptz,
  seated_by      uuid references staff_users(id) on delete set null
);
create index on table_sessions (outlet_id, seated_at desc);
create index on table_sessions (table_id, seated_at desc);
create index on table_sessions (zone_id);

-- --------------------------------------------------- notification ledger
create table notification_logs (
  id                  uuid primary key default gen_random_uuid(),
  outlet_id           uuid not null references outlets(id) on delete cascade,
  queue_entry_id      uuid references queue_entries(id) on delete cascade,
  template            notif_template not null,
  provider            text not null default 'meta_cloud',
  provider_message_id text,
  status              notif_status not null default 'queued',
  error               text,
  payload             jsonb,
  sent_at             timestamptz not null default now(),
  delivered_at        timestamptz,
  read_at             timestamptz
);
create index on notification_logs (outlet_id, sent_at desc);
create index on notification_logs (queue_entry_id);
create index on notification_logs (provider_message_id);

-- WhatsApp template registry — tracks Meta approval state per outlet/org.
create table whatsapp_templates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  template      notif_template not null,
  provider_name text not null,           -- the name registered with Meta
  language      text not null default 'en',
  approval      text not null default 'pending',  -- pending | approved | rejected
  body_preview  text,
  updated_at    timestamptz not null default now(),
  unique (org_id, template, language)
);

-- ------------------------------------------------------ analytics rollup
-- Pre-aggregated so the dashboard stays fast once an outlet has months of
-- history. Recomputed for the trailing 2 days by the cron route.
create table analytics_daily (
  outlet_id           uuid not null references outlets(id) on delete cascade,
  day                 date not null,
  joined              int not null default 0,
  notified            int not null default 0,
  checked_in          int not null default 0,
  seated              int not null default 0,
  no_show             int not null default 0,
  left_queue          int not null default 0,
  avg_wait_min        real,
  median_wait_min     real,
  avg_turn_min        real,
  est_error_min       real,      -- mean |predicted midpoint - actual|
  returning_guests    int not null default 0,
  new_guests          int not null default 0,
  hourly              jsonb not null default '{}'::jsonb,  -- {"18": {"joined":12,...}}
  updated_at          timestamptz not null default now(),
  primary key (outlet_id, day)
);

-- --------------------------------------------------------------- audit
create table audit_events (
  id         bigserial primary key,
  outlet_id  uuid references outlets(id) on delete cascade,
  actor_id   uuid references staff_users(id) on delete set null,
  action     text not null,
  target     text,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index on audit_events (outlet_id, created_at desc);

-- ------------------------------------------------------------- triggers
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_tables_touch before update on restaurant_tables
  for each row execute function touch_updated_at();
create trigger t_subs_touch before update on subscriptions
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------- realtime
-- Staff devices subscribe per outlet; these are the tables that must push.
alter publication supabase_realtime add table restaurant_tables;
alter publication supabase_realtime add table table_groups;
alter publication supabase_realtime add table queue_entries;
