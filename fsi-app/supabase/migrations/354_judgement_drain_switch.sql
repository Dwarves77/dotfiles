-- subject: Migration 354 (lane G6-DRAIN, 2026-10-06, plan Stage 6): `system_state` gains `judgement_drain` ('off'|'on', default 'off'), the kill switch of the scheduled judgement drain session; the ONE writer is the SECURITY DEFINER RPC `admin_set_judgement_drain`, which declares its own transaction-local marker `app.judgement_drain_writer`, and the BEFORE UPDATE guard `guard_judgement_drain_writer` bounces any change to the column that lacks the marker and audits every authorized change in `system_state_flag_audit` (migration 201); APPLIED (production ledger version 20261006061049, as of 2026-10-07). The self-check attacks the guard (an unmarked UPDATE must be refused, a marked one must pass) on a temp table in a block that always rolls back.
-- 354 -- the judgement drain kill switch (lane G6-DRAIN, 2026-10-06).
--
-- APPLIED (production ledger version 20261006061049, as of 2026-10-07). Authored by lane G6-DRAIN; the coordinator applied it (two-track policy, CLAUDE.md standing
-- rule 3: schema DDL applies before the dependent code merges). Until it is applied every reader fails
-- CLOSED to 'off' (src/lib/api/pause.ts getJudgementDrain, scripts/drain/switch.mjs readJudgementDrain), so
-- the drain stays off whether or not the column exists. The switch STAYS 'off' after apply: turning it on is
-- a build-complete act (the judgement-drain step under docs/runbooks/maintenance.d/), never part of this
-- migration.
--
-- Why a SIBLING writer and guard instead of widening migration 201's: guard_pause_flag_writer evaluates
-- NEW.global_processing_paused and NEW.scrape_cadence, and the migration-201 proof script attaches that
-- function to a synthetic two-column temp table. Widening it to read NEW.judgement_drain would break that
-- proof (a record with no such field). A second guard on its own marker keeps the pause proof valid AND means
-- the pause RPC cannot flip the drain and the drain RPC cannot flip a pause flag: one writer per flag.
--
-- (a) the column: judgement_drain text NOT NULL DEFAULT 'off' CHECK in ('off','on'). The singleton row (016)
--     picks up the default, so an existing system reads 'off' the moment the column exists.
-- (b) the guard: BEFORE UPDATE on system_state. A change to judgement_drain with no marker raises
--     insufficient_privilege; a marked change is logged to system_state_flag_audit (changed_by = the marker).
-- (c) the writer: admin_set_judgement_drain(p_actor, p_state) validates the state, declares the marker,
--     updates, returns the row. Granted to service_role only (the admin pause route calls it via
--     supabase.rpc).
-- Requires migrations 016 (system_state) and 201 (system_state_flag_audit).

BEGIN;

ALTER TABLE public.system_state ADD COLUMN IF NOT EXISTS judgement_drain text NOT NULL DEFAULT 'off';

ALTER TABLE public.system_state DROP CONSTRAINT IF EXISTS system_state_judgement_drain_chk;
ALTER TABLE public.system_state ADD CONSTRAINT system_state_judgement_drain_chk
  CHECK (judgement_drain IN ('off', 'on'));

COMMENT ON COLUMN public.system_state.judgement_drain IS
  'Kill switch of the scheduled judgement drain session (off|on, default off). Written ONLY through admin_set_judgement_drain (marker app.judgement_drain_writer); guard_judgement_drain_writer bounces any other change and logs authorized ones to system_state_flag_audit. The drain also halts on an open fleet-budget-halt row and on global_processing_paused.';

-- ── THE GUARD ──
CREATE OR REPLACE FUNCTION public.guard_judgement_drain_writer()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE marker text := current_setting('app.judgement_drain_writer', true);
BEGIN
  IF NEW.judgement_drain IS DISTINCT FROM OLD.judgement_drain THEN
    IF marker IS NULL OR marker = '' THEN
      RAISE EXCEPTION
        'judgement-drain-has-one-writer: system_state.judgement_drain is written ONLY through admin_set_judgement_drain. A direct write carries no writer marker and is rejected; current_user=%.',
        current_user USING ERRCODE = 'insufficient_privilege';
    END IF;
    INSERT INTO public.system_state_flag_audit(changed_by, column_name, old_value, new_value)
      VALUES (marker, 'judgement_drain', OLD.judgement_drain::text, NEW.judgement_drain::text);
  END IF;
  RETURN NEW;
END; $fn$;

COMMENT ON FUNCTION public.guard_judgement_drain_writer() IS
  'judgement-drain-has-one-writer guard (lane G6-DRAIN, migration 354). BEFORE UPDATE on system_state: rejects a change to judgement_drain that carries no app.judgement_drain_writer marker (only admin_set_judgement_drain sets it) and logs authorized changes to system_state_flag_audit.';

DROP TRIGGER IF EXISTS guard_judgement_drain_writer_trg ON public.system_state;
CREATE TRIGGER guard_judgement_drain_writer_trg
  BEFORE UPDATE ON public.system_state
  FOR EACH ROW EXECUTE FUNCTION public.guard_judgement_drain_writer();

-- ── THE SANCTIONED WRITER ──
CREATE OR REPLACE FUNCTION public.admin_set_judgement_drain(
  p_actor text,
  p_state text
) RETURNS public.system_state
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r public.system_state;
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('off', 'on') THEN
    RAISE EXCEPTION 'admin_set_judgement_drain: p_state must be off or on, got %', coalesce(p_state, 'NULL');
  END IF;
  PERFORM set_config('app.judgement_drain_writer', coalesce(nullif(p_actor, ''), 'admin-pause-route'), true);
  UPDATE public.system_state SET judgement_drain = p_state, updated_at = now()
   WHERE id = true
   RETURNING * INTO r;
  RETURN r;
END; $fn$;

COMMENT ON FUNCTION public.admin_set_judgement_drain(text, text) IS
  'The ONE sanctioned writer of system_state.judgement_drain (lane G6-DRAIN, migration 354): validates off|on, declares the transaction-local marker app.judgement_drain_writer, updates, returns the row. Called by the admin pause-global route via supabase.rpc.';

GRANT EXECUTE ON FUNCTION public.admin_set_judgement_drain(text, text) TO service_role;

-- ── SELF-CHECK: the guard is attacked, not asserted present (CLAUDE.md rule 15) ──
DO $$
DECLARE
  v_default text;
  v_check_refused boolean := false;
  v_unmarked_refused boolean := false;
  v_wrong_marker_refused boolean := false;
  v_marked_ok boolean := false;
BEGIN
  SELECT judgement_drain INTO v_default FROM public.system_state WHERE id = true;
  IF v_default IS DISTINCT FROM 'off' THEN
    RAISE EXCEPTION 'ABORT: system_state.judgement_drain is not off after the migration (got %)', coalesce(v_default, 'NULL');
  END IF;

  BEGIN
    CREATE TEMP TABLE g6_354_fixture (
      id boolean PRIMARY KEY DEFAULT true,
      judgement_drain text NOT NULL DEFAULT 'off' CONSTRAINT g6_354_chk CHECK (judgement_drain IN ('off', 'on'))
    ) ON COMMIT DROP;
    INSERT INTO g6_354_fixture (id) VALUES (true);
    CREATE TRIGGER g6_354_selfcheck_trg BEFORE UPDATE ON g6_354_fixture
      FOR EACH ROW EXECUTE FUNCTION public.guard_judgement_drain_writer();

    -- Attack 1: a direct UPDATE with no marker must be refused.
    BEGIN
      UPDATE g6_354_fixture SET judgement_drain = 'on';
    EXCEPTION WHEN insufficient_privilege THEN v_unmarked_refused := true;
    END;
    -- Attack 2: the OTHER writer's marker (the pause RPC's) must not open this guard.
    BEGIN
      PERFORM set_config('app.pause_flag_writer', 'selfcheck', true);
      UPDATE g6_354_fixture SET judgement_drain = 'on';
    EXCEPTION WHEN insufficient_privilege THEN v_wrong_marker_refused := true;
    END;
    -- Attack 3: a value outside the CHECK must be refused even with the right marker.
    BEGIN
      PERFORM set_config('app.judgement_drain_writer', 'selfcheck', true);
      UPDATE g6_354_fixture SET judgement_drain = 'maybe';
    EXCEPTION WHEN check_violation THEN v_check_refused := true;
    END;
    -- Green: a marked, in-range change passes. The marker is set HERE, after the last exception sub-block and
    -- immediately before the write: set_config(..., true) is transaction-local, and a sub-block whose handler
    -- fires rolls its own set_config back, so a marker set inside Attack 3 would not survive to this UPDATE.
    PERFORM set_config('app.judgement_drain_writer', 'selfcheck', true);
    UPDATE g6_354_fixture SET judgement_drain = 'on';
    v_marked_ok := (SELECT judgement_drain FROM g6_354_fixture WHERE id = true) = 'on';

    IF NOT v_unmarked_refused THEN RAISE EXCEPTION 'ABORT: the judgement drain guard let an unmarked UPDATE through'; END IF;
    IF NOT v_wrong_marker_refused THEN RAISE EXCEPTION 'ABORT: the pause-flag marker opened the judgement drain guard'; END IF;
    IF NOT v_check_refused THEN RAISE EXCEPTION 'ABORT: the judgement_drain CHECK let an out-of-range value through'; END IF;
    IF NOT v_marked_ok THEN RAISE EXCEPTION 'ABORT: the judgement drain guard refused a marked, in-range UPDATE'; END IF;
    RAISE EXCEPTION 'g6_354_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'g6_354_selfcheck_rollback' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'migration 354 OK: system_state.judgement_drain = off, guard attacked (unmarked refused, wrong marker refused, out-of-range refused, marked passes), 0 live rows written';
END $$;

COMMIT;
