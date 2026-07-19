-- 242_coverage_gap_census_pending_a_marker.sql
-- Session C (discovery lane), 2026-07-19. Operator ruling: the browser_required rows (and the
-- one-hop-deeper landing-page rows) must carry a VISIBLE pending-A marker in the census document so
-- per-surface gap tallies read as provisional until Session A's Chrome pass clears them -- a third
-- of sweep 1 deferred is a dependency, not a footnote. Adds `pending_dependency` distinguishing two
-- sub-kinds: 'session_a_chrome_render' (genuine fetch-light block: 403/404/timeout/cert/empty-SPA)
-- and 'session_a_register_walk' (page reachable, but the real content sits one hop deeper behind a
-- register/portal index -- B2's register-walk tooling, not raw Chrome rendering, is what actually
-- resolves these). Backfills sweep 1's 21 browser_required_undetermined rows plus the 4 one-hop
-- landing-page rows (30, 31, 94, 95) that were correctly logged as would_mint/would_park in
-- migration 240 but still need the same pending-A visibility per the operator's ruling.

ALTER TABLE public.coverage_gap_census_findings
  ADD COLUMN IF NOT EXISTS pending_dependency text
    CHECK (pending_dependency IN ('session_a_chrome_render', 'session_a_register_walk'));

COMMENT ON COLUMN public.coverage_gap_census_findings.pending_dependency IS
  'Operator-ruled visibility marker (2026-07-19): non-NULL means this row''s finding is provisional pending Session A''s queue. session_a_chrome_render = genuine fetch-light block (403/404/timeout/cert/SPA-shell). session_a_register_walk = page reachable but real content is one hop deeper behind a register/portal index (B2 register-walk territory, not raw rendering). NULL = resolved this pass, no A-dependency.';

UPDATE public.coverage_gap_census_findings
SET pending_dependency = 'session_a_chrome_render'
WHERE sweep = 'sweep1_existing_feed_audit'
  AND dry_run_disposition = 'browser_required_undetermined';

UPDATE public.coverage_gap_census_findings
SET pending_dependency = 'session_a_register_walk'
WHERE sweep = 'sweep1_existing_feed_audit'
  AND subject_ref IN ('30', '31', '94', '95');
