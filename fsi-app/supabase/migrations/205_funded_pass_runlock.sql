-- 205_funded_pass_runlock.sql
-- Funded-pass RUN-LOCK (Wave 2 concurrent-race incident, 2026-07-15). The race that zeroed two items was
-- possible because NOTHING mechanically prevented a second funded-pass process from driving the same worklist.
-- This is a DB-level lock: one logical lock row per lock_key, acquired at process start, heartbeat while alive,
-- released at clean exit, with a stale-lock takeover rule (a lock whose heartbeat is older than the stale
-- threshold is claimable, the takeover is logged in the row's holder fields). A second live acquisition FAILS
-- (acquired=false), and the runner exits with zero spend. Doctrine: funded-pass-single-entrypoint / run-lock.
--
-- Additive + safe against live data: new table (IF NOT EXISTS), new functions (CREATE OR REPLACE). No existing
-- table touched. Direct SQL reaches production; nothing here mutates the corpus.

create table if not exists public.funded_pass_runlock (
  lock_key      text primary key,
  holder_label  text,
  holder_pid    integer,
  holder_host   text,
  worklist_ref  text,
  acquired_at   timestamptz not null default now(),
  heartbeat_at  timestamptz not null default now()
);

comment on table public.funded_pass_runlock is
  'Funded-pass run-lock (mig 205). One row per lock_key; heartbeat_at drives the stale-takeover rule. A live '
  'holder blocks a second acquisition (acquired=false -> runner exits zero-spend). Prevents the 2026-07-15 '
  'concurrent-race that zeroed two items.';

-- Atomic acquire-or-takeover-or-fail in a single statement sequence (race-free; one DB round trip from the
-- runner). Returns exactly one row: acquired=true (fresh insert or stale takeover) or acquired=false (held by a
-- live holder, whose label/pid/heartbeat are returned so the runner can name the incumbent in its refusal).
-- The OUT column names are DELIBERATELY prefixed (cur_*) so they do NOT shadow the table columns holder_label/
-- holder_pid/heartbeat_at inside the WHERE/SELECT (the plpgsql variable-vs-column ambiguity that would otherwise
-- make `where heartbeat_at < ...` compare against the NULL OUT param and break stale takeover).
drop function if exists public.acquire_funded_pass_lock(text, text, integer, text, text, integer);
create function public.acquire_funded_pass_lock(
  p_key text,
  p_label text,
  p_pid integer,
  p_host text,
  p_worklist text,
  p_stale_seconds integer default 300
) returns table(acquired boolean, takeover boolean, cur_label text, cur_pid integer, cur_heartbeat timestamptz)
language plpgsql
as $$
begin
  -- fast path: insert if the lock row is absent
  insert into public.funded_pass_runlock (lock_key, holder_label, holder_pid, holder_host, worklist_ref, acquired_at, heartbeat_at)
  values (p_key, p_label, p_pid, p_host, p_worklist, now(), now())
  on conflict (lock_key) do nothing;
  if found then
    acquired := true; takeover := false; cur_label := p_label; cur_pid := p_pid; cur_heartbeat := now();
    return next; return;
  end if;

  -- lock row exists: attempt an ATOMIC stale takeover (only claims it if the heartbeat is past the threshold)
  update public.funded_pass_runlock
     set holder_label = p_label, holder_pid = p_pid, holder_host = p_host,
         worklist_ref = p_worklist, acquired_at = now(), heartbeat_at = now()
   where lock_key = p_key
     and heartbeat_at < now() - make_interval(secs => p_stale_seconds);
  if found then
    acquired := true; takeover := true; cur_label := p_label; cur_pid := p_pid; cur_heartbeat := now();
    return next; return;
  end if;

  -- held by a live holder: fail loud, return the incumbent
  select holder_label, holder_pid, heartbeat_at
    into cur_label, cur_pid, cur_heartbeat
    from public.funded_pass_runlock where lock_key = p_key;
  acquired := false; takeover := false;
  return next;
end;
$$;

-- Heartbeat: refresh the holder's heartbeat. Returns the row only while THIS holder still owns the lock; an
-- empty return means the lock was taken over (the runner treats that as "lost the lock" and halts).
create or replace function public.heartbeat_funded_pass_lock(p_key text, p_pid integer)
returns table(still_held boolean)
language plpgsql
as $$
begin
  update public.funded_pass_runlock
     set heartbeat_at = now()
   where lock_key = p_key and holder_pid = p_pid;
  return query select found;
end;
$$;

-- Release: drop the lock row iff THIS holder owns it (clean-exit release; a takeover already replaced the pid).
create or replace function public.release_funded_pass_lock(p_key text, p_pid integer)
returns void
language plpgsql
as $$
begin
  delete from public.funded_pass_runlock where lock_key = p_key and holder_pid = p_pid;
end;
$$;
