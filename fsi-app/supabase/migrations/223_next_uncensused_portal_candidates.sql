-- 223_next_uncensused_portal_candidates.sql
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
