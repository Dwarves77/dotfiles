-- subject: Migration 311 (lane SPEC09-B, 2026-09-05 — **renumbered from the lane's own 308 by the ASSEMBLE-47 coordinator lane**: 308/309/310 were already taken by lanes RULINGS-EXEC/ATTACH-SOURCES/CHIPS in this train; disjoint objects, no dependency among any of them, renumbered to the next free slot — workstream W5.1, "spec-09 panels, the customer-data half": `docs/plans/complete-system-build-plan-2026-09-04.md`; `docs/specs/09-domain-extensions.md`). Root cause `[CONFIRMED]`, this lane, reading migrations 296-298 directly: `surcharge_audits`, `tce_data_quality`, `auxiliary_energy_profiles`, `eudr_plot_claims`, `custody_chains`, `indexation_clauses`, and `carrier_compliance_pools` were all created `SELECT TO authenticated USING (true)` — every signed-in user of ANY org could read every other org's rows. That posture was harmless while the tables were schema-only and 0-row; this lane wires the first real writer (a workspace CSV upload route, `POST /api/workspace/spec09-upload`, plus five refactored CLI producers sharing one parser, `src/lib/spec09/csv-upload-contract.mjs`) for genuinely customer-supplied operational data (billed invoices, DQI evidence, auxiliary loads, EUDR plot claims, custody certificates, contract indexation terms) — none of it is shared platform intelligence, so it cannot go live still world-readable-to-authenticated. THE FIX, six tables: adds `org_id uuid REFERENCES organizations(id) NOT NULL` (added nullable then set NOT NULL as a separate statement, safe only because of the 0-row precondition below) plus an index; replaces each table's read policy with `CREATE POLICY <table>_org_read ... USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role')` — the identical pattern migration 077 already uses for `org_watchlist`, reusing migration 006's own `SECURITY DEFINER` function rather than inventing a second org-membership check. No write policy is added (service_role bypasses RLS; both the upload route and the CLI producers write via the service-role client). `oem_tech_roadmaps` and `reroute_events` are explicitly UNCHANGED — they stay platform-shared per spec 09 §1.1/§1.7's own sourcing model, not a customer upload. `carrier_compliance_pools` is DROPPED outright (with `surcharge_audits.pool_id`/`.pool_adjusted_eur` and their CHECK constraint): spec 09 names Market as its only possible reader, migration 296's own header already states `pool_adjusted_eur` is deliberately never populated (`poolAdjustedGuard()`, spec 09 §5 open decision 1 "stays unmade"), and this lane's brief requires either building the reader or dropping the table with 0 rows confirmed — building a UI element for a value the calculator layer refuses to surface would just move the unmade operator decision into a new, useless panel; `variance_eur` (billed vs statutory, the always-renderable sentence `surcharge_audits` exists to carry) is untouched. GUARD: a precondition `DO` block re-confirms live 0 rows on all ten spec09 tables (`RAISE EXCEPTION` naming the exact table and count if any is nonzero) before touching anything, so an out-of-date apply fails loudly rather than silently dropping data or breaking a NOT NULL backfill. POST-CHECK: table gone, columns gone, `org_id` NOT NULL on all six, and the six `<table>_org_read` policies present by name — structural, not adversarial. **Lane MIG311-FIX (2026-09-05)** found the migration's own original inline adversarial cross-org RLS proof unappliable `[CONFIRMED]`: it inserted a throwaway `org_memberships` row with `user_id := gen_random_uuid()` and a `surcharge_audits` row with placeholder `corridor_id`/`carrier_id` values, but `org_memberships_user_id_fkey -> profiles(id)` (migration 075, applied live before this migration was written) has no matching `profiles` row for a migration-minted uuid — a `profiles` row is created only by the signup/onboarding path writing `auth.users`, which migrations never touch — and `surcharge_audits.corridor_id`/`.carrier_id -> entities(entity_id)` (migration 296) is not guaranteed to accept a placeholder id either; either FK raising would roll back the entire migration, DDL included, on every real apply attempt. Rule 15 ("attack, don't assert") still applies, it just cannot be satisfied from inside a forward-only migration transaction: the SAME proof (org A's member sees org A's row; org B's member sees none, via `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)` exactly as originally attempted) now runs against LIVE organizations/org_memberships/entities, inside a transaction that always rolls back, as `fsi-app/scripts/verify/spec09-org-rls-adversarial-audit.mjs` — registered in `run-data-audit-lane.mjs`'s `AUDITS` (execution-wired by that registration alone; no F25 allowlist entry needed) and re-attacked on every data-audit-lane run rather than once at apply time; it self-skips (exit 2) rather than fabricating fixtures if fewer than two live orgs have a member or `entities` lacks a `corridor`/`organisation` pair, and is unit-tested (`spec09-org-rls-adversarial-audit.test.mjs`, pure assertion logic against a fake client). Four spec09 panels (`SurchargeAuditPanel.tsx`, `AuxiliaryEnergyPanel.tsx`, `DqiPanel.tsx`, `EudrCustodyPanel.tsx`) were found reading these tables with an UNSCOPED service-role query (no `org_id` filter at all) — a real, in-scope cross-org leak the moment this migration's `org_id` columns get populated — and were fixed the same lane to filter `.eq("org_id", orgId)` from `resolveOrgIdFromCookies()`; a new `IndexationPanel.tsx`/`IndexationPanelView.tsx` (Market) is org-scoped from creation. Registered in `fsi-app/docs/inventories/shared-dataset-ownership.md`. **APPLIED LIVE 2026-09-05 19:58:09 UTC** by the coordinator via Supabase MCP, using lane MIG311-FIX's version (adversarial RLS proof moved out of the migration into `scripts/verify/spec09-org-rls-adversarial-audit.mjs`; structural post-check passed: table gone, columns gone, `org_id` NOT NULL on all six, six `<table>_org_read` policies present by name; `schema_migrations` version `20260905195809`). Was: written, not applied — this lane's Supabase MCP access was read-only SELECT (used only to confirm the 0-row precondition and to introspect `auth.uid()`/`user_belongs_to_org` live before writing the guard); the coordinator's own live-read (2026-09-05 20:25 UTC) had confirmed the FK-vs-fixture defect above ahead of lane MIG311-FIX's fix. Reversible: re-add `carrier_compliance_pools` from migration 296 (DDL only, 0 rows lost since none existed), re-add `surcharge_audits.pool_id`/`.pool_adjusted_eur` + CHECK, `DROP COLUMN org_id` on all six tables, and restore each table's original `<table>_read ... USING (true)` policy (migrations 296-298 have the exact original policy text). [glyph:verbatim]
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
  n_policies int;
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

  -- The six org-scoped read policies exist, by name (structural presence only).
  SELECT count(*) INTO n_policies FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'surcharge_audits_org_read', 'tce_data_quality_org_read', 'auxiliary_energy_profiles_org_read',
        'eudr_plot_claims_org_read', 'custody_chains_org_read', 'indexation_clauses_org_read'
      );
  IF n_policies <> 6 THEN RAISE EXCEPTION 'ABORT: expected 6 org-scoped read policies, found %', n_policies; END IF;

  -- ── Adversarial cross-org RLS proof — MOVED OUT of this migration (lane MIG311-FIX, 2026-09-05; rule
  -- 15 still applies, it just cannot be satisfied from inside a forward-only migration transaction here).
  -- The version of this block that shipped with SPEC09-B inserted a throwaway org_memberships row with
  -- user_id := gen_random_uuid() and a surcharge_audits row with placeholder corridor_id/carrier_id
  -- values. Both violate live FKs added AFTER this migration was authored: org_memberships_user_id_fkey
  -- -> profiles(id) (migration 075) has no matching profiles row for a migration-minted uuid — a profiles
  -- row is created only by the signup/onboarding path writing auth.users, and migrations never write the
  -- auth schema — and surcharge_audits.corridor_id/.carrier_id -> entities(entity_id) (migration 296) is
  -- not guaranteed to accept a placeholder id. Either FK failing rolled back this ENTIRE migration,
  -- including the DDL above, which is correct and needed on its own and does not depend on the proof.
  -- The SAME assertion (org A's member sees org A's row; org B's member sees none, via SET LOCAL ROLE
  -- authenticated + set_config('request.jwt.claims', ...) exactly as attempted here) now runs against
  -- LIVE organizations/org_memberships/entities, inside a transaction it always rolls back, as
  -- fsi-app/scripts/verify/spec09-org-rls-adversarial-audit.mjs — registered in run-data-audit-lane.mjs's
  -- AUDITS and re-attacked on every data-audit-lane run, not just once at apply time.
  RAISE NOTICE 'migration 311 OK: carrier_compliance_pools dropped, 6 tables org-scoped, 6 read policies present by name, 0 rows at rest. Adversarial cross-org RLS proof runs separately and continuously: fsi-app/scripts/verify/spec09-org-rls-adversarial-audit.mjs (lane MIG311-FIX).';
END $$;
