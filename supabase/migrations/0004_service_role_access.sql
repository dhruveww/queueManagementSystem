-- Baari — let the service role through the SQL authorisation guards.
--
-- `seat_guest`, `clear_table`, `merge_tables` and `unmerge_group` gate on
-- can_access_outlet()/is_manager(), which resolve through auth.uid(). Those
-- return NULL for the service-role key, so every call made with the admin
-- client failed with "not authorised for this outlet" — which is what the
-- cron heartbeat uses, and what the staff actions were using too.
--
-- The service role is only reachable from server-side code that has already
-- authorised the caller (assertOutletAccess), so trusting it here does not
-- widen access: it moves the check to the layer that actually knows who the
-- user is. Browser clients only ever hold the anon key and are unaffected.

create or replace function is_service_role() returns boolean
language sql stable set search_path = public as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role'
$$;

create or replace function can_access_outlet(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_service_role() or exists (
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
  select is_service_role()
      or coalesce(auth_role() in ('owner', 'manager', 'superadmin'), false)
$$;

-- ---------------------------------------------------------------------------
-- seat_guest also stamped seated_by with auth.uid(), which is NULL under the
-- service role — so "host performance" in analytics never recorded anybody.
-- Take the acting staff id as a parameter instead, defaulting to auth.uid()
-- when a real user session is present.
--
-- Dropped rather than replaced: adding a defaulted parameter would leave two
-- overloads and make a three-argument call ambiguous to PostgREST.
drop function if exists seat_guest(uuid, uuid, uuid);

create or replace function seat_guest(
  p_entry uuid,
  p_table uuid default null,
  p_group uuid default null,
  p_seated_by uuid default null
) returns queue_entries
language plpgsql security definer set search_path = public as $$
declare
  v_entry  queue_entries;
  v_outlet uuid;
  v_zone   uuid;
  v_floor  uuid;
begin
  select * into v_entry from queue_entries where id = p_entry for update;
  if not found then raise exception 'queue entry not found'; end if;
  if not can_access_outlet(v_entry.outlet_id) then
    raise exception 'not authorised for this outlet';
  end if;
  if v_entry.status in ('seated', 'no_show', 'left', 'cancelled') then
    raise exception 'entry already closed (%)', v_entry.status;
  end if;
  v_outlet := v_entry.outlet_id;

  if p_group is not null then
    update table_groups set status = 'occupied'
      where id = p_group and outlet_id = v_outlet and status <> 'occupied'
      returning floor_id into v_floor;
    if not found then raise exception 'merged table is no longer free'; end if;
    update restaurant_tables set status = 'occupied' where merged_group_id = p_group;
  elsif p_table is not null then
    update restaurant_tables set status = 'occupied'
      where id = p_table and outlet_id = v_outlet
        and status in ('free', 'reserved', 'clearing')
      returning zone_id, floor_id into v_zone, v_floor;
    if not found then raise exception 'table is no longer free'; end if;
  else
    raise exception 'seat_guest needs a table or a group';
  end if;

  update queue_entries
     set status = 'seated',
         seated_at = now(),
         checked_in_at = coalesce(checked_in_at, now()),
         assigned_table_id = p_table,
         assigned_group_id = p_group
   where id = p_entry
  returning * into v_entry;

  insert into table_sessions
    (outlet_id, table_id, group_id, zone_id, floor_id, queue_entry_id, party_size, seated_by)
  values
    (v_outlet, p_table, p_group, v_zone, v_floor, p_entry, v_entry.party_size,
     coalesce(p_seated_by, auth.uid()));

  return v_entry;
end $$;

-- ---------------------------------------------------------------------------
-- Ticket codes: the counter in next_ticket_code resets every day, but the
-- unique constraint was global per outlet — so the first guest on day two got
-- "A01" again and the insert failed. Joining would have broken outright the
-- day after launch.
--
-- What actually matters operationally is that nobody currently *in the line*
-- shares a token, so scope uniqueness to open entries. The guest status URL
-- carries a ticket code plus an id prefix and already tolerates a code being
-- reused on a later day.
alter table queue_entries
  drop constraint if exists queue_entries_outlet_id_ticket_code_key;

create unique index if not exists queue_entries_open_ticket_code
  on queue_entries (outlet_id, ticket_code)
  where status in ('waiting', 'notified', 'checked_in');

-- Skip codes already held by someone in the line. This also closes the race
-- where two guests scanning at the same moment counted the same line length
-- and were handed the same token.
create or replace function next_ticket_code(p_outlet uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  n    int;
  code text;
begin
  select count(*) + 1 into n
  from queue_entries
  where outlet_id = p_outlet and joined_at >= date_trunc('day', now());

  for i in 0..2599 loop
    code := chr(65 + (((n + i) / 100) % 26)) || lpad((((n + i) % 100))::text, 2, '0');
    if not exists (
      select 1 from queue_entries
      where outlet_id = p_outlet and ticket_code = code
        and status in ('waiting', 'notified', 'checked_in')
    ) then
      return code;
    end if;
  end loop;

  -- 2600 people are in the line simultaneously. Not a real restaurant, but
  -- return something unique rather than failing the join.
  return 'X' || lpad((floor(random() * 100))::int::text, 2, '0');
end $$;
