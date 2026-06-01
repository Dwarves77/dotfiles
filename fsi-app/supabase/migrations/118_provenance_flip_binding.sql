-- Migration 118: #43 provenance-flip credential binding (Sprint 4 Phase 2 precondition).
--
-- INVARIANT ENFORCED (decision-log #43): a pre-existing intelligence_items row may
-- be flipped OFF provenance_status='unverified' ONLY by the dedicated, scoped
-- `reconciler` credential. The unrestricted service-role key CANNOT cause that flip
-- — not by convention, but by construction: the flip write is gated inside a
-- trigger keyed on current_user, and service_role (rolbypassrls=true but NOT the
-- table owner, NOT superuser) can neither satisfy the gate, assume the owner, nor
-- disable the trigger. BYPASSRLS does not skip triggers.
--
-- WHY A TRIGGER (not RLS, not a column GRANT):
--   - RLS: service_role bypasses RLS entirely; the existing UPDATE policy gate is
--     `auth.role() = 'service_role'`, which service_role satisfies. RLS cannot bind it.
--   - Column GRANT: the flip is not written by the external caller — it is written by
--     the set_provenance_status AFTER trigger (SECURITY INVOKER) re-deriving status.
--     Revoking provenance_status from service_role would also break legitimate
--     new-item ingestion, whose status is set the same way.
--   - Trigger keyed on current_user: fires for every role (BYPASSRLS included), cannot
--     be skipped without table ownership, and current_user reflects the connected role
--     even across PostgREST's `SET ROLE service_role`. This is the only faithful gate.
--
-- SCOPE: this gate targets exactly the `unverified -> terminal` transition (the
-- reconciliation flip). It does NOT touch:
--   - new-item ingestion (carved out below via stamp_prov_origin: an INSERT-origin
--     self-derivation is allowed for service_role — additive inserts are not #43's concern),
--   - the admin verification-queue flip (pending_human_verify -> verified): OLD is not
--     'unverified', so the guard never evaluates it.
--
-- ADDITIVE per Block-1 discipline: no ALTER/DROP of existing columns/constraints, no
-- backfill, no modification of the set_provenance_status / validate_item_provenance
-- functions. Two new triggers + one scoped role + its grants/policies. Nothing flips at
-- apply time (creating a trigger does not fire it).
--
-- RESIDUAL (surfaced, not silently accepted): this guard is impossible-to-bypass for
-- service_role. It is NOT owner-proof: the `postgres` pooler role OWNS intelligence_items
-- and can DISABLE/DROP this trigger. Full #43 satisfaction therefore additionally requires
-- the operator to remove/rotate the unrestricted creds (SUPABASE_DB_PASSWORD = postgres
-- owner, SUPABASE_SERVICE_ROLE_KEY) from the agent's environment, leaving only the scoped
-- `reconciler` credential. The guard binds the named adversary (service-role key) by
-- construction; the owner credential is bound by operator-side credential scoping.

BEGIN;

-- ── Scoped role: reconciler ─────────────────────────────────────────
-- Created NOLOGIN here (no secret in the committed migration). The build script
-- (scripts/phase2-build-binding.mjs) ALTERs it to LOGIN + a generated password kept
-- in .env.local (gitignored). NOT superuser, NOT owner, NO createrole, NO bypassrls,
-- cannot SET ROLE into postgres/service_role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reconciler') THEN
    CREATE ROLE reconciler NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END$$;

-- ── Least-privilege grants for reconciler ───────────────────────────
-- It must: touch updated_at to drive the flip; let the SECURITY INVOKER trigger write
-- provenance_status/provenance_verified_at and (on quarantine) INSERT an integrity_flags
-- row; read everything validate_item_provenance reads. It can mutate NOTHING else
-- (column-scoped UPDATE; no content columns).
GRANT USAGE ON SCHEMA public TO reconciler;
GRANT SELECT ON
  public.intelligence_items,
  public.sources,
  public.intelligence_item_sections,
  public.section_claim_provenance,
  public.agent_run_searches,
  public.item_type_required_slots,
  public.integrity_flags
  TO reconciler;
GRANT UPDATE (updated_at, provenance_status, provenance_verified_at)
  ON public.intelligence_items TO reconciler;
GRANT INSERT ON public.integrity_flags TO reconciler;
GRANT EXECUTE ON FUNCTION public.validate_item_provenance(uuid) TO reconciler;

-- ── RLS policies for reconciler ─────────────────────────────────────
-- reconciler connects directly (no JWT) so auth.role() is NULL and the existing
-- `auth.role() = 'service_role'` UPDATE policy does NOT match it. Give it explicit,
-- role-scoped permissive policies. NOBYPASSRLS keeps it honest — these policies are
-- the ONLY way it writes, and they are scoped TO reconciler so no other role is affected.
DROP POLICY IF EXISTS "intelligence_items_reconciler_update" ON public.intelligence_items;
CREATE POLICY "intelligence_items_reconciler_update"
  ON public.intelligence_items
  FOR UPDATE TO reconciler
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "integrity_flags_reconciler_select" ON public.integrity_flags;
CREATE POLICY "integrity_flags_reconciler_select"
  ON public.integrity_flags
  FOR SELECT TO reconciler
  USING (true);

DROP POLICY IF EXISTS "integrity_flags_reconciler_insert" ON public.integrity_flags;
CREATE POLICY "integrity_flags_reconciler_insert"
  ON public.integrity_flags
  FOR INSERT TO reconciler
  WITH CHECK (true);

-- ── stamp_prov_origin: records the EXTERNAL op (INSERT vs UPDATE) ────
-- Fires only at depth 0 (the external statement), before set_provenance_status's
-- AFTER fire issues its self-UPDATE. Stamps a transaction-local GUC with TG_OP so the
-- guard (which runs at depth>=1 during the self-UPDATE) can tell genuine new-item
-- ingestion (INSERT-origin) from a reconciliation/edit of an existing row (UPDATE-origin).
-- The caller cannot forge this: it is stamped by this trusted trigger, and the guard
-- only trusts it at depth>=1, where it was freshly set this statement.
CREATE OR REPLACE FUNCTION public.stamp_prov_origin()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  PERFORM set_config('app.prov_flip_origin', TG_OP, true);  -- true = transaction-local
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.stamp_prov_origin() IS
  '#43 binding helper. Depth-0 BEFORE INSERT/UPDATE on intelligence_items: stamps the transaction-local GUC app.prov_flip_origin with TG_OP so guard_provenance_flip can carve out genuine new-item ingestion (INSERT-origin) from a reconciliation/edit flip (UPDATE-origin) of a pre-existing row.';

DROP TRIGGER IF EXISTS stamp_prov_origin_trg ON public.intelligence_items;
CREATE TRIGGER stamp_prov_origin_trg
  BEFORE INSERT OR UPDATE ON public.intelligence_items
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.stamp_prov_origin();

-- ── guard_provenance_flip: the binding ──────────────────────────────
-- BEFORE UPDATE, every row, every depth. The actual flip write happens at depth>=1
-- (the set_provenance_status self-UPDATE) or, for a direct attack, at depth 0. We gate
-- the unverified->terminal transition: allow ONLY when the connected role is reconciler,
-- OR when this is a brand-new row's INSERT-origin derivation (depth>=1 AND origin='INSERT').
-- A direct depth-0 column write by service_role has depth 0 -> carve-out fails -> rejected.
-- A reconciliation touch by service_role drives a depth>=1 self-UPDATE with origin='UPDATE'
-- -> carve-out fails -> rejected. Only reconciler passes the top condition.
CREATE OR REPLACE FUNCTION public.guard_provenance_flip()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.provenance_status = 'unverified'
     AND NEW.provenance_status IS DISTINCT FROM OLD.provenance_status THEN
    IF current_user <> 'reconciler'
       AND NOT (
         pg_trigger_depth() >= 1
         AND coalesce(current_setting('app.prov_flip_origin', true), '') = 'INSERT'
       ) THEN
      RAISE EXCEPTION
        '#43 provenance binding: flipping pre-existing item % off ''unverified'' (-> %) requires the bound reconciler credential; current_user=% is not authorized.',
        NEW.id, NEW.provenance_status, current_user
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.guard_provenance_flip() IS
  '#43 credential binding. BEFORE UPDATE on intelligence_items: rejects any unverified->terminal provenance_status flip unless current_user = reconciler (the bound credential) or it is a genuine new-item INSERT-origin derivation. Enforces "the provenance flip cannot occur through the unrestricted service-role key" by construction — service_role cannot satisfy the gate, assume the owner, or disable this trigger. Not owner-proof (the postgres owner can disable it); full binding additionally requires operator-side removal of the unrestricted creds from the agent env.';

DROP TRIGGER IF EXISTS guard_provenance_flip_trg ON public.intelligence_items;
CREATE TRIGGER guard_provenance_flip_trg
  BEFORE UPDATE ON public.intelligence_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_provenance_flip();

COMMIT;
