-- subject: Migration 349 (lane EXTERNAL-ONLY, 2026-10-03, ADR-042 "External data only: the system takes no customer data and runs no Community benchmark"). BREAK-RISKY class (drops) under ADR-011, applied only in the operator's window AFTER the EXTERNAL-ONLY PR merges. Drops the seven tables whose only purpose was customer-entered data or the Community benchmark: surcharge_audits, tce_data_quality, eudr_plot_claims, custody_chains (migrations 296 to 298, org-scoped by 311), planning_assumption_register (345), community_benchmark_responses and community_benchmark_instruments (294), and deletes the one sensitive_field_policy row that registered community_benchmark_responses. Keeps sensitive_field_policy, aggregate_query_log, publish_aggregate, community_contributions, auxiliary_energy_profiles and indexation_clauses.
-- Migration 349: external data only (ADR-042).
--
-- Operator rulings, 2026-10-03, verbatim: "The customer is not uploading anything to the system. That's
-- not what the system is for. We're not updating data inside of this with our own information. We are
-- taking external data and advising what that means for the people without analyzing their specific data
-- that they input." And: "There are plenty of existing sustainability software tools that do all of that;
-- we are not trying to be what somebody else is." And: "I would also remove the community benchmarks."
--
-- ORDER OF APPLICATION: this migration is applied AFTER the EXTERNAL-ONLY PR merges. The OLD code read and
-- wrote these tables (the workspace CSV upload route, the surcharge-audit, DQI and EUDR/custody panels, the
-- planning-assumption routes, the Community benchmark routes), so applying it before the merge would break
-- the old code's reads and writes. The PR removes every reader and writer first (data migrations commit
-- with consumer code and run after merge, standing rule 3).
--
-- APPLIED 2026-10-03 (operator window, ADR-011; read-back: seven tables absent, kept tables present).
--
-- Live state verified 2026-10-03 (read-only SELECT, by the coordinator): six of the seven tables held 0 rows;
-- community_benchmark_instruments held 3 house-seeded definitions (created_by 'house', no member-entered
-- content; community_benchmark_responses was 0), recorded verbatim in docs/ops/session-log.d/2026-10-03-adr042-landing.md.
-- No member data is lost by the drops.
--
-- WHAT GOES (real object names read from migrations 294, 296, 297, 298, 311, 345 and 287):
--   * public.community_benchmark_responses (294), dropped BEFORE its parent because it carries a
--     foreign key to community_benchmark_instruments; its RLS policy
--     community_benchmark_responses_service_role and its index drop with the table.
--   * public.community_benchmark_instruments (294): its policies
--     community_benchmark_instruments_select_authenticated and community_benchmark_instruments_service_role,
--     and its two indexes, drop with the table.
--   * public.surcharge_audits (296), public.tce_data_quality (297), public.eudr_plot_claims and
--     public.custody_chains (298): each table's policy (<table>_org_read, 311), index and constraints drop
--     with the table. No other table has a foreign key to them (checked by grep over every migration).
--   * public.planning_assumption_register (345): its four RLS policies and its index drop with the table.
--   * the single public.sensitive_field_policy row with table_name = 'community_benchmark_responses'
--     (column_name value_numeric, seeded by 294, k_min raised to 10 by 347).
--
-- WHAT STAYS: sensitive_field_policy (the table), aggregate_query_log, publish_aggregate() and its helpers
-- (the ADR-035 floor stays for any future aggregate), community_contributions, auxiliary_energy_profiles and
-- indexation_clauses (kept domains, their producers and panels stay; public-source intake for them is owed,
-- coordinator design), assumption_register (migration 271, product modelling constants, not customer data).
-- Rows already logged in aggregate_query_log for the dropped benchmark table are audit history and are not
-- deleted here.

BEGIN;

-- Children before parents. Plain DROP (RESTRICT) on purpose: if an unexpected dependent object exists the
-- statement fails loudly and the transaction rolls back, instead of CASCADE silently removing it.
DROP TABLE IF EXISTS public.community_benchmark_responses;
DROP TABLE IF EXISTS public.community_benchmark_instruments;

DROP TABLE IF EXISTS public.surcharge_audits;
DROP TABLE IF EXISTS public.tce_data_quality;
DROP TABLE IF EXISTS public.eudr_plot_claims;
DROP TABLE IF EXISTS public.custody_chains;

DROP TABLE IF EXISTS public.planning_assumption_register;

DELETE FROM public.sensitive_field_policy WHERE table_name IN ('community_benchmark_responses');

DO $$
DECLARE
  t text;
  n_policy integer;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'surcharge_audits', 'tce_data_quality', 'eudr_plot_claims', 'custody_chains',
    'planning_assumption_register', 'community_benchmark_responses', 'community_benchmark_instruments'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      RAISE EXCEPTION 'ABORT: public.% still exists after DROP TABLE', t;
    END IF;
  END LOOP;

  SELECT count(*) INTO n_policy FROM public.sensitive_field_policy WHERE table_name = 'community_benchmark_responses';
  IF n_policy <> 0 THEN
    RAISE EXCEPTION 'ABORT: % sensitive_field_policy row(s) for community_benchmark_responses remain', n_policy;
  END IF;

  -- The objects that must survive.
  FOREACH t IN ARRAY ARRAY['sensitive_field_policy', 'aggregate_query_log', 'auxiliary_energy_profiles', 'indexation_clauses'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'ABORT: public.% is gone, but migration 349 must keep it', t;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'publish_aggregate') THEN
    RAISE EXCEPTION 'ABORT: public.publish_aggregate() is gone, but migration 349 must keep it';
  END IF;

  RAISE NOTICE 'migration 349 OK: surcharge_audits, tce_data_quality, eudr_plot_claims, custody_chains, planning_assumption_register, community_benchmark_responses, community_benchmark_instruments dropped; benchmark sensitive_field_policy row deleted (ADR-042)';
END $$;

COMMIT;
