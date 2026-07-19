-- 239_coverage_gap_census_findings.sql
-- Session C (discovery lane), 2026-07-19. NEW MANDATE: measure what the four customer surfaces
-- (Regulations, Operations, Market Intel, Research) need that NO held source's full universe
-- contains -- the missing-from-the-world half of the gap census, distinct from
-- coverage_gap_candidates (which prices NEW instrument acquisition candidates). This table holds
-- per-sweep census findings: what an already-held free feed carries now, what an adjacent
-- enumerable universe offers, what a Research feedstock catalog indexes -- classified against the
-- four surface contracts, with a dryRun-disposition (a predictive judgment, NEVER a real operator
-- ruling; the disposition/surface_test vocabulary on coverage_gap_candidates stays reserved for
-- genuine operator-approved outcomes).
--
-- Discovery-not-intake: this table stages NO staged_updates rows, mints NO intelligence_items,
-- registers NO sources. It is a read-only-to-the-corpus investigation artifact, same category as
-- coverage_gap_candidates itself. Fetch-light only (API/feed/plain-HTTP); anything requiring
-- browser rendering is logged here with fetch_method='browser_required' and NOT fetched, routing to
-- Session A's Chrome-enumeration queue per the operator's explicit instruction.

CREATE TABLE public.coverage_gap_census_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lane text NOT NULL DEFAULT 'C',
  sweep text NOT NULL CHECK (sweep IN (
    'sweep1_existing_feed_audit',
    'sweep2_adjacent_universes',
    'sweep3_research_feedstock'
  )),
  subject_type text NOT NULL CHECK (subject_type IN (
    'existing_feed',      -- sweep 1: one of the 62 already-dispositioned free feeds
    'candidate_source',   -- sweep 2: an adjacent enumerable universe not among held sources
    'candidate_catalog'   -- sweep 3: a Research feedstock catalog/index
  )),
  subject_ref text NOT NULL,            -- coverage_gap_candidates.rank for sweep1; a name for sweep2/3
  instrument text NOT NULL,
  jurisdiction text,
  url text,
  fetch_method text NOT NULL CHECK (fetch_method IN (
    'plain_http', 'api', 'feed_xml', 'browser_required', 'not_applicable'
  )),
  fetch_result text,                    -- what was actually found; NULL when browser_required
  four_contract_classification jsonb,   -- {regulations,operations,market_intel,research}: {verdict,reason}
  dry_run_disposition text NOT NULL CHECK (dry_run_disposition IN (
    'would_mint', 'would_decline', 'would_park', 'browser_required_undetermined', 'not_applicable'
  )),
  dry_run_reason text,
  entity_confirmed boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.coverage_gap_census_findings IS
  'Session C discovery-lane census artifact (2026-07-19 mandate). NOT the corpus: zero staged_updates rows, zero intelligence_items, zero source registrations. Records what already-held free feeds, adjacent enumerable universes, and Research feedstock catalogs actually carry, classified against the four surface contracts, with a dryRun (predictive, non-binding) disposition. Distinct from coverage_gap_candidates (new-instrument acquisition pricing) and from disposition/surface_test there (real operator-ruled outcomes).';
