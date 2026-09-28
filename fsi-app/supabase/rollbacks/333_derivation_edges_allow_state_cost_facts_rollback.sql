-- Rollback for migration 333, derivation_edges_from_table_allowed widen. Restores migration 285's
-- original 6-value CHECK, dropping 'state_cost_facts' from the allowlist.
--
-- SAFETY: this reversal is only safe while zero live derivation_edges rows carry
-- from_table = 'state_cost_facts' (dropping the value from the allowlist while a live row references it
-- would leave the CHECK violated the moment the ADD CONSTRAINT below re-validates the existing table
-- data, i.e. this statement would fail loudly, never silently corrupt data). The RAISE guard below makes
-- that failure explicit and named rather than a bare Postgres constraint-violation message.

BEGIN;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.derivation_edges WHERE from_table = 'state_cost_facts';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'rollback 333 refused: % live derivation_edges row(s) reference from_table = ''state_cost_facts''; delete or re-home them before reverting the allowlist.', v_count;
  END IF;
END $$;

ALTER TABLE public.derivation_edges DROP CONSTRAINT IF EXISTS derivation_edges_from_table_allowed;
ALTER TABLE public.derivation_edges ADD CONSTRAINT derivation_edges_from_table_allowed CHECK (
  from_table IN ('emission_factors', 'market_series', 'regional_data_facts', 'derived_values',
                 'statutory_computations', 'estimated_values')
);

COMMIT;
