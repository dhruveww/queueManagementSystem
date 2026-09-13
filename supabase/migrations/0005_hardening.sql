-- Baari — security hardening.
--
-- Postgres grants EXECUTE on functions to PUBLIC by default, and PostgREST
-- exposes every function in the `public` schema as POST /rest/v1/rpc/<name>.
-- Combined with SECURITY DEFINER (which every RPC in 0003 uses, so they can
-- run past RLS), that meant anyone holding the publishable anon key — the one
-- shipped inside every browser bundle — could call them.
--
-- Verified against a live project before writing this: `rpc/outlet_turn_stats`
-- returned real cross-tenant data, and `rpc/purge_expired_pii` was reachable
-- (it failed on argument arity, not on permission). purge_expired_pii() takes
-- no arguments and scrubs guest names, phones and notes for EVERY tenant in a
-- single statement, so that was an unauthenticated, irreversible, platform-wide
-- data-destruction endpoint.
--
-- None of this widens anything for the app: every .rpc() call site in src/ uses
-- createAdminSupabase() (service role), which bypasses grants entirely. The
-- browser never calls an RPC directly.

-- ---------------------------------------------------------------- functions

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

-- Future functions are locked down too, so a later migration can't silently
-- re-open this by forgetting to revoke.
alter default privileges in schema public revoke execute on functions from public;

-- The one exception, and it is not optional: functions called inside an RLS
-- policy expression are evaluated as the querying role and DO require EXECUTE.
-- Revoking these would make every policy in 0002 fail closed with "permission
-- denied for function", locking staff out of the dashboard entirely.
grant execute on function auth_org_id()               to authenticated;
grant execute on function auth_role()                 to authenticated;
grant execute on function can_access_outlet(uuid)     to authenticated;
grant execute on function is_manager()                to authenticated;
grant execute on function is_service_role()           to authenticated;

-- Deliberately NOT granted to anyone:
--   seat_guest, clear_table, merge_tables, unmerge_group  (server actions only)
--   next_ticket_code, rebuild_analytics_daily,
--   outlet_turn_stats, purge_expired_pii                  (server/cron only)
-- The service role bypasses grants, so all of the above keep working.

-- ------------------------------------------------------------------- outlets

-- 0002 granted `anon` SELECT on outlets with the comment "only the public-facing
-- columns are ever selected by that route". But RLS is row-level, not
-- column-level: the policy leaked the whole row — name, address, phone, org_id
-- and every operational knob — for every open outlet on the platform. That is a
-- complete customer list plus each tenant's configuration.
--
-- Nothing needs it. Confirmed every read of `outlets` in src/ is server-side
-- (createAdminSupabase or the cookie-bound server client); there are zero
-- browser-side reads, including on the public guest join page, which renders
-- server-side through the service role by design.
drop policy if exists outlet_public_read on outlets;

-- --------------------------------------------------------------- staff_users

-- `staff_manage` was FOR ALL with `using/with check (org_id = auth_org_id() and
-- is_manager())` and no constraint on the `role` column, so any manager could
-- PATCH their own row to role = 'superadmin' straight from the browser with
-- their own session. `superadmin` is the only gate on /admin, which then uses
-- the service-role client to read every organisation, outlet and subscription
-- on the platform. One manager on any tenant => the whole customer base.
drop policy if exists staff_manage on staff_users;
create policy staff_manage on staff_users for all to authenticated
  using (org_id = auth_org_id() and is_manager())
  with check (
    org_id = auth_org_id()
    and is_manager()
    -- only an existing superadmin may mint another one
    and (role <> 'superadmin' or auth_role() = 'superadmin')
  );

-- -------------------------------------------------------------- audit_events

-- audit_events was created by the do $$ loop in 0002, which grants INSERT and
-- UPDATE to every authenticated staff member for their own outlet. An audit log
-- the audited party can rewrite is not an audit log — and `actor_id` was never
-- pinned to auth.uid(), so entries could be forged against a colleague.
--
-- Writes come from recordAudit() in dashboard/actions.ts via the service role,
-- so removing the staff-facing write policies costs the app nothing.
drop policy if exists audit_events_insert on audit_events;
drop policy if exists audit_events_update on audit_events;

-- Same reasoning for the two tables whose numbers are reported back to the
-- people they measure: staff could overwrite their own performance stats or
-- fabricate delivery receipts. Both are written exclusively by the cron and by
-- server-side code holding the service role.
drop policy if exists analytics_daily_insert on analytics_daily;
drop policy if exists analytics_daily_update on analytics_daily;
drop policy if exists notification_logs_insert on notification_logs;
drop policy if exists notification_logs_update on notification_logs;

-- ------------------------------------------------------------------- outlets

-- Nothing enforced these at the database level, so a direct PostgREST PATCH by
-- an authenticated manager (which RLS permits via outlet_write) could bypass the
-- zod schema in settings/actions.ts. A negative or zero pii_retention_days turns
-- purge_expired_pii() into an immediate, retroactive wipe of live guests.
alter table outlets
  add constraint outlets_grace_period_min_ck   check (grace_period_min   between 0 and 120),
  add constraint outlets_grace_reoffers_ck     check (grace_reoffers     between 0 and 10),
  add constraint outlets_notify_lead_min_ck    check (notify_lead_min    between 0 and 240),
  add constraint outlets_max_party_size_ck     check (max_party_size     between 1 and 100),
  add constraint outlets_pii_retention_days_ck check (pii_retention_days between 1 and 3650);

-- --------------------------------------------------------------- merge_tables

-- Two bugs combined into a cross-tenant write:
--
--   1. `select outlet_id, floor_id, ... into ... group by outlet_id, floor_id`
--      is not STRICT. When p_ids spanned two outlets the GROUP BY returned more
--      than one row, SELECT INTO silently kept an arbitrary first row and
--      discarded the rest, so the "must share one outlet" guard below it never
--      fired. The final UPDATE then stamped merged_group_id onto the victim
--      tenant's table, pulling it out of their free-table pool.
--   2. mergeTablesAction resolved which outlet to authorise against from one
--      arbitrary row (.limit(1) with no ORDER BY) — fixed separately in TS.
--
-- Counting the distinct groups first makes the guard actually reachable. Also
-- adds FOR UPDATE so the occupancy check and the merge are no longer a TOCTOU
-- window a concurrent seat_guest can slip through.
create or replace function merge_tables(p_ids uuid[], p_label text default null)
returns table_groups
language plpgsql security definer set search_path = public as $$
declare
  v_outlet  uuid;
  v_floor   uuid;
  v_cap     int;
  v_label   text;
  v_groups  int;
  v_group   table_groups;
begin
  if array_length(p_ids, 1) is null or array_length(p_ids, 1) < 2 then
    raise exception 'merge needs at least two tables';
  end if;

  -- Lock the candidates for the rest of the transaction so nothing can seat or
  -- re-merge them between the checks below and the update at the end.
  perform 1 from restaurant_tables where id = any(p_ids) for update;

  select count(*) into v_groups
  from (
    select 1 from restaurant_tables
    where id = any(p_ids)
    group by outlet_id, floor_id
  ) g;

  if v_groups <> 1 then
    raise exception 'all tables in a merge must belong to one outlet and one floor';
  end if;

  select outlet_id, floor_id, sum(capacity), string_agg(label, '+' order by label)
    into strict v_outlet, v_floor, v_cap, v_label
  from restaurant_tables
  where id = any(p_ids)
  group by outlet_id, floor_id;

  -- Every id must have resolved to a real row; a bogus uuid would otherwise be
  -- silently dropped by the aggregate above.
  if (select count(*) from restaurant_tables where id = any(p_ids)) <> array_length(p_ids, 1) then
    raise exception 'one or more tables do not exist';
  end if;

  if not can_access_outlet(v_outlet) or not is_manager() then
    raise exception 'not authorised for this outlet';
  end if;

  if exists (
    select 1 from restaurant_tables
    where id = any(p_ids) and (status <> 'free' or merged_group_id is not null)
  ) then
    raise exception 'every table in a merge must be free and unmerged';
  end if;

  insert into table_groups (outlet_id, floor_id, label, capacity, status)
  values (v_outlet, v_floor, coalesce(p_label, v_label), v_cap, 'free')
  returning * into v_group;

  update restaurant_tables
     set merged_group_id = v_group.id
   where id = any(p_ids);

  return v_group;
end $$;

-- ------------------------------------------------------------- unmerge_group

-- The old version set every member to status 'free' unconditionally, so
-- un-merging a seated group silently freed occupied tables and left its
-- table_sessions rows open forever — the turn never closes, which quietly skews
-- avg_turn_min and every wait estimate derived from it.
create or replace function unmerge_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid;
  v_status table_status;
begin
  select outlet_id, status into v_outlet, v_status from table_groups where id = p_group;
  if v_outlet is null then
    raise exception 'group not found';
  end if;
  if not can_access_outlet(v_outlet) or not is_manager() then
    raise exception 'not authorised for this outlet';
  end if;

  if v_status = 'occupied' then
    raise exception 'clear the group before un-merging it';
  end if;

  update restaurant_tables
     set merged_group_id = null,
         status = v_status          -- inherit, rather than forcing 'free'
   where merged_group_id = p_group;

  delete from table_groups where id = p_group;
end $$;

-- --------------------------------------------------------- purge_expired_pii

-- The purge scrubbed queue_entries but missed notification_logs.payload, which
-- notify.ts fills with { params, preview } — params[0] is the guest's first name
-- and preview is the fully rendered message body. Guest names therefore survived
-- the retention window indefinitely, which defeats the point of the DPDP story.
create or replace function purge_expired_pii() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  with expired as (
    select e.id
    from queue_entries e
    join outlets o on o.id = e.outlet_id
    where e.purged_at is null
      and coalesce(e.closed_at, e.seated_at, e.joined_at)
            < now() - make_interval(days => o.pii_retention_days)
  ),
  scrubbed_logs as (
    update notification_logs l
       set payload = null
      from expired x
     where l.queue_entry_id = x.id and l.payload is not null
    returning 1
  )
  update queue_entries e
     set phone_e164 = null,
         guest_name = 'Guest',
         notes      = null,
         purged_at  = now()
    from expired x
   where e.id = x.id;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ------------------------------------------------------------------ indexes

-- rebuild_analytics_daily runs a correlated subquery per entry filtered on
-- (outlet_id, phone_e164) to classify new vs returning guests, but only
-- (phone_e164) was indexed. That runs for two days x every outlet, every minute.
create index if not exists queue_entries_outlet_phone_idx
  on queue_entries (outlet_id, phone_e164);

-- The WhatsApp webhook patches notification_logs keyed on provider_message_id,
-- but the index was non-unique, so a duplicate id would silently multi-update.
create unique index if not exists notification_logs_provider_message_id_key
  on notification_logs (provider_message_id)
  where provider_message_id is not null;
