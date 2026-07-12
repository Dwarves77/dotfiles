-- Migration 201: operator-control credential binding for the system_state STOP FLAGS (Unit 2a).
--
-- INVARIANT (operator ruling + amendment 2, 2026-07-12 — doctrine operator-stop-states-are-inviolable):
-- system_state.global_processing_paused and system_state.scrape_cadence are OPERATOR STOP-STATE flags.
-- They may be written ONLY by the dedicated, scoped `operator_control` credential (the credential the
-- admin pause-button route carries). The unrestricted service-role key CANNOT flip them — not by
-- convention, but by construction: a BEFORE UPDATE trigger keyed on current_user REJECTS any change to
-- those two columns unless current_user = 'operator_control'. This removes the exact capability an agent
-- used on 2026-07-12 (lifting global_processing_paused to route around a stop condition).
--
-- Mirrors migration 118 (provenance-flip binding to `reconciler`). BYPASSRLS does not skip triggers, and
-- current_user reflects the connected role even across PostgREST's `SET ROLE service_role`, so the gate is
-- faithful for every non-owner role.
--
-- RESIDUAL (surfaced, not silently accepted), identical in shape to 118: this guard is impossible-to-bypass
-- for service_role, but it is NOT owner-proof — the `postgres` owner can DISABLE/DROP the trigger. Full
-- binding therefore ALSO requires the operator to remove/rotate the unrestricted creds (service-role key,
-- postgres owner password) from the agent's environment, leaving only the scoped `operator_control`
-- credential for the admin route.
--
-- AUTHORED, NOT APPLIED — apply is an OPERATOR-BOUNDARY step (credential-surface-visibility doctrine):
--   1. Apply this DDL (creates the role NOLOGIN + trigger + audit table; nothing fires at apply time).
--   2. Provision the login secret: ALTER ROLE operator_control LOGIN PASSWORD '<generated>'; keep the
--      connection string in the operator's env as OPERATOR_CONTROL_DATABASE_URL (gitignored, Vercel).
--   3. Only THEN does the dependent route code (getOperatorControlClient + the pause-global cutover) go
--      live — before the cred exists, service-role still writes the flags (pre-apply compatibility), and
--      AFTER apply a service-role write to these columns is trigger-REJECTED, so the cred MUST be set or
--      the pause button stops working. This is the two-track order: DDL applies before the dependent code
--      relies on it.

BEGIN;

-- ── Scoped role: operator_control (NOLOGIN here — no secret in the committed migration) ──
-- The operator ALTERs it to LOGIN + a generated password at apply time (step 2 above). NOT superuser,
-- NOT owner, NO createrole, NO bypassrls; cannot SET ROLE into postgres/service_role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'operator_control') THEN
    CREATE ROLE operator_control NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END$$;

-- ── Least-privilege grants ──
-- It must read + write ONLY the system_state control columns (schedule + emergency stop + updated_at) and
-- insert the audit trail. It can mutate nothing else.
GRANT USAGE ON SCHEMA public TO operator_control;
GRANT SELECT ON public.system_state TO operator_control;
GRANT UPDATE (global_processing_paused, scrape_cadence, scrape_start_date, updated_at)
  ON public.system_state TO operator_control;

-- ── Standing audit trail: every AUTHORIZED stop-flag change logs actor + old/new (a rejected attempt
-- raises + is visible in the Postgres log; only authorized writes reach this table). ──
CREATE TABLE IF NOT EXISTS public.system_state_flag_audit (
  id          bigserial PRIMARY KEY,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  changed_by  text        NOT NULL,
  column_name text        NOT NULL,
  old_value   text,
  new_value   text
);
GRANT INSERT ON public.system_state_flag_audit TO operator_control;
GRANT USAGE, SELECT ON SEQUENCE public.system_state_flag_audit_id_seq TO operator_control;

-- ── RLS policies for operator_control (mirrors 118: it connects directly, auth.role() is NULL, so give it
-- explicit role-scoped policies; NOBYPASSRLS keeps these the ONLY way it writes). Harmless if RLS is off. ──
ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_state_operator_control_select" ON public.system_state;
CREATE POLICY "system_state_operator_control_select" ON public.system_state
  FOR SELECT TO operator_control USING (true);
DROP POLICY IF EXISTS "system_state_operator_control_update" ON public.system_state;
CREATE POLICY "system_state_operator_control_update" ON public.system_state
  FOR UPDATE TO operator_control USING (true) WITH CHECK (true);
-- Preserve the existing service_role access RLS bypass grants would otherwise cover (service_role has
-- BYPASSRLS, so enabling RLS here does not change its reads/writes to the NON-flag columns — the trigger,
-- not RLS, is what binds the flags).
DROP POLICY IF EXISTS "system_state_service_role_all" ON public.system_state;
CREATE POLICY "system_state_service_role_all" ON public.system_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── guard_operator_stop_flags: the binding. BEFORE UPDATE, every row. If either stop flag changes, allow
-- ONLY when current_user = 'operator_control'; log the authorized change. A service-role (or any other)
-- attempt to change the flags is rejected by construction. ──
CREATE OR REPLACE FUNCTION public.guard_operator_stop_flags()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.global_processing_paused IS DISTINCT FROM OLD.global_processing_paused
     OR NEW.scrape_cadence IS DISTINCT FROM OLD.scrape_cadence THEN
    IF current_user <> 'operator_control' THEN
      RAISE EXCEPTION
        'operator-stop-states-are-inviolable: the system_state stop flags (global_processing_paused / scrape_cadence) may be changed ONLY by the bound operator_control credential; current_user=% is not authorized. Lifting a stop flag to route around a stop condition is the worst-class violation.',
        current_user USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.global_processing_paused IS DISTINCT FROM OLD.global_processing_paused THEN
      INSERT INTO public.system_state_flag_audit(changed_by, column_name, old_value, new_value)
        VALUES (current_user, 'global_processing_paused', OLD.global_processing_paused::text, NEW.global_processing_paused::text);
    END IF;
    IF NEW.scrape_cadence IS DISTINCT FROM OLD.scrape_cadence THEN
      INSERT INTO public.system_state_flag_audit(changed_by, column_name, old_value, new_value)
        VALUES (current_user, 'scrape_cadence', OLD.scrape_cadence::text, NEW.scrape_cadence::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.guard_operator_stop_flags() IS
  'Unit 2a operator-stop-states binding. BEFORE UPDATE on system_state: rejects any change to global_processing_paused / scrape_cadence unless current_user = operator_control (the bound admin-route credential); logs authorized changes to system_state_flag_audit. Enforces operator-stop-states-are-inviolable by construction — service_role cannot flip the flags. Not owner-proof (postgres owner can disable it); full binding additionally requires operator-side removal of the unrestricted creds from the agent env.';

DROP TRIGGER IF EXISTS guard_operator_stop_flags_trg ON public.system_state;
CREATE TRIGGER guard_operator_stop_flags_trg
  BEFORE UPDATE ON public.system_state
  FOR EACH ROW EXECUTE FUNCTION public.guard_operator_stop_flags();

COMMIT;
