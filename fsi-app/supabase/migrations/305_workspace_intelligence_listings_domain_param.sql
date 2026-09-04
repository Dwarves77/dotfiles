-- 305 — get_workspace_intelligence_listings: add an optional p_domain filter
--
-- PERF-11 lane (2026-09-04, docs/ops/session-log.md postscript 50 "the weight is elsewhere" brief).
--
-- THE BUG THIS FIXES [CONFIRMED, live read-only SQL against production, 2026-09-04, project
-- kwrsbpiseruzbfwjpvsp]. `src/app/regulations/page.tsx` calls `getListingsOnly({ limit: 60, offset: 0 })`
-- with NO domain filter, so `get_workspace_intelligence_listings` (the RPC behind it) returns the
-- workspace's global top-60-by-priority-then-date rows ACROSS ALL SEVEN intelligence_items.domain
-- values, not just Regulations (domain=1). Reproduced against the live corpus with the RPC's own
-- CASE-priority + added_date DESC + id ASC order (unpaged, org-independent slice):
--
--   SELECT domain, count(*) FROM (
--     SELECT ii.* FROM intelligence_items ii WHERE NOT ii.is_archived
--     ORDER BY CASE ii.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3
--                                WHEN 'LOW' THEN 4 ELSE 5 END, ii.added_date DESC, ii.id ASC
--     LIMIT 60
--   ) t GROUP BY domain;
--   -- => domain 1 (Regulations): 39 | domain 2 (Tech): 1 | domain 3 (Regional): 5
--   --    domain 4 (Market): 10   | domain 7 (Research): 5
--
-- Only 39 of the 60 rows the page fetches, serialises, and (pre-PERF-11 code fix, same lane) rendered
-- into RegulationsLedger are actually Regulations rows — 21 (35%) are Tech/Regional/Market/Research
-- items the page discards after paint. This is BOTH a correctness bug (the "first page" the FIRSTPAGE
-- lane built — 60 rows, newest-priority-first — never actually contains 60 regulations; the CRITICAL/
-- HIGH bands undercount by however many of the other six domains outrank a MODERATE/LOW regulation that
-- session) AND a payload-weight bug (roughly a third of the first-paint SSR payload's row count is
-- content the page never shows). The client-side `.filter(r => r.domain === REGULATIONS_DOMAIN)` this
-- same lane's code changes now apply for the *props* fixes the RENDER (nothing not-a-regulation is
-- shown), but it cannot fix the FETCH: 60 was never actually "60 regulations" for the wire cost this
-- migration's own row was written to close.
--
-- THE FIX: one nullable, DEFAULT NULL trailing parameter, `p_domain integer`. When supplied, adds
-- `AND ii.domain = p_domain` to the function's own WHERE clause, INSIDE the query the ORDER BY and
-- LIMIT/OFFSET pagination already run against — so the domain filter, the priority-band CASE rank, and
-- the `id ASC` tiebreak migration 272 already carries all apply in the SAME query plan, in the SAME
-- order FIRSTPAGE's own fix depends on (filter, then rank, then page — never an outer re-order that
-- could disturb the CASE rank the way the pre-FIRSTPAGE bug did). Omitted (NULL, every existing caller)
-- is a no-op: `ii.domain = NULL` would exclude every row, so the predicate is written
-- `(p_domain IS NULL OR ii.domain = p_domain)`, byte-identical output to today for every caller that
-- never passes it.
--
-- WHY A NEW PARAMETER, NOT A NEW RPC. `_workspace_active_items(p_org_id)` (migration 117) is the shared
-- base four other customer RPCs also source from (dashboard/listings/research/operations, migration 272
-- header) — parameterising it would ripple into all four for a fix only the listings caller (/regulations)
-- needs today. `get_workspace_intelligence_listings` is a leaf, sourced by exactly one page
-- (src/lib/data.ts's `getListingsOnly`, "Used by: /regulations" — its own header comment), so a leaf-level
-- parameter is the smallest change that closes the gap, matching migration 064's own "narrower projection,
-- new sibling only where needed" pattern named in this lane's brief.
--
-- WHY CREATE OR REPLACE IS SAFE HERE (unlike migration 272, which had to DROP first). 272's own header:
-- "CREATE OR REPLACE can change a function's BODY but never its RETURNS TABLE shape... adds a column to
-- all eight" — DROP was required because 272 widened the RETURNS TABLE. This migration does not touch
-- RETURNS TABLE at all, only appends one INPUT parameter with a DEFAULT at the end of the argument list —
-- Postgres's own CREATE OR REPLACE FUNCTION docs permit exactly this ("you can add new arguments to the
-- end of the argument list, provided they have default values"). No DROP, no GRANT-restore needed.
--
-- ACTIVATION IS FAIL-SOFT, NOT A MANUAL FLIP. Unlike migration 303's `LISTINGS_RPCS_WITH_OWN_TOTAL_ORDER`
-- allowlist (a name added by hand only once the coordinator confirms the migration live), this lane's
-- `fetchWorkspaceResources` (supabase-server.ts) tries the domain-scoped call FIRST when a page asks for
-- one, and on ANY error (including "function get_workspace_intelligence_listings(uuid, integer) does not
-- exist" — the exact shape a call against the PRE-305 signature returns) retries WITHOUT p_domain, i.e.
-- today's behavior. That means: this migration can land in this PR and the coordinator can apply it
-- whenever the two-track policy's DDL-before-code-commits window allows, with ZERO further code change or
-- manual gate-flip needed the moment it goes live — the very next request against a domain-scoped page
-- picks up the narrower query automatically. Before it applies, the page still works (degrades to today's
-- global-fetch-then-JS-filter behavior, the client-side fix already covers the render-side correctness),
-- it is simply not yet narrower on the wire. Regression-tested (buildWorkspaceItemsQuery.test.mjs, this
-- lane): the fallback path is exercised with a mock service client whose first `.rpc()` call errors and
-- second succeeds.
--
-- PRE-PATCH GUARD (live, read-only Supabase MCP execute_sql, project kwrsbpiseruzbfwjpvsp, 2026-09-04 —
-- NO write performed by this lane):
--   SELECT md5(pg_get_functiondef(p.oid)), length(pg_get_functiondef(p.oid))
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='get_workspace_intelligence_listings';
--   -- => 6e329b1f407a0e14ee19596b26eb3198, length 1481
-- Live body captured verbatim the same query (reproduced in v_old_def below) — unchanged since migration
-- 272 (303 touched only get_workspace_intelligence_slim's body, not this function's).
--
-- POST-APPLY VERIFICATION (to run after the coordinator actually applies this — not run by this lane):
--   SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_workspace_intelligence_listings';
--   -- expect: function signature `(p_org_id uuid, p_domain integer DEFAULT NULL::integer)` and
--   -- `WHERE (p_domain IS NULL OR ii.domain = p_domain)` present in the body.
--
-- Reversible: re-apply this file's old body (`v_old_def` below, unmodified) via CREATE OR REPLACE —
-- dropping the trailing default-valued parameter is itself a legal CREATE OR REPLACE (removes a
-- default-valued tail argument the same way 272's own precedent describes for the reverse direction).

DO $$
DECLARE
  v_def       text;
  v_pre_md5   constant text := '6e329b1f407a0e14ee19596b26eb3198';

  v_old_def   constant text :=
'CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso
  FROM public._workspace_active_items(p_org_id) ii
  ORDER BY
    CASE ii.effective_priority
      WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$
';

  v_new_def   constant text :=
'CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings(p_org_id uuid, p_domain integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, legacy_id text, title text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso
  FROM public._workspace_active_items(p_org_id) ii
  WHERE (p_domain IS NULL OR ii.domain = p_domain)
  ORDER BY
    CASE ii.effective_priority
      WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$
';

  v_count     int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_workspace_intelligence_listings';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORT 305: public.get_workspace_intelligence_listings not found';
  END IF;

  -- Already applied (p_domain already in the live signature) — no-op, idempotent re-run.
  IF v_def LIKE '%p_domain%' THEN
    RAISE NOTICE '305: already applied (p_domain already present) — no-op';
    RETURN;
  END IF;

  -- Guard on the exact live definition this patch was written against.
  IF md5(v_def) <> v_pre_md5 THEN
    RAISE EXCEPTION 'ABORT 305: live get_workspace_intelligence_listings md5 % differs from the body this patch was written for (%); read the live definition and re-derive before applying', md5(v_def), v_pre_md5;
  END IF;

  EXECUTE v_new_def;

  -- Post-patch verification.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_workspace_intelligence_listings';
  IF v_def NOT LIKE '%p_domain%' OR v_def NOT LIKE '%p_domain IS NULL OR ii.domain = p_domain%' THEN
    RAISE EXCEPTION 'ABORT 305: post-patch definition does not carry the p_domain parameter/filter';
  END IF;

  RAISE NOTICE '305 OK: get_workspace_intelligence_listings now accepts an optional p_domain filter; post md5 %', md5(v_def);
END $$;
