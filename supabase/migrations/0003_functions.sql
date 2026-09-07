-- Baari — transactional RPCs
-- Seating, merging and clearing all touch two or three tables at once. Doing
-- them in SQL keeps every staff device consistent even when two hosts tap the
-- same table at the same moment.

-- Short human ticket code, unique per outlet per day: A01..Z99
create or replace function next_ticket_code(p_outlet uuid) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) + 1 into n
  from queue_entries
  where outlet_id = p_outlet and joined_at >= date_trunc('day', now());
  return chr(65 + ((n / 100) % 26)) || lpad(((n % 100))::text, 2, '0');
end $$;

-- ------------------------------------------------------------ seat guest
-- Atomically: claim the table (or merged group), move the entry to `seated`,
-- and open a table_session for turn-time analytics. Raises if the target was
-- taken between the host's tap and the write.
create or replace function seat_guest(
  p_entry uuid,
  p_table uuid default null,
  p_group uuid default null
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
    (v_outlet, p_table, p_group, v_zone, v_floor, p_entry, v_entry.party_size, auth.uid());

  return v_entry;
end $$;

-- --------------------------------------------------------- clear a table
create or replace function clear_table(p_table uuid, p_to table_status default 'free')
returns void
language plpgsql security definer set search_path = public as $$
declare v_outlet uuid; v_group uuid;
begin
  select outlet_id, merged_group_id into v_outlet, v_group
    from restaurant_tables where id = p_table;
  if not found or not can_access_outlet(v_outlet) then
    raise exception 'not authorised';
  end if;

  update table_sessions set cleared_at = now()
   where cleared_at is null
     and (table_id = p_table or (v_group is not null and group_id = v_group));

  if v_group is not null then
    update table_groups set status = p_to where id = v_group;
    update restaurant_tables set status = p_to where merged_group_id = v_group;
  else
    update restaurant_tables set status = p_to where id = p_table;
  end if;
end $$;

-- -------------------------------------------------------- merge / unmerge
-- Members keep their own geometry so the 3D editor can draw the merged
-- footprint as a hull over the originals, and un-merge is a single delete.
create or replace function merge_tables(p_ids uuid[], p_label text default null)
returns table_groups
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid; v_floor uuid; v_cap int; v_label text; v_group table_groups;
begin
  if array_length(p_ids, 1) < 2 then raise exception 'merge needs 2+ tables'; end if;

  select outlet_id, floor_id, sum(capacity), string_agg(label, '+' order by label)
    into v_outlet, v_floor, v_cap, v_label
  from restaurant_tables
  where id = any(p_ids)
  group by outlet_id, floor_id;

  if v_outlet is null then raise exception 'tables must share one outlet and floor'; end if;
  if not can_access_outlet(v_outlet) or not is_manager() then
    raise exception 'manager rights required';
  end if;
  if exists (select 1 from restaurant_tables
             where id = any(p_ids) and (merged_group_id is not null or status = 'occupied')) then
    raise exception 'one or more tables are occupied or already merged';
  end if;

  insert into table_groups (outlet_id, floor_id, label, capacity)
  values (v_outlet, v_floor, coalesce(p_label, v_label), v_cap)
  returning * into v_group;

  update restaurant_tables set merged_group_id = v_group.id where id = any(p_ids);
  return v_group;
end $$;

create or replace function unmerge_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_outlet uuid;
begin
  select outlet_id into v_outlet from table_groups where id = p_group;
  if not found or not can_access_outlet(v_outlet) or not is_manager() then
    raise exception 'manager rights required';
  end if;
  update restaurant_tables set merged_group_id = null, status = 'free'
   where merged_group_id = p_group;
  delete from table_groups where id = p_group;
end $$;

-- ----------------------------------------------- turn-time observations
-- Feeds both wait-estimate modes. Party-size buckets: 1-2, 3-4, 5-6, 7+.
create or replace function party_bucket(n int) returns int
language sql immutable as $$
  select case when n <= 2 then 2 when n <= 4 then 4 when n <= 6 then 6 else 8 end
$$;

create or replace function outlet_turn_stats(p_outlet uuid, p_days int default 30)
returns table (bucket int, avg_turn_min real, sample_size bigint)
language sql stable security definer set search_path = public as $$
  select party_bucket(coalesce(ts.party_size, 2)) as bucket,
         avg(extract(epoch from (ts.cleared_at - ts.seated_at)) / 60)::real,
         count(*)
  from table_sessions ts
  where ts.outlet_id = p_outlet
    and ts.cleared_at is not null
    and ts.seated_at > now() - (p_days || ' days')::interval
  group by 1
$$;

-- --------------------------------------------------------- daily rollup
create or replace function rebuild_analytics_daily(p_outlet uuid, p_day date)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tz text;
begin
  select timezone into v_tz from outlets where id = p_outlet;

  with e as (
    select *,
           (joined_at at time zone v_tz)::date as local_day,
           extract(hour from (joined_at at time zone v_tz))::int as local_hour,
           extract(epoch from (seated_at - joined_at)) / 60 as wait_min
    from queue_entries
    where outlet_id = p_outlet
      and (joined_at at time zone v_tz)::date = p_day
  ),
  agg as (
    select
      count(*) filter (where true)                       as joined,
      count(*) filter (where notified_at is not null)    as notified,
      count(*) filter (where checked_in_at is not null)  as checked_in,
      count(*) filter (where status = 'seated')          as seated,
      count(*) filter (where status = 'no_show')         as no_show,
      count(*) filter (where status = 'left')            as left_queue,
      avg(wait_min) filter (where status = 'seated')::real                   as avg_wait,
      percentile_cont(0.5) within group (order by wait_min)
        filter (where status = 'seated')                                     as med_wait,
      avg(abs(((est_wait_low_min + est_wait_high_min) / 2.0) - wait_min))
        filter (where status = 'seated' and est_wait_low_min is not null)::real as est_err
    from e
  ),
  turns as (
    select avg(extract(epoch from (cleared_at - seated_at)) / 60)::real as avg_turn
    from table_sessions
    where outlet_id = p_outlet and cleared_at is not null
      and (seated_at at time zone v_tz)::date = p_day
  ),
  repeat as (
    select
      count(*) filter (where prior > 0) as returning_guests,
      count(*) filter (where prior = 0) as new_guests
    from (
      select e.id,
        (select count(*) from queue_entries q
          where q.outlet_id = p_outlet and q.phone_e164 = e.phone_e164
            and q.joined_at < e.joined_at) as prior
      from e where e.phone_e164 is not null
    ) s
  ),
  hourly as (
    select coalesce(jsonb_object_agg(local_hour::text, obj), '{}'::jsonb) as h
    from (
      select local_hour,
             jsonb_build_object(
               'joined', count(*),
               'seated', count(*) filter (where status = 'seated'),
               'abandoned', count(*) filter (where status in ('left', 'no_show')),
               'avg_wait', round(coalesce(avg(wait_min) filter (where status = 'seated'), 0)::numeric, 1)
             ) as obj
      from e group by local_hour
    ) x
  )
  insert into analytics_daily as ad
    (outlet_id, day, joined, notified, checked_in, seated, no_show, left_queue,
     avg_wait_min, median_wait_min, avg_turn_min, est_error_min,
     returning_guests, new_guests, hourly, updated_at)
  select p_outlet, p_day, agg.joined, agg.notified, agg.checked_in, agg.seated,
         agg.no_show, agg.left_queue, agg.avg_wait, agg.med_wait::real,
         turns.avg_turn, agg.est_err,
         coalesce(repeat.returning_guests, 0), coalesce(repeat.new_guests, 0),
         hourly.h, now()
  from agg, turns, repeat, hourly
  on conflict (outlet_id, day) do update set
    joined = excluded.joined, notified = excluded.notified,
    checked_in = excluded.checked_in, seated = excluded.seated,
    no_show = excluded.no_show, left_queue = excluded.left_queue,
    avg_wait_min = excluded.avg_wait_min, median_wait_min = excluded.median_wait_min,
    avg_turn_min = excluded.avg_turn_min, est_error_min = excluded.est_error_min,
    returning_guests = excluded.returning_guests, new_guests = excluded.new_guests,
    hourly = excluded.hourly, updated_at = now();
end $$;

-- ------------------------------------------------ DPDP retention purge
-- Strips PII from closed entries past the outlet's retention window while
-- leaving the anonymised row intact for analytics.
create or replace function purge_expired_pii() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  with victims as (
    select q.id from queue_entries q
    join outlets o on o.id = q.outlet_id
    where q.purged_at is null
      and q.phone_e164 is not null
      and coalesce(q.closed_at, q.seated_at, q.joined_at)
          < now() - (o.pii_retention_days || ' days')::interval
  )
  update queue_entries q
     set phone_e164 = null,
         guest_name = 'Guest',
         notes = null,
         purged_at = now()
    from victims v where q.id = v.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
