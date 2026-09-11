-- 241_next_uncensused_portal_candidates.sql
--
-- Server-side census-exclusion for the plan-mode census walk (Session A intake-census handoff, operator
-- precondition 2026-07-21). consumePortalCandidates' --census-exclude previously anti-joined the census
-- table by building a CLIENT-SIDE `NOT IN ("url1","url2",...)` list of every already-dispositioned URL for
-- a source; that list OVERFLOWS the PostgREST query at ~435 dispositioned rows (an empty-message ledger
-- read error, hit live on Federal Register / DOT). The stock walk will far exceed 435 dispositioned rows
-- per source, so the exclusion must move server-side.
--
-- This RPC does the whole selection in ONE query: status='candidate', optional source scope, the NOT EXISTS
-- anti-join against dispositioned census_worklist rows (keyed (source_id, document_url), completion = a
-- non-null dryrun_disposition), and keyset pagination in (first_seen_at, id) order — ascending by default,
-- descending when p_newest. No client-built list, so it does not overflow at any scale.
--
-- READ-ONLY (SECURITY INVOKER, STABLE). Returns flat rows the consumer maps back to its LedgerCandidate
-- shape. Non-destructive: adds a function, touches no table.
--
-- RENUMBERED from 223 to 241 (task 5.3, 2026-09-11): master now uses 223 for
-- 223_acquisition_backlog_v.sql; this migration's body is unchanged from the original PR #370 authoring.
--
-- APPLIED LIVE (already, out-of-band, per the original 2026-07-21 session-log entry below): this exact
-- function already exists live under this name — this migration's CREATE OR REPLACE is a byte-identical
-- no-op against production, the same retroactive-capture posture as migration 223_acquisition_backlog_v.sql.
--
-- DUPLICATE-MIGRATION-HOME FINDING (task 5.3, 2026-09-11, [CONFIRMED]): migration 256
-- (256_migration_homes_and_vault_capture_key.sql, already merged to master and APPLIED LIVE 2026-08-11 --
-- see its inventory row and commit 1b155b10) independently re-captured this EXACT function, byte-for-byte,
-- as item 5 of its five-object migration-homes backfill. That capture already gave this function a committed
-- migration home a month before this file landed; 256's own inventory row states F24's NO_MIGRATION_HOME
-- allowlist went to EMPTY on that basis. Re-verified via Supabase MCP execute_sql (read-only, 2026-09-11):
-- live body md5 is STILL 879c7fa78d59e79da5321a67f2fa284d, matching both this file's pre-check and 256's
-- captured body. Applying THIS file is therefore a third confirmation of an unchanged body (2026-07-21
-- original out-of-band apply -> 2026-08-11 migration 256 capture -> this file), not a first-time landing.
-- It is landed anyway for PR #370's own audit trail (formally closing the stale PR under its reserved
-- migration number per the build plan) -- it is NOT required for DB correctness, and the coordinator may
-- skip applying it without losing anything 256 hasn't already given the repo. Flagged, not silently
-- resolved (rule 13): the duplication is a minor repo-hygiene debt (two migration files both claiming this
-- function), left for the coordinator/operator to rule on rather than unilaterally deleted here.
--
-- PRE-CHECK (md5 of the live function body this migration replaces, Supabase MCP execute_sql, read-only,
-- 2026-09-11 -- run this again immediately before applying; if the md5 differs, STOP and reconcile against
-- the new live body before proceeding, per rule 15 "attack, don't assert presence"):
--   SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS body_md5
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='next_uncensused_portal_candidates';
--   -- Expected (2026-09-11, this lane): next_uncensused_portal_candidates  879c7fa78d59e79da5321a67f2fa284d

create or replace function public.next_uncensused_portal_candidates(
  p_source_id uuid,
  p_limit int,
  p_newest boolean default false,
  p_after_first_seen timestamptz default null,
  p_after_id uuid default null
)
returns table (
  id uuid,
  url text,
  anchor_text text,
  source_id uuid,
  first_seen_at timestamptz,
  source_name text,
  source_category text,
  source_base_tier int
)
language sql
stable
as $$
  select plc.id, plc.url, plc.anchor_text, plc.source_id, plc.first_seen_at,
         s.name, s.category, s.base_tier
  from public.portal_link_candidates plc
  left join public.sources s on s.id = plc.source_id
  where plc.status = 'candidate'
    and (p_source_id is null or plc.source_id = p_source_id)
    and not exists (
      select 1
      from public.census_worklist cw
      where cw.source_id = plc.source_id
        and cw.document_url = plc.url
        and cw.dryrun_disposition is not null
    )
    and (
      p_after_first_seen is null
      or case
           when p_newest then (plc.first_seen_at < p_after_first_seen
                               or (plc.first_seen_at = p_after_first_seen and plc.id < p_after_id))
           else (plc.first_seen_at > p_after_first_seen
                 or (plc.first_seen_at = p_after_first_seen and plc.id > p_after_id))
         end
    )
  order by
    case when p_newest then plc.first_seen_at end desc,
    case when not p_newest then plc.first_seen_at end asc,
    case when p_newest then plc.id end desc,
    case when not p_newest then plc.id end asc
  limit greatest(p_limit, 0);
$$;

comment on function public.next_uncensused_portal_candidates is
  'Plan-mode census walk: next N portal_link_candidates for a source NOT yet dispositioned in census_worklist, keyset-paginated (first_seen_at,id). Server-side NOT EXISTS replaces the client NOT IN list that overflowed at ~435 dispositioned rows.';

grant execute on function public.next_uncensused_portal_candidates(uuid, int, boolean, timestamptz, uuid)
  to authenticated, service_role;

-- POST-CHECK (run immediately after applying; the whole point of the pre-check above is a no-op
-- byte-match, so the post-check re-reads the SAME md5 and asserts it is UNCHANGED, not merely present):
--   SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS body_md5
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='next_uncensused_portal_candidates';
--   -- Expect: next_uncensused_portal_candidates  879c7fa78d59e79da5321a67f2fa284d  (matches pre-check)
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='next_uncensused_portal_candidates';
--   -- Expect: 1 (no duplicate overload created)
