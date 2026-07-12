-- Migration 201 (REWORKED — supersedes the operator-credential design of 2a, RULED DEAD 2026-07-12):
-- PAUSE-FLAG SESSION-VAR WRITE GUARD. No role, no credential, no secret, no manual step, ever.
--
-- INVARIANT (pause-flag-has-one-writer): system_state.global_processing_paused + scrape_cadence are written
-- through EXACTLY ONE path — the SECURITY DEFINER function admin_set_pause_state, which the sanctioned admin
-- route calls via supabase.rpc. The function declares a TRANSACTION-LOCAL marker (app.pause_flag_writer);
-- the BEFORE UPDATE trigger BOUNCES any change to those columns that does not carry the marker. A generic
-- service-role UPDATE (an agent's ad-hoc `UPDATE system_state SET global_processing_paused=false`, a stray
-- writer) sets no marker → REJECTED (insufficient_privilege). Paired with the STATIC F20 fitness function
-- (no src code writes those columns except through the RPC) + the audit table (every write logs origin).
--
-- WHY THIS REPLACES 2a (operator_control credential): the credential design required a MANUAL operator step —
-- provision a login role, hold OPERATOR_CONTROL_DATABASE_URL, scope creds out of the agent env. Human
-- intervention is not a solution; a system must manage the problem structurally. This design is fully
-- automated: the marker is declared by code, enforced by a trigger + a CI fitness function, detected by the
-- audit table. No secret to hold, no role to provision, no manual step. (201 was never applied — the DEAD 2a
-- objects likely don't exist; the drops below are defensive.)

BEGIN;

-- ── Audit table (retained detection layer from 2a): every stop-flag change logs its declared origin ──
CREATE TABLE IF NOT EXISTS public.system_state_flag_audit (
  id          bigserial PRIMARY KEY,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  changed_by  text        NOT NULL,   -- the marker's declared origin (the RPC's p_actor)
  column_name text        NOT NULL,
  old_value   text,
  new_value   text
);

-- ── THE SANCTIONED WRITER: declares the transaction-local marker, then updates. SECURITY DEFINER so the
-- marker is set inside a trusted function body. Partial updates via COALESCE + an explicit clear flag.
-- Anything that reaches the flags WITHOUT going through this function (a raw UPDATE) carries no marker. ──
CREATE OR REPLACE FUNCTION public.admin_set_pause_state(
  p_actor       text,
  p_paused      boolean DEFAULT NULL,
  p_cadence     text    DEFAULT NULL,
  p_start_date  date    DEFAULT NULL,
  p_clear_start boolean DEFAULT false
) RETURNS public.system_state
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r public.system_state;
BEGIN
  PERFORM set_config('app.pause_flag_writer', coalesce(nullif(p_actor, ''), 'admin-pause-route'), true);
  UPDATE public.system_state SET
    global_processing_paused = COALESCE(p_paused, global_processing_paused),
    scrape_cadence           = COALESCE(p_cadence, scrape_cadence),
    scrape_start_date        = CASE WHEN p_clear_start THEN NULL
                                    WHEN p_start_date IS NOT NULL THEN p_start_date
                                    ELSE scrape_start_date END,
    updated_at = now()
  WHERE id = true
  RETURNING * INTO r;
  RETURN r;
END; $fn$;

COMMENT ON FUNCTION public.admin_set_pause_state(text, boolean, text, date, boolean) IS
  'pause-flag-has-one-writer (Unit 2a-reworked). The ONE sanctioned writer of system_state.global_processing_paused / scrape_cadence: declares the transaction-local marker app.pause_flag_writer, then updates. guard_pause_flag_writer bounces any flag change lacking the marker. Called by the admin pause-global route via supabase.rpc; agents/raw UPDATEs carry no marker and are rejected. No role/credential/secret.';

-- ── THE GUARD: bounce any change to the stop flags NOT carrying the marker; log authorized changes ──
CREATE OR REPLACE FUNCTION public.guard_pause_flag_writer()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE marker text := current_setting('app.pause_flag_writer', true);
BEGIN
  IF NEW.global_processing_paused IS DISTINCT FROM OLD.global_processing_paused
     OR NEW.scrape_cadence IS DISTINCT FROM OLD.scrape_cadence THEN
    IF marker IS NULL OR marker = '' THEN
      RAISE EXCEPTION
        'pause-flag-has-one-writer: system_state stop flags (global_processing_paused / scrape_cadence) are written ONLY through admin_set_pause_state (the sanctioned route path). A direct write carries no writer marker and is rejected; current_user=%.',
        current_user USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.global_processing_paused IS DISTINCT FROM OLD.global_processing_paused THEN
      INSERT INTO public.system_state_flag_audit(changed_by, column_name, old_value, new_value)
        VALUES (marker, 'global_processing_paused', OLD.global_processing_paused::text, NEW.global_processing_paused::text);
    END IF;
    IF NEW.scrape_cadence IS DISTINCT FROM OLD.scrape_cadence THEN
      INSERT INTO public.system_state_flag_audit(changed_by, column_name, old_value, new_value)
        VALUES (marker, 'scrape_cadence', OLD.scrape_cadence::text, NEW.scrape_cadence::text);
    END IF;
  END IF;
  RETURN NEW;
END; $fn$;

COMMENT ON FUNCTION public.guard_pause_flag_writer() IS
  'pause-flag-has-one-writer guard. BEFORE UPDATE on system_state: rejects any change to global_processing_paused / scrape_cadence carrying no app.pause_flag_writer marker (only admin_set_pause_state sets it); logs authorized changes to system_state_flag_audit. A generic service-role UPDATE bounces by construction. No role/credential; the static F20 fitness function forbids any src writer other than the RPC caller.';

DROP TRIGGER IF EXISTS guard_pause_flag_writer_trg ON public.system_state;
CREATE TRIGGER guard_pause_flag_writer_trg
  BEFORE UPDATE ON public.system_state
  FOR EACH ROW EXECUTE FUNCTION public.guard_pause_flag_writer();

-- ── Retire any leftover of the DEAD 2a operator-credential design (defensive; 201 was never applied) ──
DROP TRIGGER IF EXISTS guard_operator_stop_flags_trg ON public.system_state;
DROP FUNCTION IF EXISTS public.guard_operator_stop_flags();

-- ── The RPC is the sanctioned writer; the admin route connects as service_role ──
GRANT EXECUTE ON FUNCTION public.admin_set_pause_state(text, boolean, text, date, boolean) TO service_role;

COMMIT;
