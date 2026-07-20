-- 245_census_findings_recovery_sweep_schema.sql
-- Session C (discovery lane), 2026-07-19. FOUND-THEN-LOST SOURCE RECOVERY AUDIT (operator mandate,
-- repo-archaeology form). Extends coverage_gap_census_findings to hold a fourth sweep: providers that
-- the repo's own history shows were found, evaluated, mapped, or ruled on in past source sweeps
-- (including the Gemini-era source research) but are invisible to EVERY table in today's system
-- (sources, provisional_sources, canonical_source_candidates, portal_link_candidates, census_worklist,
-- coverage_gap_candidates, coverage_gap_census_findings, disposition_ledger). "Evaluated then lost,
-- never captured as data" is the class this sweep closes.
--
-- Adds:
--   sweep value 'sweep4_found_then_lost_recovery'
--   subject_type value 'lost_historical_provider'
--   dry_run_disposition value 'operator_confirm' (auth-gated or signup-likely rows only the operator
--     can resolve, e.g. IEA's new login-gated platform + the statsnews@iea.org newsletter the operator
--     receives -- a signup exists, only the operator can confirm it)
--   columns: historical_evidence (the trail: where mentioned, when, what was said/ruled),
--     historical_intent (what the record shows was intended: acquire/monitor/sign-up/revisit),
--     auth_gate (explicit gate note where the provider is login/paywall gated),
--     operator_confirm_question (the one-line question, batched into the report; NULL otherwise).

ALTER TABLE public.coverage_gap_census_findings
  DROP CONSTRAINT coverage_gap_census_findings_sweep_check;
ALTER TABLE public.coverage_gap_census_findings
  ADD CONSTRAINT coverage_gap_census_findings_sweep_check
    CHECK (sweep IN ('sweep1_existing_feed_audit','sweep2_adjacent_universes','sweep3_research_feedstock','sweep4_found_then_lost_recovery'));

ALTER TABLE public.coverage_gap_census_findings
  DROP CONSTRAINT coverage_gap_census_findings_subject_type_check;
ALTER TABLE public.coverage_gap_census_findings
  ADD CONSTRAINT coverage_gap_census_findings_subject_type_check
    CHECK (subject_type IN ('existing_feed','candidate_source','candidate_catalog','lost_historical_provider'));

ALTER TABLE public.coverage_gap_census_findings
  DROP CONSTRAINT coverage_gap_census_findings_dry_run_disposition_check;
ALTER TABLE public.coverage_gap_census_findings
  ADD CONSTRAINT coverage_gap_census_findings_dry_run_disposition_check
    CHECK (dry_run_disposition IN ('would_mint','would_decline','would_park','browser_required_undetermined','not_applicable','operator_confirm'));

ALTER TABLE public.coverage_gap_census_findings
  ADD COLUMN IF NOT EXISTS historical_evidence text,
  ADD COLUMN IF NOT EXISTS historical_intent text,
  ADD COLUMN IF NOT EXISTS auth_gate text,
  ADD COLUMN IF NOT EXISTS operator_confirm_question text,
  ADD COLUMN IF NOT EXISTS lens text;

-- lens (operator ruling 2026-07-19): weights the population decision. freight_native = the
-- maritime/energy/operations-emissions cluster (per the operator's explicit list plus source-nature
-- parallel); esg_finance = the finance-supervisory + ESG-reporting inheritance. Tag, not re-scope:
-- every row lands regardless. NULL on sweep 1-3 rows (which predate the lens).
ALTER TABLE public.coverage_gap_census_findings
  ADD CONSTRAINT coverage_gap_census_findings_lens_check
    CHECK (lens IS NULL OR lens IN ('freight_native', 'esg_finance'));

COMMENT ON COLUMN public.coverage_gap_census_findings.historical_evidence IS
  'Sweep 4 only: the archaeology trail for a lost_historical_provider row -- which repo artifact named it, when, and what was said/ruled (source-map, existence-check, session log, seed file, disposition_ledger).';
COMMENT ON COLUMN public.coverage_gap_census_findings.operator_confirm_question IS
  'Sweep 4 only: the one-line question for a dry_run_disposition=operator_confirm row (a signup likely exists but only the operator can confirm). Batched into the audit report, never asked piecemeal.';
