-- subject: Migration 330 (fix lane SEC-1, Supabase integrity-and-wiring audit, 2026-09-25). Closes SEC-1
-- [CONFIRMED]: public.derivation_edges (migration 285) has RLS disabled and anon/authenticated hold full
-- CRUD grants (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER, the schema's default PUBLIC-grant
-- posture at table-creation time , migration 285 enabled RLS + locked grants on its sibling `derived_values`
-- but never repeated either step for `derivation_edges`, an oversight this migration closes without
-- changing any application behaviour: every reader and writer of this table already goes through the
-- service-role client (`register-derivation.ts`'s `register_derived_value()` RPC; the audit/backfill
-- scripts `scripts/entities/backfill-derivation-edges.mjs`, `scripts/propagation/seed-derived-values.mjs`,
-- `scripts/turns/run-propagation-drain.mjs`, all constructing `createClient(..., SUPABASE_SERVICE_ROLE_KEY)`
-- (grep across fsi-app/src and fsi-app/scripts, this lane, found zero anon/authenticated-client
-- consumers), and service_role carries BYPASSRLS, so it is unaffected by either change here.
--
-- WHY NO SELECT POLICY (unlike derived_values, which grants SELECT on its gated
-- `derived_values_admissible` view to `authenticated` , migration 285's RLS section, spec 08 section 3.3's second
-- enforcement point). `derivation_edges` is the invalidation DAG's internal wiring table (from_table/
-- from_pk -> to_value_id), never a customer- or admin-surface read target: grep across `src/app`,
-- `src/components`, `src/app/api` (this lane) found no importer of `derivation_edges` outside
-- `src/lib/propagation/` (service-role-only). Locking it down with NO policy for anon/authenticated
-- (deny-all, the RLS default with zero policies) matches the "no GRANT EXECUTE to authenticated/anon"
-- posture migration 285's own header already states for `register_derived_value()` , this migration
-- closes the one place that posture was not carried through to the table itself.
--
-- ~24 live rows at audit time (SEC-1); this migration changes access control only, no data is touched.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.derivation_edges') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.derivation_edges does not exist , migration 285 must be applied first';
  END IF;
END $$;

-- ── Revoke the default PUBLIC-inherited CRUD grants from anon/authenticated ─────────────────────────────
-- service_role is untouched (not named below) , it needs its existing grants to keep register_derived_value
-- / the backfill scripts working, and it bypasses RLS entirely regardless (BYPASSRLS), so this REVOKE would
-- not affect it even if it were named.
REVOKE ALL ON TABLE public.derivation_edges FROM anon, authenticated;

-- ── Enable RLS, no policies , deny-all for anon/authenticated (spec 08 section 3.3's posture, no gated view
-- needed here because nothing outside src/lib/propagation/ reads this table) ────────────────────────────
ALTER TABLE public.derivation_edges ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policy for anon/authenticated: deliberate. This table has no
-- user-facing or admin-facing reader (verified this lane, grep across src/app + src/components); every
-- consumer is the service-role client, which bypasses RLS by role membership independent of this ALTER.

COMMENT ON TABLE public.derivation_edges IS
  'The invalidation DAG (spec 08 section 2.2 Part 2): one row per (input, derived value) dependency, one row per '
  'registerDerivedValue() call per declared input (register-derivation.ts writes this table AND '
  'derived_values.inputs from the SAME caller-supplied list , see that column''s comment). from_table is a '
  'closed allowlist (derivation_edges_from_table_allowed) mirroring entity_refs_ref_table_allowed''s '
  'posture (migration 283): widen deliberately, in a reviewed migration, never by inference. '
  'invalidate_dependents() (below) walks this table; propagation_events.(table_name,row_pk) (migration '
  '284) addresses an input in the IDENTICAL shape, so the walk''s seed step is a plain equality join. '
  'RLS ENABLED, no anon/authenticated policy (migration 330, SEC-1 fix): every reader/writer is the '
  'service-role client (src/lib/propagation/), which bypasses RLS by role membership; there is no '
  'customer- or admin-surface reader of this table.';

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_grants int;
  rls_on boolean;
BEGIN
  SELECT count(*) INTO n_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'derivation_edges'
     AND grantee IN ('anon', 'authenticated');
  IF n_grants <> 0 THEN
    RAISE EXCEPTION 'ABORT: anon/authenticated still hold % grant(s) on derivation_edges after REVOKE', n_grants;
  END IF;

  SELECT relrowsecurity INTO rls_on FROM pg_class
   WHERE relnamespace = 'public'::regnamespace AND relname = 'derivation_edges';
  IF NOT rls_on THEN
    RAISE EXCEPTION 'ABORT: derivation_edges.relrowsecurity is still false after ENABLE ROW LEVEL SECURITY';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'derivation_edges') THEN
    RAISE EXCEPTION 'ABORT: derivation_edges unexpectedly carries a policy , this migration ships deny-all, no policy';
  END IF;

  RAISE NOTICE 'migration 330 OK: derivation_edges RLS enabled, 0 anon/authenticated grants, 0 policies (deny-all)';
END $$;
