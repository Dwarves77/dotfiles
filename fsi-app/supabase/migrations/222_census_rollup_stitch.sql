-- 222_census_rollup_stitch.sql
--
-- CENSUS ROLLUP STITCH (Session B, 2026-07-19). Two parts:
--
-- PART 1: retroactive capture of coverage_gap_census_findings (Session C's discovery-lane table).
-- Session C authored and owns this table's design; it was applied live with no committed migration file,
-- the same DDL-before-migration gap this session's own census_worklist migration (221) was corrected for
-- (see the findings entry, docs/ops/session-log.md 2026-07-19). Session B captures it here, verified by
-- fresh introspection against the live table (columns, constraints, indexes, comments), not written from
-- memory, so PART 2's view is reproducible from a blank database rather than silently depending on a table
-- that exists live but nowhere in committed history on master. CREATE TABLE IF NOT EXISTS is idempotent: if
-- Session C's own migration for this table lands separately, this is a no-op, never a conflict.
--
-- PART 2: census_rollup_by_surface, the rollup view census_worklist's own header commits Session B to
-- owning. Session C's schema-stitch review (commit b5185b6d, coordination posted to session-log/board,
-- read as the spec per operator instruction) found a STRUCTURAL GRAIN MISMATCH, not a naming one:
-- census_worklist.source_id is NOT NULL (models documents inside an ALREADY-HELD source); every one of
-- coverage_gap_census_findings' rows is a candidate SOURCE not yet held (verified: zero of 81 rows match a
-- registered sources row). The two tables cannot be joined by a literal foreign key at the row grain, so
-- this view does NOT force a merge. It normalizes both to a common per-surface REPORTING projection:
--   - held / missing-from-held-sources          -- from census_worklist (Session A/B's half)
--   - missing-from-the-world                    -- from coverage_gap_census_findings (Session C's half)
--   - pending-on-Session-A                       -- coverage_gap_census_findings.pending_dependency,
--                                                    carried as its OWN visible count, never folded
--                                                    silently into "missing" (Session C's explicit ask)
-- Alignment is applied ONLY where semantics genuinely match (Session C's own finding, honored verbatim):
--   - lane matches natively ('A'/'C' on both, no translation)
--   - would_mint is the one disposition value aligned across both vocabularies; the REST of each
--     vocabulary is deliberately NOT unified (census_worklist's dedup_hit/congruence_reject/
--     invariant_reject/hold is a mechanical mint-chokepoint dryRun verdict; coverage_gap_census_findings'
--     would_decline/would_park/browser_required_undetermined/not_applicable is a fetch-light content-fit
--     judgment -- forcing these into one vocabulary would lose real information on both sides)
--   - surface_tags (census_worklist, text[]) and four_contract_classification (coverage_gap_census_
--     findings, jsonb keyed by surface with verdict/reason, verified live shape: {"regulations":
--     {"verdict":"IN"|"OUT","reason":...}, "operations":{...}, "market_intel":{...}, "research":{...}},
--     Community correctly absent on both sides) carry the same four machine-addressable surfaces --
--     unnested to the same 'surface' grain for the GROUP BY, never rewriting either table's native shape.
--
-- Feeds docs/census/gap-census-2026-07.md's "Rollup tallies > Per surface" table (Task 3); that table's
-- five columns map directly onto this view's five count columns.

BEGIN;

-- ── PART 1: retroactive capture, Session C's table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coverage_gap_census_findings (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lane                         text NOT NULL DEFAULT 'C',
  sweep                        text NOT NULL
                                 CHECK (sweep IN ('sweep1_existing_feed_audit', 'sweep2_adjacent_universes', 'sweep3_research_feedstock')),
  subject_type                 text NOT NULL
                                 CHECK (subject_type IN ('existing_feed', 'candidate_source', 'candidate_catalog')),
  subject_ref                  text NOT NULL,
  instrument                   text NOT NULL,
  jurisdiction                 text,
  url                          text,
  fetch_method                 text NOT NULL
                                 CHECK (fetch_method IN ('plain_http', 'api', 'feed_xml', 'browser_required', 'not_applicable')),
  fetch_result                 text,
  four_contract_classification jsonb,
  dry_run_disposition          text NOT NULL
                                 CHECK (dry_run_disposition IN ('would_mint', 'would_decline', 'would_park', 'browser_required_undetermined', 'not_applicable')),
  dry_run_reason               text,
  entity_confirmed             boolean NOT NULL DEFAULT false,
  notes                        text,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  pending_dependency           text
                                 CHECK (pending_dependency IN ('session_a_chrome_render', 'session_a_register_walk'))
);

COMMENT ON TABLE public.coverage_gap_census_findings IS
  'Session C discovery-lane census artifact (2026-07-19 mandate). NOT the corpus: zero staged_updates rows, zero intelligence_items, zero source registrations. Records what already-held free feeds, adjacent enumerable universes, and Research feedstock catalogs actually carry, classified against the four surface contracts, with a dryRun (predictive, non-binding) disposition. Distinct from coverage_gap_candidates (new-instrument acquisition pricing) and from disposition/surface_test there (real operator-ruled outcomes). Retroactively captured into a committed migration by Session B (mig 222) as a precondition for the rollup-view stitch; authorship and ownership stay with Session C.';
COMMENT ON COLUMN public.coverage_gap_census_findings.pending_dependency IS
  'Operator-ruled visibility marker (2026-07-19): non-NULL means this row''s finding is provisional pending Session A''s queue. session_a_chrome_render = genuine fetch-light block (403/404/timeout/cert/SPA-shell). session_a_register_walk = page reachable but real content is one hop deeper behind a register/portal index (B2 register-walk territory, not raw rendering). NULL = resolved this pass, no A-dependency.';

-- RLS matches the live table's verified current state (disabled) -- not changed here; a Session-C-owned
-- posture decision, out of scope for this retroactive capture.

-- ── PART 2: the rollup view ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.census_rollup_by_surface AS
WITH b_rows AS (
  SELECT cw.id, cw.dryrun_disposition, s.surface
  FROM public.census_worklist cw
  CROSS JOIN LATERAL unnest(cw.surface_tags) AS s(surface)
),
b_tally AS (
  SELECT
    surface,
    count(*) AS enumerated_held_sources,
    count(*) FILTER (WHERE dryrun_disposition = 'dedup_hit') AS held,
    count(*) FILTER (WHERE dryrun_disposition = 'would_mint') AS missing_from_held_sources,
    count(*) FILTER (WHERE dryrun_disposition IN ('congruence_reject', 'invariant_reject', 'hold')) AS other_dispositioned_held_sources,
    count(*) FILTER (WHERE dryrun_disposition IS NULL) AS undispositioned_held_sources
  FROM b_rows
  GROUP BY surface
),
c_rows AS (
  SELECT f.id, f.dry_run_disposition, f.pending_dependency, kv.key AS surface
  FROM public.coverage_gap_census_findings f
  CROSS JOIN LATERAL jsonb_each(coalesce(f.four_contract_classification, '{}'::jsonb)) AS kv(key, value)
  WHERE kv.value ->> 'verdict' = 'IN'
),
c_tally AS (
  SELECT
    surface,
    count(*) AS enumerated_world,
    count(*) FILTER (WHERE dry_run_disposition = 'would_mint' AND pending_dependency IS NULL) AS missing_from_world,
    count(*) FILTER (WHERE pending_dependency IS NOT NULL) AS pending_on_session_a,
    count(*) FILTER (WHERE dry_run_disposition IN ('would_decline', 'would_park', 'not_applicable') AND pending_dependency IS NULL) AS declined_or_parked_world
  FROM c_rows
  GROUP BY surface
),
surfaces AS (
  SELECT unnest(ARRAY['regulations', 'operations', 'market_intel', 'research']) AS surface
)
SELECT
  surfaces.surface,
  coalesce(b_tally.enumerated_held_sources, 0) AS enumerated_held_sources,
  coalesce(b_tally.held, 0) AS held,
  coalesce(b_tally.missing_from_held_sources, 0) AS missing_from_held_sources,
  coalesce(b_tally.other_dispositioned_held_sources, 0) AS other_dispositioned_held_sources,
  coalesce(b_tally.undispositioned_held_sources, 0) AS undispositioned_held_sources,
  coalesce(c_tally.enumerated_world, 0) AS enumerated_world,
  coalesce(c_tally.missing_from_world, 0) AS missing_from_world,
  coalesce(c_tally.pending_on_session_a, 0) AS pending_on_session_a,
  coalesce(c_tally.declined_or_parked_world, 0) AS declined_or_parked_world
FROM surfaces
LEFT JOIN b_tally ON b_tally.surface = surfaces.surface
LEFT JOIN c_tally ON c_tally.surface = surfaces.surface
ORDER BY surfaces.surface;

COMMENT ON VIEW public.census_rollup_by_surface IS
  'Per-surface census rollup (Session B, 2026-07-19), the stitch between census_worklist (documents inside already-held sources) and coverage_gap_census_findings (candidate sources not yet held). Never merged by FK, a structural grain mismatch per Session C''s schema-stitch review. held/missing_from_held_sources read from census_worklist; missing_from_world/pending_on_session_a read from coverage_gap_census_findings, pending_on_session_a carried as its own visible count, never folded into missing_from_world. other_dispositioned_held_sources/undispositioned_held_sources/declined_or_parked_world are honest residual buckets, no silent caps. Feeds docs/census/gap-census-2026-07.md, Rollup tallies, Per surface.';

COMMIT;
