-- subject: Migration 350 (lane NO-TYPED-INPUT, 2026-10-03, ADR-043 "No typed input produces a result; no automate-versus-hire framing"). Data migration, not BREAK-RISKY: it deletes the derived_values rows computed by the retired automate_vs_hire propagation method and the derivation_edges rows that feed them; no table, column, policy or function changes. Applied by the coordinator AFTER the NO-TYPED-INPUT PR merges (standing rule 3: data migrations commit with consumer code and run after merge).
-- Migration 350: retire the automate_vs_hire derived values (ADR-043).
--
-- Operator ruling, 2026-10-03, verbatim: "I've changed my mind. I don't want to input any outside data to get
-- results from anything in the system, including automate or hire. Also automate and hire seems very non-PC;
-- it would look terrible to say we're going to automate jobs or people are so cheap that we'll just hire them
-- and not pay them enough. It's a bad idea, and we can state the evidence of what wages and stuff cost, but we
-- don't need to blatantly say automate or hire."
--
-- ORDER OF APPLICATION: applied AFTER the NO-TYPED-INPUT PR merges. Until the merge the old code still
-- registered the automate_vs_hire method and the calculator page; the PR removes the method registration, the
-- seed path, the producer authorship hooks and the page first.
--
-- APPLIED 2026-10-04 (operator-approved, coordinator window; version 20261004115520; read-back: derived_values 22 to 20, derivation_edges 24 to 20, zero automate_vs_hire rows or edges remain).
--
-- WHAT GOES (object names read from migrations 284, 285 and 286):
--   * public.derivation_edges rows whose to_value_id is a public.derived_values row with
--     method_id = 'automate_vs_hire'. to_value_id is a NOT NULL foreign key to derived_values(value_id)
--     (migration 285), so the edges are deleted FIRST.
--   * public.derived_values rows with method_id = 'automate_vs_hire'. A row's supersedes column is a
--     self-reference; both ends are deleted in the same statement, and a foreign key is checked at the end of
--     the statement, so the order inside the statement does not matter.
--
-- WHAT STAYS:
--   * public.propagation_events is an append-only outbox and is history; this migration does not touch it.
--     The outbox trigger (migration 285, propagation_outbox_trg on derived_values) will append one 'delete'
--     event per deleted derived_values row as a side effect of the DELETE; those are ordinary outbox rows.
--   * Every wage and energy evidence row, the carbon_intensity_tkm derived values, the market_series_delta
--     derived values, and every table, column, policy, trigger and function.
--   * No trigger, policy or view is disabled or altered here. If a delete were blocked by one, the statement
--     would fail and the transaction roll back; nothing is worked around.
--
-- The self-check below aborts the transaction if any automate_vs_hire derived_values row, or any edge into
-- a missing value, remains, or if an unrelated method's derived_values rows were touched (their count is read
-- before the deletes and compared after).

BEGIN;

DO $$
DECLARE
  n_other_before bigint;
BEGIN
  SELECT count(*) INTO n_other_before FROM public.derived_values WHERE method_id <> 'automate_vs_hire';
  PERFORM set_config('mig350.n_other_before', n_other_before::text, true);
END $$;

DELETE FROM public.derivation_edges
WHERE to_value_id IN (SELECT value_id FROM public.derived_values WHERE method_id = 'automate_vs_hire');

DELETE FROM public.derived_values WHERE method_id = 'automate_vs_hire';

DO $$
DECLARE
  n_left bigint;
  n_edges_left bigint;
  n_other_before bigint := current_setting('mig350.n_other_before')::bigint;
  n_other_after bigint;
  n_estimates bigint;
BEGIN
  SELECT count(*) INTO n_left FROM public.derived_values WHERE method_id = 'automate_vs_hire';
  IF n_left <> 0 THEN
    RAISE EXCEPTION 'ABORT: % derived_values row(s) with method_id automate_vs_hire remain', n_left;
  END IF;

  SELECT count(*) INTO n_edges_left
  FROM public.derivation_edges e
  WHERE NOT EXISTS (SELECT 1 FROM public.derived_values v WHERE v.value_id = e.to_value_id);
  IF n_edges_left <> 0 THEN
    RAISE EXCEPTION 'ABORT: % derivation_edges row(s) point at a derived_values row that no longer exists', n_edges_left;
  END IF;

  SELECT count(*) INTO n_other_after FROM public.derived_values WHERE method_id <> 'automate_vs_hire';
  IF n_other_after <> n_other_before THEN
    RAISE EXCEPTION 'ABORT: derived_values rows of other methods changed (% before, % after)', n_other_before, n_other_after;
  END IF;

  SELECT count(*) INTO n_estimates FROM public.estimated_values WHERE model_id = 'automate_vs_hire';
  RAISE NOTICE 'migration 350 OK: no automate_vs_hire derived_values rows or edges remain; % other-method derived_values rows untouched; % estimated_values row(s) with model_id automate_vs_hire (not touched by this migration)', n_other_after, n_estimates;
END $$;

COMMIT;
