-- Migration 042 — Community region count RPC
--
-- Date: 2026-05-04
-- Phase: C (perf hardening of /community shell pages)
--
-- Purpose
-- -------
-- The /community, /community/[slug], and /community/browse pages each
-- render a regional tab strip with a per-region group count. Until now
-- each page issued one HEAD count query per region (8 regions × 1
-- round-trip = 8 queries per page render), which dominated wall-clock
-- on those routes per the W5 perf audit (PERF-AUDIT.md, fix #3).
--
-- This migration replaces the loop with a single GROUP BY aggregation
-- exposed as an RPC: community_region_counts() returns one row per
-- region with its group count under the caller's RLS view.
--
-- Apply order
-- -----------
-- Depends on migration 028 (community_groups). Apply BEFORE deploying
-- the dependent code (the three /community pages will switch from the
-- 8-query loop to .rpc("community_region_counts") on the same PR).
--
-- Idempotent — uses CREATE OR REPLACE FUNCTION. Re-running this file
-- is safe.

create or replace function community_region_counts(
  p_privacy text default null
)
returns table (region text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  -- security invoker means the caller's RLS policies on community_groups
  -- apply, so this RPC sees exactly the groups the caller can SELECT
  -- (public groups + private groups they belong to). No service-role
  -- escape — same reachability surface as the 8-query loop it replaces.
  select g.region::text as region, count(*)::bigint as count
  from community_groups g
  where (p_privacy is null or g.privacy = p_privacy)
  group by g.region;
$$;

comment on function community_region_counts(text) is
  'Returns per-region group counts visible to the caller via RLS. '
  'Replaces the per-page 8-region head-count loop in /community* pages '
  '(PERF-AUDIT.md fix #3). Optional p_privacy filter narrows to public '
  'or private groups when set; null returns the full visible set.';

-- Grant — anon + authenticated execute. RLS on community_groups is
-- the actual gate (security invoker).
grant execute on function community_region_counts(text) to anon, authenticated;
