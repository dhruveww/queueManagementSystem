-- Baari — row level security
--
-- Access model:
--   staff/admin  -> authenticated JWT, scoped to their org (and outlet, for hosts)
--   guests       -> NEVER touch the DB directly. The public join/status pages
--                   run server-side with the service role and filter by
--                   ticket code, so `anon` gets read-only access to nothing
--                   but the outlet's public profile. This keeps phone numbers
--                   unreachable from the browser entirely.

-- --------------------------------------------------------- helper claims
create or replace function auth_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from staff_users where id = auth.uid()
$$;

create or replace function auth_role() returns staff_role
language sql stable security definer set search_path = public as $$
  select role from staff_users where id = auth.uid()
$$;

-- Hosts see only their assigned outlets; owners/managers see the whole org.
create or replace function can_access_outlet(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from outlets o
    join staff_users s on s.org_id = o.org_id
    where o.id = target
      and s.id = auth.uid()
      and (
        s.role in ('owner', 'manager', 'superadmin')
        or exists (select 1 from staff_outlets so
                   where so.staff_id = s.id and so.outlet_id = o.id)
      )
  )
$$;

create or replace function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() in ('owner', 'manager', 'superadmin'), false)
$$;

-- ------------------------------------------------------------ enable RLS
alter table organizations       enable row level security;
alter table subscriptions       enable row level security;
alter table outlets             enable row level security;
alter table staff_users         enable row level security;
alter table staff_outlets       enable row level security;
alter table floors              enable row level security;
alter table zones               enable row level security;
alter table table_groups        enable row level security;
alter table restaurant_tables   enable row level security;
alter table queue_entries       enable row level security;
alter table table_sessions      enable row level security;
alter table notification_logs   enable row level security;
alter table whatsapp_templates  enable row level security;
alter table analytics_daily     enable row level security;
alter table audit_events        enable row level security;

-- ------------------------------------------------------------- org level
create policy org_read on organizations for select to authenticated
  using (id = auth_org_id());
create policy org_write on organizations for update to authenticated
  using (id = auth_org_id() and is_manager());

create policy sub_read on subscriptions for select to authenticated
  using (org_id = auth_org_id());

create policy self_read on staff_users for select to authenticated
  using (id = auth.uid() or org_id = auth_org_id());
create policy staff_manage on staff_users for all to authenticated
  using (org_id = auth_org_id() and is_manager())
  with check (org_id = auth_org_id() and is_manager());

create policy staff_outlets_read on staff_outlets for select to authenticated
  using (exists (select 1 from staff_users s
                 where s.id = staff_outlets.staff_id and s.org_id = auth_org_id()));
create policy staff_outlets_write on staff_outlets for all to authenticated
  using (is_manager() and exists (select 1 from staff_users s
         where s.id = staff_outlets.staff_id and s.org_id = auth_org_id()))
  with check (is_manager());

-- ---------------------------------------------------------- outlet level
create policy outlet_read on outlets for select to authenticated
  using (can_access_outlet(id));
create policy outlet_write on outlets for update to authenticated
  using (org_id = auth_org_id() and is_manager());
create policy outlet_insert on outlets for insert to authenticated
  with check (org_id = auth_org_id() and is_manager());

-- The guest join page needs the outlet name/slug before anyone authenticates.
-- Only the public-facing columns are ever selected by that route, and phone
-- numbers live in a different table, so an open select here is safe.
create policy outlet_public_read on outlets for select to anon
  using (is_open = true);

-- ------------------------------------------ per-outlet operational tables
-- Same shape for every table that carries an outlet_id: staff of that outlet
-- read and write; geometry edits additionally require manager rights.
do $$
declare t text;
begin
  foreach t in array array[
    'floors', 'zones', 'table_groups', 'restaurant_tables',
    'queue_entries', 'table_sessions', 'notification_logs',
    'analytics_daily', 'audit_events'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (can_access_outlet(outlet_id))',
      t || '_read', t);
    execute format(
      'create policy %I on %I for insert to authenticated with check (can_access_outlet(outlet_id))',
      t || '_insert', t);
    execute format(
      'create policy %I on %I for update to authenticated using (can_access_outlet(outlet_id))',
      t || '_update', t);
  end loop;
end $$;

-- Deleting floor geometry is destructive and manager-only.
create policy tables_delete on restaurant_tables for delete to authenticated
  using (can_access_outlet(outlet_id) and is_manager());
create policy groups_delete on table_groups for delete to authenticated
  using (can_access_outlet(outlet_id) and is_manager());
create policy zones_delete on zones for delete to authenticated
  using (can_access_outlet(outlet_id) and is_manager());
create policy floors_delete on floors for delete to authenticated
  using (can_access_outlet(outlet_id) and is_manager());

create policy tmpl_read on whatsapp_templates for select to authenticated
  using (org_id = auth_org_id());
create policy tmpl_write on whatsapp_templates for all to authenticated
  using (org_id = auth_org_id() and is_manager())
  with check (org_id = auth_org_id() and is_manager());
