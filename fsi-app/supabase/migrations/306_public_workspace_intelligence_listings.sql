-- 306 — org-independent PUBLIC listing RPCs for the four index pages (lane PERF-10, 2026-09-04).
--
-- RENUMBERED FROM 305 (PERF-MERGE lane, 2026-09-04, merging PERF-10 onto train 44's PERF-11 +
-- PERF-ARCH base): PERF-11's `305_workspace_intelligence_listings_domain_param.sql` was APPLIED
-- LIVE 2026-09-04 19:55 before this lane's merge began (one 2-arg overload on the org-scoped
-- `get_workspace_intelligence_listings`, `p_domain` trailing DEFAULT NULL) — this file, PERF-10's
-- distinct migration authored under the SAME number in a parallel lane, is renumbered to the next
-- free slot rather than colliding with an already-live 305. APPLY ORDER for the coordinator: 305 is
-- already live (no action); apply 306 (this file) whenever the two-track policy's window allows —
-- it does not depend on 305 having applied (the two migrations touch disjoint functions: 305 patches
-- the ORG-scoped `get_workspace_intelligence_listings`, 306 below CREATEs five NEW org-independent
-- `*_public()` siblings) — but `get_workspace_intelligence_listings_public()`'s own `p_domain`
-- parameter (folded in below, PERF-MERGE) mirrors 305's shape exactly, so if 306 is ever rolled back
-- and reapplied, apply it AFTER 305 so the two signatures read as one consistent design in the
-- catalog, even though nothing here enforces that ordering at runtime.
--
-- THE ASK, VERBATIM (operator, 2026-09-04): "clicking into any item or any page takes WAY too long.
-- multiple seconds. every click should show items on a page instantly."
--
-- ROOT CAUSE THIS MIGRATION ADDRESSES [CONFIRMED, docs/decisions/ADR-026-detail-cache-and-viewer-
-- state-split.md Context §2, re-confirmed this lane]: /regulations and /market's severity-banded
-- ledger fetch their listing rows via `get_workspace_intelligence_slim(p_org_id)` /
-- `get_workspace_intelligence_listings(p_org_id)`; /market, /operations, /research ALSO (or
-- instead) fetch a category-routed row set via `get_market_intel_items(p_org_id)` /
-- `get_operations_items(p_org_id)` / `get_research_items(p_org_id)` — ALL SIX are org-PARAMETERIZED
-- RPCs that `PERFORM public._assert_org_membership(p_org_id)` (raises on a NULL org_id — verified
-- live, this lane, for every one of the six: each one's first executable line is `PERFORM
-- public._assert_org_membership(p_org_id)`, and that function's own first line is `IF p_org_id IS
-- NULL THEN RAISE EXCEPTION`) and LEFT JOIN `workspace_item_overrides` on that org_id (directly, or
-- via the shared `_workspace_active_items(p_org_id)` helper the category RPCs route through).
-- Because the resolved org_id itself comes from `resolveOrgIdFromCookies()` (a Next.js Dynamic API
-- read), every render of these four pages is forced dynamic (`ƒ`) by these RPC calls alone —
-- independent of, and in addition to, the shared-layout cause PERF-10's other commits remove.
-- ADR-026's own Follow-up section named the fix: "Splitting the org-parameterized listing RPCs into
-- an org-independent public read + client-merged override layer (a migration) would let the four
-- index pages go static/ISR under the classic model... Needs a migration-authoring lane." This is
-- that migration — extended, within this same lane, to cover the category-routed RPCs once the
-- identical `_assert_org_membership`-blocks-NULL shape was confirmed live for those three as well
-- (self-check SQL below).
--
-- THE TWO NEW FUNCTIONS mirror `get_workspace_intelligence_slim`/`get_workspace_intelligence_listings`
-- EXACTLY (same SELECT list, same base predicate, same ORDER BY — verified against the live
-- definitions via Supabase MCP read-only, 2026-09-04, md5s below) with two differences: (1) no
-- `p_org_id` parameter and no `_assert_org_membership` call — genuinely org-independent, safe to
-- expose as a cached, shared read since it carries no per-org override or any other tenant-private
-- field; (2) no LEFT JOIN to `workspace_item_overrides` — `effective_priority`/`effective_archived`
-- collapse to the item's own `priority`/`is_archived` (the "no override" default), because there is
-- no org to look an override up FOR. The per-org override merge (priority_override, is_archived,
-- owner_user_id, notes) moves to the application layer: `src/stores/resourceStore.ts`'s existing,
-- already-tested `mergeWithOverrides(resources, overrides, personalState)` — the SAME function
-- RegulationsLedger.tsx and HomeSurface.tsx already call today to re-derive the effective view
-- client-side from raw resources + an overrides Map (grep-verified, this lane: neither call site
-- currently trusts the RPC's own effective_* columns over its own client-side merge — this
-- migration does not change that arrangement, it only changes where the RAW resources come from).
--
-- ARCHIVED-ROW BOUNDARY, MEASURED NOT ASSUMED (CLAUDE.md rule 14). The org-parameterized RPCs filter
-- `WHERE NOT COALESCE(wo.is_archived, ii.is_archived)` — an org's override CAN in principle set
-- `is_archived = false` to un-archive an item that is GLOBALLY archived (`ii.is_archived = true`),
-- which the org-independent version below (`WHERE NOT ii.is_archived`, no override visibility) would
-- never return, so the client-side merge would have no row to apply that override to. Checked live,
-- via Supabase MCP read-only, 2026-09-04:
--   SELECT count(*) FROM workspace_item_overrides wo JOIN intelligence_items ii ON ii.id = wo.item_id
--    WHERE wo.is_archived = false AND ii.is_archived = true AND ii.provenance_status = 'verified';
--   -- => 0 (zero live rows exercise this edge case today)
-- So filtering globally-archived rows out of the public RPC (keeping the payload at ~1,435 rows
-- instead of ~2,543 by also shipping every globally-archived verified item) is a measured
-- simplification, not a guess — flagged here so a future migration touching this predicate re-checks
-- the same query first if the operator ever wants org-level "resurrect a globally archived item."
--
-- CACHING MODEL: called from `src/lib/data.ts`'s new `getPublicResourcesOnly`/`getPublicListingsOnly`
-- via the service-role client (bypasses RLS the same way the existing org-parameterized callers do —
-- `_assert_org_membership`'s own `service_role` bypass branch is simply never reached here, since
-- these two functions never call it at all), wrapped in `unstable_cache` with NO org_id in the cache
-- key (genuinely one shared entry for the whole app) and a NEW tag (`PUBLIC_ITEMS_TAG`,
-- `src/lib/data.ts`) revalidated at the same population/maintenance apply completion point ADR-023
-- already names for `APP_DATA_TAG` — see this lane's REPORT for the exact call site.
--
-- KEYSET CURSOR (RECONCILE, PERF-12-MERGE lane, 2026-09-04, ADR-027 §2). PERF-12 originally built
-- true keyset-cursor pagination for /regulations' scroll-past-first-page path as a THIRD signature
-- on the ORG-SCOPED `get_workspace_intelligence_listings` (its own draft migration, numbered 306 in
-- a parallel worktree — a collision with THIS file, and itself defective: a bare `CREATE OR REPLACE`
-- with a new parameter list creates a SECOND overload beside the live 2-arg one, the exact
-- PostgREST-ambiguity defect the corrected 305 exists to prevent). Reconciled here instead, onto
-- `get_workspace_intelligence_listings_public` (this migration, not yet applied, so ONE CREATE
-- carries the final signature — no overload risk): `/api/listings/cursor` (the scroll-pagination
-- route `useLedgerInfiniteQuery`'s `fetchNextPage` calls) now pages this SAME org-independent,
-- cacheable RPC the SSR first page already uses, instead of the org-scoped one — no cookies, no
-- `resolveOrgIdFromCookies()`, on every scroll fetch, not just the first. PERF-12's own org-scoped
-- draft migration is DELETED, not applied (see docs/inventories/migrations.md's disposition row).
--
-- `p_after_priority text DEFAULT NULL, p_after_added_date date DEFAULT NULL, p_after_id uuid
-- DEFAULT NULL` — the caller passes back the LAST ROW of the previous page's own `(priority,
-- added_date, id)` triple, the exact three columns this function's own `ORDER BY CASE priority ...
-- END, added_date DESC, id ASC` sorts by. The WHERE clause is the row-comparison expansion of that
-- ORDER BY (rank ascending, added_date descending, id ascending) as an OR-chain of three
-- progressively-narrower AND clauses — not a Postgres `ROW()` comparison, because `ROW()` compares
-- lexicographically left-to-right using ONE direction for the whole tuple, and this ORDER BY mixes
-- ASC (rank), DESC (added_date), ASC (id) across its three columns, which a single `ROW() >` cannot
-- express:
--
--   (rank > after_rank)
--   OR (rank = after_rank AND added_date < after_added_date)
--   OR (rank = after_rank AND added_date = after_added_date AND id > after_id)
--
-- `v_after_rank` is computed with a SEARCHED `CASE WHEN p_after_priority IS NULL THEN NULL ELSE
-- ... END`, not `CASE p_after_priority WHEN NULL THEN NULL ...` (PERF-12's own draft carried this
-- exact bug in its org-scoped version, caught during reconciliation) — a simple-form `CASE x WHEN
-- NULL THEN ...` compiles to `x = NULL`, which SQL's three-valued logic makes NEVER true regardless
-- of `x`, so that arm can never fire and `v_after_rank` would fall through to the `ELSE` branch
-- (rank 5) for every NULL `p_after_priority`, corrupting the first page of every cursor-less query
-- that happened to pass a non-NULL `p_after_id` (never possible in practice today, since the client
-- always sends the full triple together — but a latent defect nonetheless, fixed here on the branch
-- that never shipped it live). `p_after_id IS NULL` alone gates the entire predicate — passing NULL
-- (every existing zero/one-arg caller) short-circuits it to TRUE, byte-identical to today.
--
-- WRITTEN, NOT APPLIED BY THIS LANE. Supabase MCP is read-only for this lane; the coordinator applies
-- this file via Supabase MCP after landing, then the post-check block at the bottom verifies the live
-- result (same shape as migration 304's own post-check).
--
-- Reversible: `DROP FUNCTION IF EXISTS public.get_workspace_intelligence_slim_public();
-- DROP FUNCTION IF EXISTS public.get_workspace_intelligence_listings_public(integer);
-- DROP FUNCTION IF EXISTS public.get_market_intel_items_public();
-- DROP FUNCTION IF EXISTS public.get_operations_items_public();
-- DROP FUNCTION IF EXISTS public.get_research_items_public();` — all five are pure reads with no
-- dependents at creation time (nothing in this migration references them from a trigger, view, or
-- another function).
--
-- SELF-CHECK (read-only, via Supabase MCP `execute_sql`, project kwrsbpiseruzbfwjpvsp, 2026-09-04 —
-- NO write performed by this lane; confirms none of the five functions already exists under a
-- different migration, and anchors the SOURCE definitions this migration mirrors):
--
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND proname IN ('get_workspace_intelligence_slim_public','get_workspace_intelligence_listings_public',
--                       'get_market_intel_items_public','get_operations_items_public','get_research_items_public');
--   -- => 0 rows (2026-09-04) — confirmed none exists yet.
--
--   SELECT md5(pg_get_functiondef(p.oid)), length(pg_get_functiondef(p.oid)), p.proname
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN ('get_workspace_intelligence_slim','get_workspace_intelligence_listings',
--                       'get_market_intel_items','get_operations_items','get_research_items','_workspace_active_items');
--   -- => get_workspace_intelligence_listings  6e329b1f407a0e14ee19596b26eb3198  len 1481
--   -- => get_workspace_intelligence_slim      3ca10db08f84c019c9fa0e16bfe3b49b  len 1806
--   -- => get_market_intel_items    (STABLE SECURITY DEFINER, PERFORM _assert_org_membership(p_org_id)
--   --      first line, LEFT JOIN workspace_item_overrides wo ON wo.item_id=ii.id AND wo.org_id=p_org_id,
--   --      WHERE NOT COALESCE(wo.is_archived, ii.is_archived) AND ii.provenance_status='verified' AND
--   --      surface_of(ii.item_type, ii.domain)='market' — read via pg_get_functiondef, 2026-09-04)
--   -- => get_operations_items / get_research_items (same shape, routed through
--   --      _workspace_active_items(p_org_id) — itself PERFORM _assert_org_membership(p_org_id) first
--   --      line, LEFT JOIN workspace_item_overrides on org_id, WHERE NOT COALESCE(wo.is_archived,
--   --      ii.is_archived) AND ii.provenance_status='verified' — then filtered by surface_of(...)=
--   --      'operations'/'research' respectively; get_research_items additionally self-joins
--   --      intelligence_items for what_it_changes/does_not_resolve, unnecessary below since the public
--   --      functions read intelligence_items directly)
--   -- (these are the SOURCE definitions the five new functions below mirror minus the org join/guard;
--   --  this migration does not modify any existing function — all five stay byte-identical.)

-- 1. get_workspace_intelligence_slim_public() — org-independent counterpart to
--    get_workspace_intelligence_slim(p_org_id). Feeds src/lib/data.ts's getPublicResourcesOnly
--    (used by /operations, /market first-paint pagination — same two consumers
--    get_workspace_intelligence_slim already had).
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_slim_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.priority::text  AS effective_priority,
    ii.is_archived      AS effective_archived,
    ii.jurisdiction_iso
  FROM public.intelligence_items ii
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

COMMENT ON FUNCTION public.get_workspace_intelligence_slim_public() IS
  'Org-independent counterpart to get_workspace_intelligence_slim(p_org_id) (migration 306, lane '
  'PERF-10, 2026-09-04). No org membership check, no workspace_item_overrides join -- effective_* '
  'columns are the item''s own priority/is_archived (the "no override" default). The caller merges '
  'per-org overrides client-side via src/stores/resourceStore.ts''s mergeWithOverrides. Cached in '
  'src/lib/data.ts under a single shared unstable_cache entry (no org_id in the key), tag '
  'PUBLIC_ITEMS_TAG, revalidated at population/maintenance apply completion.';

-- 2. get_workspace_intelligence_listings_public(p_domain) — org-independent counterpart to
--    get_workspace_intelligence_listings(p_org_id [, p_domain]). Feeds src/lib/data.ts's
--    getPublicListingsOnly (used by /regulations, and market/[slug]'s related-signals pool once
--    item-scoped — see this lane's REPORT).
--
--    P_DOMAIN (PERF-MERGE, 2026-09-04, folded in at merge time — see this file's header). PERF-11's
--    305 gave the ORG-scoped sibling `get_workspace_intelligence_listings` an optional trailing
--    `p_domain integer DEFAULT NULL` so /regulations (still the authenticated path, when an org_id
--    resolves) fetches only domain=1 rows instead of the workspace's global top-N-by-priority slice
--    (measured there: only 39 of 60 rows were actually Regulations). The STATIC /regulations page
--    (this lane's whole point) calls this PUBLIC function instead once no org_id is available at
--    render time, and needs the identical narrowing for the identical reason — omitting it here would
--    have reintroduced 305's own bug on the org-independent path this migration adds. Same predicate
--    shape as 305: `(p_domain IS NULL OR ii.domain = p_domain)`, appended after the existing WHERE, so
--    every existing zero-arg caller (`SELECT * FROM get_workspace_intelligence_listings_public()`) is
--    byte-identical in output — PostgREST resolves a zero-arg call to the DEFAULT-valued signature,
--    same overload-avoidance PERF-MERGE's correction of 305 established (one signature, not two).
CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings_public(
  p_domain integer DEFAULT NULL::integer,
  p_after_priority text DEFAULT NULL::text,
  p_after_added_date date DEFAULT NULL::date,
  p_after_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(id uuid, legacy_id text, title text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_after_rank int;
BEGIN
  -- Searched CASE, not `CASE p_after_priority WHEN NULL THEN ...` — see this migration's own
  -- header for why the simple form is a latent bug (`x = NULL` is never true).
  v_after_rank := CASE
    WHEN p_after_priority IS NULL THEN NULL
    ELSE (CASE p_after_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END)
  END;
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.priority::text  AS effective_priority,
    ii.is_archived      AS effective_archived,
    ii.jurisdiction_iso
  FROM public.intelligence_items ii
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND (p_domain IS NULL OR ii.domain = p_domain)
    AND (
      p_after_id IS NULL
      OR (
        (CASE ii.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END) > v_after_rank
        OR ((CASE ii.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END) = v_after_rank AND ii.added_date < p_after_added_date)
        OR ((CASE ii.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END) = v_after_rank AND ii.added_date = p_after_added_date AND ii.id > p_after_id)
      )
    )
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

COMMENT ON FUNCTION public.get_workspace_intelligence_listings_public(integer, text, date, uuid) IS
  'Org-independent counterpart to get_workspace_intelligence_listings(p_org_id, p_domain) (migration '
  '306, lane PERF-10, 2026-09-04; p_domain folded in by PERF-MERGE to match 305''s org-scoped '
  'sibling; the keyset-cursor triple p_after_priority/p_after_added_date/p_after_id folded in by the '
  'PERF-12-MERGE reconciliation lane so /api/listings/cursor pages this same org-independent RPC). '
  'No org membership check, no workspace_item_overrides join. See '
  'get_workspace_intelligence_slim_public''s comment for the shared rationale.';

-- 3. get_market_intel_items_public() — org-independent counterpart to get_market_intel_items(p_org_id).
--    Feeds src/lib/data.ts's getPublicMarketIntelItems (used by /market's category-routed ledger).
--    Mirrors the source function's SELECT list and surface_of(...)='market' predicate exactly, minus
--    the org join/guard — see this file's header for the verified live source shape.
CREATE OR REPLACE FUNCTION public.get_market_intel_items_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, signal_band text, trajectory_points jsonb, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, conversion_trigger text, cross_references text, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type, ii.source_id,
    ii.source_url, ii.jurisdictions, ii.transport_modes, ii.verticals, ii.status,
    ii.severity, ii.signal_band, ii.trajectory_points, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date, ii.added_date,
    ii.last_verified, ii.is_archived, ii.what_it_changes, ii.conversion_trigger,
    ii.cross_references,
    ii.priority::text   AS effective_priority,
    ii.is_archived        AS effective_archived,
    ii.jurisdiction_iso
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'market'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

COMMENT ON FUNCTION public.get_market_intel_items_public() IS
  'Org-independent counterpart to get_market_intel_items(p_org_id) (migration 306, lane PERF-10, '
  '2026-09-04). No org membership check, no workspace_item_overrides join. See '
  'get_workspace_intelligence_slim_public''s comment for the shared rationale.';

-- 4. get_operations_items_public() — org-independent counterpart to get_operations_items(p_org_id).
--    Feeds src/lib/data.ts's getPublicOperationsItems. Reads intelligence_items directly (not via
--    _workspace_active_items(p_org_id), which itself asserts org membership) — same predicate that
--    helper applies (NOT is_archived AND provenance_status='verified'), filtered to surface_of(...)=
--    'operations'.
CREATE OR REPLACE FUNCTION public.get_operations_items_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.priority::text   AS effective_priority,
    ii.is_archived        AS effective_archived,
    ii.jurisdiction_iso
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'operations'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

COMMENT ON FUNCTION public.get_operations_items_public() IS
  'Org-independent counterpart to get_operations_items(p_org_id) (migration 306, lane PERF-10, '
  '2026-09-04). No org membership check, reads intelligence_items directly rather than through '
  '_workspace_active_items(p_org_id) (which itself asserts org membership) — same predicate. See '
  'get_workspace_intelligence_slim_public''s comment for the shared rationale.';

-- 5. get_research_items_public() — org-independent counterpart to get_research_items(p_org_id).
--    Feeds src/lib/data.ts's getPublicResearchItems. what_it_changes/does_not_resolve read directly
--    off `ii` (intelligence_items) — the org-parameterized original self-joins intelligence_items a
--    second time only because _workspace_active_items(p_org_id) does not return those two columns;
--    this function selects straight from intelligence_items, so no second join is needed.
CREATE OR REPLACE FUNCTION public.get_research_items_public()
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, does_not_resolve text, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.what_it_changes, ii.does_not_resolve,
    ii.priority::text   AS effective_priority,
    ii.is_archived        AS effective_archived,
    ii.jurisdiction_iso
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE NOT ii.is_archived
    AND ii.provenance_status = 'verified'
    AND public.surface_of(ii.item_type, ii.domain) = 'research'
  ORDER BY
    CASE ii.priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

COMMENT ON FUNCTION public.get_research_items_public() IS
  'Org-independent counterpart to get_research_items(p_org_id) (migration 306, lane PERF-10, '
  '2026-09-04). No org membership check, reads intelligence_items directly (no second self-join '
  'needed — see this function''s own comment above). See get_workspace_intelligence_slim_public''s '
  'comment for the shared rationale.';

-- 6. Explicit grants (parity with the org-parameterized originals — verified live, this lane, all
--    five already carry anon/authenticated/service_role EXECUTE via the PUBLIC default grant; stated
--    explicitly here rather than relied on implicitly).
GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_slim_public() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_listings_public(integer, text, date, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_market_intel_items_public() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_operations_items_public() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_research_items_public() TO anon, authenticated, service_role;

-- ── Post-check (idempotent — safe to re-run; matches migration 304's own shape) ─────────────────────
DO $$
DECLARE
  fn text;
  n_found int;
  n_rows_slim int;
  n_rows_listings int;
  n_rows_market int;
  n_rows_operations int;
  n_rows_research int;
BEGIN
  -- Presence: all five new functions must exist.
  FOREACH fn IN ARRAY ARRAY[
    'get_workspace_intelligence_slim_public',
    'get_workspace_intelligence_listings_public',
    'get_market_intel_items_public',
    'get_operations_items_public',
    'get_research_items_public'
  ]
  LOOP
    SELECT count(*) INTO n_found FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn;
    IF n_found <> 1 THEN
      RAISE EXCEPTION 'ABORT: % missing (found %)', fn, n_found;
    END IF;
  END LOOP;

  -- Every one must actually be callable with zero arguments and return rows consistent with the
  -- live verified/non-archived population (a real invocation, not just a catalog presence check —
  -- rule 15, "a guard is proven by attack/execution, not by presence").
  SELECT count(*) INTO n_rows_slim FROM public.get_workspace_intelligence_slim_public();
  SELECT count(*) INTO n_rows_listings FROM public.get_workspace_intelligence_listings_public();
  SELECT count(*) INTO n_rows_market FROM public.get_market_intel_items_public();
  SELECT count(*) INTO n_rows_operations FROM public.get_operations_items_public();
  SELECT count(*) INTO n_rows_research FROM public.get_research_items_public();

  IF n_rows_slim = 0 THEN
    RAISE EXCEPTION 'ABORT: get_workspace_intelligence_slim_public() returned 0 rows — expected the live verified/non-archived population';
  END IF;
  IF n_rows_slim <> n_rows_listings THEN
    RAISE EXCEPTION 'ABORT: slim_public (%) and listings_public (%) row counts disagree — same base predicate, must match', n_rows_slim, n_rows_listings;
  END IF;

  -- The three category-routed functions are each a STRICT SUBSET of the full verified/non-archived
  -- population (surface_of(...) partitions it) — each must be > 0 (today's live corpus has rows on
  -- every one of the three surfaces) and none can exceed the full population.
  IF n_rows_market = 0 THEN
    RAISE EXCEPTION 'ABORT: get_market_intel_items_public() returned 0 rows — expected a nonzero market-surface slice of the live population';
  END IF;
  IF n_rows_operations = 0 THEN
    RAISE EXCEPTION 'ABORT: get_operations_items_public() returned 0 rows — expected a nonzero operations-surface slice of the live population';
  END IF;
  IF n_rows_research = 0 THEN
    RAISE EXCEPTION 'ABORT: get_research_items_public() returned 0 rows — expected a nonzero research-surface slice of the live population';
  END IF;
  IF n_rows_market > n_rows_slim OR n_rows_operations > n_rows_slim OR n_rows_research > n_rows_slim THEN
    RAISE EXCEPTION 'ABORT: a category-routed public function (market=%, operations=%, research=%) exceeds the full population (%) — surface_of(...) must partition, not expand',
      n_rows_market, n_rows_operations, n_rows_research, n_rows_slim;
  END IF;

  -- p_domain (PERF-MERGE fold-in): a domain=1 call must be a nonzero, strict subset of the unfiltered
  -- call, and the two must sum consistently — proves the parameter actually filters (rule 15) rather
  -- than merely existing in the signature. domain=1 is Regulations (this file's header + 305's own
  -- comment); any live corpus has Regulations rows, so 0 here is a real defect, not a data gap.
  DECLARE
    n_rows_domain1 int;
  BEGIN
    SELECT count(*) INTO n_rows_domain1 FROM public.get_workspace_intelligence_listings_public(1);
    IF n_rows_domain1 = 0 THEN
      RAISE EXCEPTION 'ABORT: get_workspace_intelligence_listings_public(1) returned 0 rows — p_domain is not filtering, or domain=1 (Regulations) is empty';
    END IF;
    IF n_rows_domain1 >= n_rows_listings THEN
      RAISE EXCEPTION 'ABORT: get_workspace_intelligence_listings_public(1) (%) is not a strict subset of the unfiltered call (%) — p_domain appears to be a no-op', n_rows_domain1, n_rows_listings;
    END IF;
  END;

  -- Keyset cursor (PERF-12-MERGE reconciliation fold-in): take the FIRST domain=1 row (the RPC's
  -- own total order) as a real cursor boundary and confirm the SAME call, cursor-scoped, returns
  -- exactly one fewer row (the first row itself excluded, nothing else) — proves the OR-chain WHERE
  -- actually re-anchors on the row's own (priority, added_date, id) identity rather than being a
  -- no-op or an off-by-more-than-one, and exercises the v_after_rank searched-CASE fix live (a
  -- domain=1 corpus with at least one CRITICAL/HIGH row would previously have miscomputed rank for
  -- the `CASE p_after_priority WHEN NULL ...` bug's sibling failure mode — see this file's header).
  DECLARE
    n_rows_domain1 int;
    v_first_priority text;
    v_first_added_date date;
    v_first_id uuid;
    n_rows_after_first int;
  BEGIN
    SELECT count(*) INTO n_rows_domain1 FROM public.get_workspace_intelligence_listings_public(1);
    SELECT effective_priority, added_date, id
      INTO v_first_priority, v_first_added_date, v_first_id
      FROM public.get_workspace_intelligence_listings_public(1)
      LIMIT 1;
    IF v_first_id IS NULL THEN
      RAISE EXCEPTION 'ABORT: could not read a first row from get_workspace_intelligence_listings_public(1) to build a cursor boundary';
    END IF;
    SELECT count(*) INTO n_rows_after_first
      FROM public.get_workspace_intelligence_listings_public(1, v_first_priority, v_first_added_date, v_first_id);
    IF n_rows_after_first <> n_rows_domain1 - 1 THEN
      RAISE EXCEPTION 'ABORT: cursor-scoped call after the first row returned % rows, expected exactly % (domain1 count %s minus the excluded first row) — the keyset WHERE is not re-anchoring correctly',
        n_rows_after_first, n_rows_domain1 - 1, n_rows_domain1;
    END IF;
  END;
END $$;
