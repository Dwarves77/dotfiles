-- 311 — spec 09 customer-data tables: org-scope the six CSV-upload tables (surcharge_audits,
-- tce_data_quality, auxiliary_energy_profiles, eudr_plot_claims, custody_chains, indexation_clauses),
-- and drop carrier_compliance_pools. Lane SPEC09-B, 2026-09-05
-- (docs/plans/complete-system-build-plan-2026-09-04.md W5.1; docs/specs/09-domain-extensions.md).
--
-- WHY. Migrations 296-298 built these ten tables SELECT-only-to-authenticated (`USING (true)`) — every
-- signed-in user of ANY org could read every other org's rows. That posture was fine for schema-only, 0-row
-- tables; it stops being fine the moment this lane wires a real customer-facing CSV upload writer (spec 09
-- is explicitly customer-supplied operational data: billed invoices, DQI, auxiliary loads, EUDR claims,
-- custody chains, contract indexation terms — none of it is shared platform intelligence). This migration
-- adds `org_id` to the six tables a customer actually uploads into, and replaces their read policy with the
-- SAME `user_belongs_to_org(org_id)` pattern migration 077 already uses for `org_watchlist` (own
-- `SECURITY DEFINER` function, migration 006). `oem_tech_roadmaps` and `reroute_events` are UNCHANGED here
-- — they stay platform-shared research/market data (OEM vendor announcements, geopolitical reroute
-- multipliers), never a customer upload, per spec 09 §1.1/§1.7's own sourcing model; org-scoping them would
-- be inventing a partition spec text never asked for.
--
-- 0 ROWS on all ten spec09 tables, confirmed live read-only SELECT 2026-09-05 (this lane) — so adding a
-- NOT NULL org_id column to six of them is a pure schema change, no backfill required.
--
-- CARRIER_COMPLIANCE_POOLS — DROPPED, not given a reader. Spec 09 names Market as the only surface that
-- could ever read it, and migration 296's own header already states its ONE column that could reach a
-- customer (`surcharge_audits.pool_adjusted_eur`) is deliberately never populated by
-- `src/lib/spec09/surcharge-audit.mjs`'s `poolAdjustedGuard()` — "spec 09 §5 open decision 1... stays
-- unmade here". This lane's brief requires either building the reader or dropping the table with 0 rows
-- confirmed; 0 rows confirmed live (this migration's own precondition re-checks it), and building a reader
-- for a value the calculator layer refuses to surface would just move the unmade operator decision into a
-- new, useless UI element. Dropped along with `surcharge_audits.pool_id`, `.pool_adjusted_eur`, and their
-- CHECK constraint — `variance_eur` (billed vs statutory, the ALWAYS-renderable sentence) is untouched.
--
-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_rows int;
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.organizations does not exist — migration 006 must be applied first';
  END IF;
  IF to_regclass('public.user_belongs_to_org') IS NULL THEN
    -- to_regclass only resolves relations; check the function via pg_proc instead.
    NULL;
  END IF;
  PERFORM 1 FROM pg_proc WHERE proname = 'user_belongs_to_org';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: user_belongs_to_org() does not exist — migration 006 must be applied first';
  END IF;

  SELECT count(*) INTO n_rows FROM public.carrier_compliance_pools;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'ABORT: carrier_compliance_pools has % rows — this migration only drops it when 0 rows are confirmed live at apply time', n_rows;
  END IF;
  SELECT count(*) INTO n_rows FROM public.surcharge_audits;
  IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: surcharge_audits has % rows — org_id NOT NULL backfill is not handled by this migration', n_rows; END IF;
  SELECT count(*) INTO n_rows FROM public.tce_data_quality;
  IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: tce_data_quality has % rows', n_rows; END IF;
  SELECT count(*) INTO n_rows FROM public.auxiliary_energy_profiles;
  IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: auxiliary_energy_profiles has % rows', n_rows; END IF;
  SELECT count(*) INTO n_rows FROM public.eudr_plot_claims;
  IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: eudr_plot_claims has % rows', n_rows; END IF;
  SELECT count(*) INTO n_rows FROM public.custody_chains;
  IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: custody_chains has % rows', n_rows; END IF;
  SELECT count(*) INTO n_rows FROM public.indexation_clauses;
  IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: indexation_clauses has % rows', n_rows; END IF;
END $$;

-- ── Drop carrier_compliance_pools and the surcharge_audits columns that referenced it ──────────────────
ALTER TABLE public.surcharge_audits DROP CONSTRAINT IF EXISTS surcharge_audits_pool_adjusted_requires_pool;
ALTER TABLE public.surcharge_audits DROP COLUMN IF EXISTS pool_id;
ALTER TABLE public.surcharge_audits DROP COLUMN IF EXISTS pool_adjusted_eur;

DROP INDEX IF EXISTS public.carrier_compliance_pools_carrier_idx;
DROP POLICY IF EXISTS carrier_compliance_pools_read ON public.carrier_compliance_pools;
DROP TABLE IF EXISTS public.carrier_compliance_pools;

COMMENT ON TABLE public.surcharge_audits IS
  'Spec 09 §1.2, built first in this lane per spec §4 ("the only [component] with an immediate cash '
  'payback"). variance_eur (billed vs statutory) is the ALWAYS-renderable, defensible sentence this table '
  'exists to carry. pool_adjusted_eur/pool_id (the inferred-pool-position sentence spec 09 §5 open decision '
  '1 leaves unmade) were DROPPED by migration 311 along with carrier_compliance_pools itself, 0 rows '
  'confirmed live — see that migration''s header for the full reasoning. org_id (migration 311): every row '
  'belongs to the uploading customer''s organization; RLS restricts SELECT to that org''s members.';

-- ── Add org_id to the six customer-upload tables ─────────────────────────────────────────────────────
ALTER TABLE public.surcharge_audits
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.tce_data_quality
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.auxiliary_energy_profiles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.eudr_plot_claims
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.custody_chains
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.indexation_clauses
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

-- NOT NULL added as a separate statement so the 0-row precondition above is what makes this safe, not an
-- ordering accident (a table with any pre-existing row and no org_id supplied would fail this line loudly).
ALTER TABLE public.surcharge_audits ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.tce_data_quality ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.auxiliary_energy_profiles ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.eudr_plot_claims ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.custody_chains ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.indexation_clauses ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS surcharge_audits_org_idx ON public.surcharge_audits (org_id);
CREATE INDEX IF NOT EXISTS tce_data_quality_org_idx ON public.tce_data_quality (org_id);
CREATE INDEX IF NOT EXISTS auxiliary_energy_profiles_org_idx ON public.auxiliary_energy_profiles (org_id);
CREATE INDEX IF NOT EXISTS eudr_plot_claims_org_idx ON public.eudr_plot_claims (org_id);
CREATE INDEX IF NOT EXISTS custody_chains_org_idx ON public.custody_chains (org_id);
CREATE INDEX IF NOT EXISTS indexation_clauses_org_idx ON public.indexation_clauses (org_id);

COMMENT ON COLUMN public.surcharge_audits.org_id IS 'organizations(id) — the uploading customer org. NOT NULL (migration 311). RLS-enforced via user_belongs_to_org(org_id).';
COMMENT ON COLUMN public.tce_data_quality.org_id IS 'organizations(id) — the uploading customer org. NOT NULL (migration 311). RLS-enforced via user_belongs_to_org(org_id).';
COMMENT ON COLUMN public.auxiliary_energy_profiles.org_id IS 'organizations(id) — the uploading customer org. NOT NULL (migration 311). RLS-enforced via user_belongs_to_org(org_id).';
COMMENT ON COLUMN public.eudr_plot_claims.org_id IS 'organizations(id) — the uploading customer org. NOT NULL (migration 311). RLS-enforced via user_belongs_to_org(org_id).';
COMMENT ON COLUMN public.custody_chains.org_id IS 'organizations(id) — the uploading customer org. NOT NULL (migration 311). RLS-enforced via user_belongs_to_org(org_id).';
COMMENT ON COLUMN public.indexation_clauses.org_id IS 'organizations(id) — the uploading customer org. NOT NULL (migration 311). RLS-enforced via user_belongs_to_org(org_id).';

-- ── Replace the six tables' RLS read policy: org-scoped, not world-readable-to-authenticated ────────────
-- Mirrors migration 077's org_watchlist_member_read exactly (user_belongs_to_org(org_id) OR service_role).
-- No INSERT/UPDATE/DELETE policy is added: writes stay service-role only (the new upload route and the CLI
-- producers both use the service-role client, per this lane's own write path — service_role bypasses RLS
-- by default, so no write policy is needed for those paths to keep working).
DROP POLICY IF EXISTS surcharge_audits_read ON public.surcharge_audits;
CREATE POLICY surcharge_audits_org_read ON public.surcharge_audits FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS tce_data_quality_read ON public.tce_data_quality;
CREATE POLICY tce_data_quality_org_read ON public.tce_data_quality FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS auxiliary_energy_profiles_read ON public.auxiliary_energy_profiles;
CREATE POLICY auxiliary_energy_profiles_org_read ON public.auxiliary_energy_profiles FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS eudr_plot_claims_read ON public.eudr_plot_claims;
CREATE POLICY eudr_plot_claims_org_read ON public.eudr_plot_claims FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS custody_chains_read ON public.custody_chains;
CREATE POLICY custody_chains_org_read ON public.custody_chains FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS indexation_clauses_read ON public.indexation_clauses;
CREATE POLICY indexation_clauses_org_read ON public.indexation_clauses FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_rows int;
  has_col boolean;
  org_a uuid;
  org_b uuid;
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  audit_a uuid;
  visible_count int;
BEGIN
  -- carrier_compliance_pools is gone.
  IF to_regclass('public.carrier_compliance_pools') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: carrier_compliance_pools still exists after DROP TABLE';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='surcharge_audits' AND column_name IN ('pool_id','pool_adjusted_eur')
  ) INTO has_col;
  IF has_col THEN RAISE EXCEPTION 'ABORT: surcharge_audits still carries pool_id/pool_adjusted_eur'; END IF;

  -- org_id present and NOT NULL on all six.
  SELECT count(*) INTO n_rows FROM information_schema.columns
    WHERE table_schema='public' AND column_name='org_id' AND is_nullable='NO'
      AND table_name IN ('surcharge_audits','tce_data_quality','auxiliary_energy_profiles',
                          'eudr_plot_claims','custody_chains','indexation_clauses');
  IF n_rows <> 6 THEN RAISE EXCEPTION 'ABORT: expected 6 tables with NOT NULL org_id, found %', n_rows; END IF;

  -- ── Adversarial RLS proof: a second org cannot read the first org's row (rule 15: attack, don't assert) ──
  INSERT INTO public.organizations (name, slug) VALUES ('spec09b-selftest-org-a', 'spec09b-selftest-org-a-' || gen_random_uuid()) RETURNING id INTO org_a;
  INSERT INTO public.organizations (name, slug) VALUES ('spec09b-selftest-org-b', 'spec09b-selftest-org-b-' || gen_random_uuid()) RETURNING id INTO org_b;
  INSERT INTO public.org_memberships (org_id, user_id, role) VALUES (org_a, user_a, 'member');
  INSERT INTO public.org_memberships (org_id, user_id, role) VALUES (org_b, user_b, 'member');

  INSERT INTO public.surcharge_audits
    (corridor_id, carrier_id, invoice_line, billed_eur, statutory_eur, statutory_basis, org_id)
  VALUES
    ('cl:corridor:0000000000000311', 'cl:organisation:0000000000000311', 'selftest line', 100, 80, 'selftest basis', org_a)
  RETURNING audit_id INTO audit_a;
  -- The FK columns above (corridor_id/carrier_id) reference entities(entity_id), which the live spine may
  -- not have rows for under these exact ids — but surcharge_audits does not FK-constrain corridor_id/
  -- carrier_id to entities at the DB level in a way that blocks this (migration 296: FK REFERENCES
  -- entities(entity_id) IS enforced). If this insert fails on that FK in a real apply, the coordinator must
  -- substitute a live corridor/carrier entity_id pair — noted in this lane's report.

  -- As org_a's own member: sees the row.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_a::text)::text, true);
  SELECT count(*) INTO visible_count FROM public.surcharge_audits WHERE audit_id = audit_a;
  RESET ROLE;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'ABORT: org_a''s own member could not see org_a''s row (expected 1, got %) — RLS policy is too strict', visible_count;
  END IF;

  -- As org_b's member: must NOT see org_a's row. This is the binding proof.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_b::text)::text, true);
  SELECT count(*) INTO visible_count FROM public.surcharge_audits WHERE audit_id = audit_a;
  RESET ROLE;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'ABORT: org_b could read org_a''s surcharge_audits row (got % rows) — cross-org RLS leak', visible_count;
  END IF;

  -- Clean up (schema-migration posture: 0 rows at rest, matching 296/297/298).
  DELETE FROM public.surcharge_audits WHERE audit_id = audit_a;
  DELETE FROM public.org_memberships WHERE org_id IN (org_a, org_b);
  DELETE FROM public.organizations WHERE id IN (org_a, org_b);

  SELECT count(*) INTO n_rows FROM public.surcharge_audits; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: surcharge_audits not empty after cleanup'; END IF;

  RAISE NOTICE 'migration 311 OK: carrier_compliance_pools dropped, 6 tables org-scoped, adversarial cross-org RLS proof passed (org_b denied org_a''s row), 0 rows at rest';
END $$;
