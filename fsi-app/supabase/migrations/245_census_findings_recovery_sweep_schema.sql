-- subject: Recovered 2026-10-07 from supabase_migrations.schema_migrations (ledger version 20260720150850, name census_findings_recovery_sweep_schema): the Session C schema change to coverage_gap_census_findings (replaced CHECK constraints, historical_evidence and operator_confirm_question columns, lens check, two column comments). APPLIED.
-- recovered: 2026-10-07 from supabase_migrations.schema_migrations (lane MIG-HIST-1)
-- ledger version: 20260720150850
-- ledger name: census_findings_recovery_sweep_schema
-- applied status: APPLIED (a ledger row exists; applied 2026-07-20 per the version timestamp)
-- file number: 245 (assigned by lane MIG-HIST-1: the ledger version carries no file number; the nearest free gap number on master)
-- scope: FULL (every stored statement of the ledger row)
-- coverage: No master migration holds any of these statements. The table itself is created by 222_census_rollup_stitch.sql.
-- removal: file 245_census_findings_recovery_sweep_schema.sql, added in commit e99a699 (2026-07-20) on branch origin/corpus-integrity/cc-grounding-executor-c (no PR, never merged, branch tip dc8d119c); no removal commit exists because the file never reached master. Applied live 2026-07-20
-- body-sha256: b81c9c4cfadeeb6aa570affd699d125a19830db64d89b3d2c35eb4e023307606
-- DO NOT APPLY: production already holds this change under the ledger row above. This file exists so the repo describes the database.
-- ---- recovered statements below, verbatim from schema_migrations.statements ----
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

ALTER TABLE public.coverage_gap_census_findings
  ADD CONSTRAINT coverage_gap_census_findings_lens_check
    CHECK (lens IS NULL OR lens IN ('freight_native', 'esg_finance'));

COMMENT ON COLUMN public.coverage_gap_census_findings.historical_evidence IS
  'Sweep 4 only: the archaeology trail for a lost_historical_provider row -- which repo artifact named it, when, and what was said/ruled (source-map, existence-check, session log, seed file, disposition_ledger).';
COMMENT ON COLUMN public.coverage_gap_census_findings.operator_confirm_question IS
  'Sweep 4 only: the one-line question for a dry_run_disposition=operator_confirm row (a signup likely exists but only the operator can confirm). Batched into the audit report, never asked piecemeal.';
