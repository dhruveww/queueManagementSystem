-- Baari — inbound leads and intro-call booking.
--
-- Leads are prospects, not tenants: there is no outlet_id, so this table is
-- deliberately NOT added to the do $$ loop in 0002_rls.sql. Access is the guest
-- model from CLAUDE.md taken one notch further — the public form posts to a
-- server route that uses createAdminSupabase(), so `anon` gets nothing here at
-- all, not even the public read that `outlets` used to grant.

create type lead_status as enum
  ('new', 'proposed', 'approved', 'rescheduling', 'declined', 'expired');

create table leads (
  id                uuid primary key default gen_random_uuid(),

  -- who
  contact_name      text not null,
  restaurant_name   text not null,
  city              text not null,
  phone_e164        text not null,
  email             text not null,
  outlets_count     int  not null default 1 check (outlets_count between 1 and 500),
  requests          text,
  pricing_note      text,

  -- meeting
  status            lead_status not null default 'new',
  slot_start        timestamptz,
  slot_end          timestamptz,
  timezone          text not null default 'Asia/Kolkata',
  gcal_event_id     text,
  meet_url          text,
  reschedule_count  int  not null default 0 check (reschedule_count >= 0),
  proposed_slots    jsonb,

  -- one-click email links. Rotating the nonce invalidates every outstanding
  -- link for this lead at once, so no used-token table is needed.
  action_nonce      uuid not null default gen_random_uuid(),
  actioned_at       timestamptz,
  owner_note        text,
  reminder_sent_at  timestamptz,

  -- hygiene
  source            text not null default 'site',
  ip_hash           text,                 -- salted digest, never the raw IP
  last_error        text,                 -- calendar/email failure, shown to the owner
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on leads (created_at desc);
create index on leads (status);
create index on leads (ip_hash, created_at desc) where ip_hash is not null;

-- Double-booking becomes impossible at the storage layer rather than only in
-- application code: two forms submitted in the same second for the same slot,
-- one wins and the other is told to pick again.
create unique index leads_held_slot
  on leads (slot_start)
  where status in ('new', 'proposed', 'approved');

create trigger t_leads_touch before update on leads
  for each row execute function touch_updated_at();

-- A thin audit trail. audit_events is outlet-scoped and its RLS resolves
-- through can_access_outlet(), which would hide every lead row, so leads get
-- their own log.
create table lead_events (
  id         bigserial primary key,
  lead_id    uuid not null references leads(id) on delete cascade,
  kind       text not null,      -- lead.created | cal.held | email.owner_sent | owner.approved …
  ok         boolean not null default true,
  detail     text,
  created_at timestamptz not null default now()
);
create index on lead_events (lead_id, created_at desc);

-- ------------------------------------------------------------------ access
--
-- RLS on with no `to anon` policy is default-deny for the browser. But RLS is
-- only half of PostgREST's story — the grant is the other half, and 0005 showed
-- what happens when that is left at the Postgres default. Do both.
alter table leads       enable row level security;
alter table lead_events enable row level security;

revoke all on table leads       from anon, authenticated;
revoke all on table lead_events from anon, authenticated;
revoke all on sequence lead_events_id_seq from anon, authenticated;

grant select on table leads       to authenticated;
grant select on table lead_events to authenticated;

-- Only a superadmin signed into the staff app can read the pipeline; ordinary
-- restaurant staff are other tenants and must never see it.
create policy leads_superadmin_read on leads for select to authenticated
  using (coalesce(auth_role() = 'superadmin', false));
create policy lead_events_superadmin_read on lead_events for select to authenticated
  using (coalesce(auth_role() = 'superadmin', false));

-- The service role bypasses RLS entirely, which is how the form route, the
-- action route and the cron sweep reach this table.

-- -------------------------------------------------------------- retention
--
-- purge_expired_pii() is keyed on outlets.pii_retention_days and cannot see
-- leads, so a dead lead's phone and email would otherwise sit here forever.
create or replace function purge_expired_leads() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update leads
     set phone_e164 = '',
         email      = '',
         requests   = null,
         pricing_note = null,
         ip_hash    = null
   where status in ('declined', 'expired', 'approved')
     and coalesce(actioned_at, created_at) < now() - interval '365 days'
     and email <> '';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function purge_expired_leads() from public, anon, authenticated;
