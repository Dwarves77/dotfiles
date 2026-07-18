-- 211_drain_worklist_and_mutation_leases.sql
--
-- PARALLEL DRAIN (operator ruling 2026-07-16): a second CC drain session opens under mutation leases. Two
-- writers exist as of today, so per-item mutual exclusion is the ONE infrastructure exception to the ratio rule.
-- This migration adds (1) drain_worklist — the DB-resident lane split (Lane A judgment / Lane B mechanical), and
-- (2) mutation_leases — a per-item lease (H5) so no item is ever worked by two sessions at once.
--
-- Both mirror the proven funded_pass_runlock (mig 205) atomic acquire-or-stale-takeover-or-fail pattern, so the
-- concurrency semantics are the same battle-tested shape. Additive tables + functions, no row rewrites.

-- ── LANE SPLIT ────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.drain_worklist (
  intelligence_item_id  uuid primary key,
  lane                  text not null check (lane in ('A', 'B')),
  primary_id_confirmed  boolean,
  target_match_verdict  text,
  defect_summary        jsonb,
  notes                 text,
  assigned_by           text,
  assigned_at           timestamptz not null default now()
);
comment on table public.drain_worklist is
  'Parallel-drain lane split (operator ruling 2026-07-16). Lane A = judgment (unverified/wrong primaries, re-acquisitions, conflation, non-EN, anything target-match has NOT id-confirmed). Lane B = mechanical (primary id-confirmed AND defects in the proven patterns: orphans / relabels / missing-slot injects / prefix-strips). One row per quarantined item; the classifier upserts it.';

-- ── PER-ITEM MUTATION LEASE (H5) ──────────────────────────────────────────────────────────────────────────
create table if not exists public.mutation_leases (
  intelligence_item_id  uuid primary key,     -- one LIVE lease per item (the row exists while leased)
  holder                text not null,        -- session identity (e.g. 'session-A' / 'session-B')
  lane                  text,
  acquired_at           timestamptz not null default now(),
  heartbeat_at          timestamptz not null default now()
);
comment on table public.mutation_leases is
  'Per-item mutation lease (H5, operator ruling 2026-07-16). A drain session acquires the lease before touching an item and releases it at bank; a live lease blocks the other session (acquired=false). heartbeat_at drives stale takeover so a crashed holder cannot wedge an item. The row EXISTS only while leased (release = delete).';

-- Atomic acquire-or-stale-takeover-or-fail (race-free, one round trip). cur_* OUT names prefixed to avoid the
-- plpgsql variable-vs-column shadow (same care as mig 205).
drop function if exists public.acquire_mutation_lease(uuid, text, text, integer);
create function public.acquire_mutation_lease(
  p_item uuid,
  p_holder text,
  p_lane text default null,
  p_stale_seconds integer default 300
) returns table(acquired boolean, takeover boolean, cur_holder text, cur_heartbeat timestamptz)
language plpgsql
as $$
begin
  insert into public.mutation_leases (intelligence_item_id, holder, lane, acquired_at, heartbeat_at)
  values (p_item, p_holder, p_lane, now(), now())
  on conflict (intelligence_item_id) do nothing;
  if found then
    acquired := true; takeover := false; cur_holder := p_holder; cur_heartbeat := now();
    return next; return;
  end if;

  -- lease row exists: ATOMIC stale takeover only if the incumbent heartbeat is past the threshold
  update public.mutation_leases
     set holder = p_holder, lane = p_lane, acquired_at = now(), heartbeat_at = now()
   where intelligence_item_id = p_item
     and heartbeat_at < now() - make_interval(secs => p_stale_seconds);
  if found then
    acquired := true; takeover := true; cur_holder := p_holder; cur_heartbeat := now();
    return next; return;
  end if;

  -- held by a live holder: fail loud, return the incumbent so the caller names who holds it
  select holder, heartbeat_at into cur_holder, cur_heartbeat
    from public.mutation_leases where intelligence_item_id = p_item;
  acquired := false; takeover := false;
  return next;
end;
$$;

-- Heartbeat: refresh THIS holder's heartbeat; empty return = lease was taken over (caller halts on that item).
create or replace function public.heartbeat_mutation_lease(p_item uuid, p_holder text)
returns table(still_held boolean)
language plpgsql
as $$
begin
  update public.mutation_leases set heartbeat_at = now()
   where intelligence_item_id = p_item and holder = p_holder;
  return query select found;
end;
$$;

-- Release: only the holder can release (a mismatched holder is a no-op, never steals a release).
create or replace function public.release_mutation_lease(p_item uuid, p_holder text)
returns table(released boolean)
language plpgsql
as $$
begin
  delete from public.mutation_leases
   where intelligence_item_id = p_item and holder = p_holder;
  return query select found;
end;
$$;
