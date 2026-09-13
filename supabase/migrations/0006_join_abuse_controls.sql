-- Baari — abuse controls for the public join path.
--
-- joinQueueAction is unauthenticated by design (guests never get a session) and
-- sends a billed WhatsApp template to a phone number the caller supplies and
-- does not own. Before this there was no throttle of any kind: the only control
-- was a one-live-entry-per-phone dedupe, which stops a guest double-tapping on a
-- patchy connection and nothing else. The Indian mobile regex admits roughly
-- four billion distinct valid numbers, so that dedupe is not a rate limit.
--
-- A salted digest, never the raw address. We only ever compare for equality, and
-- a bare sha256 of an IPv4 address is trivially reversible by brute force — the
-- whole space is 2^32. The salt lives in LEAD_IP_SALT, outside the database, so
-- a database dump alone does not deanonymise anyone.
alter table queue_entries add column if not exists ip_hash text;

-- Answers "how many joins from this device in the last hour" as an index-only
-- count rather than a scan. Partial, because walk-ins added at the host desk
-- have no IP and would otherwise bloat it.
create index if not exists queue_entries_ip_hash_joined_idx
  on queue_entries (ip_hash, joined_at desc)
  where ip_hash is not null;

-- The per-outlet daily ceiling counts joins in a 24h window for one outlet.
-- (outlet_id, joined_at desc) already exists from 0001, so that one is covered.

-- ip_hash is operational data about a request, not something a guest supplies,
-- and it must be scrubbed on the same schedule as the rest of their PII. The
-- retention function is replaced wholesale here so the column list stays in one
-- place rather than drifting across migrations.
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
         ip_hash    = null,
         purged_at  = now()
    from expired x
   where e.id = x.id;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function purge_expired_pii() from public, anon, authenticated;
