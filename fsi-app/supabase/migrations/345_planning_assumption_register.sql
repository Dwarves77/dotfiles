-- subject: Migration 345 (lane W2-R2, 2026-10-01): `planning_assumption_register`, the per-tenant
-- planning-assumption register docs/specs/03-research.md section 5/10 names ("Assumption register |
-- Absent. Per-tenant object does not exist") -- NOT the pre-existing `assumption_register` table
-- (migration 271, WO-20's register for modelling constants this product chose: a connection-scorer
-- weight, an idf coefficient; read-only to authenticated, no workspace scoping, no write policy at
-- all). This lane's dispatch asked to grep `assumption_register` and build against what it found;
-- what it found is that unrelated table. CORRECTION, recorded here and in
-- src/lib/assumptions/contract.mjs's header and this lane's session-log entry: this migration adds a
-- NEW, distinctly-named table for the per-tenant object, rather than repurposing migration 271's
-- table (which would violate its documented read-only/no-workspace-scope posture and conflate two
-- different registries under one name).
--
-- SHAPE (spec 03 section 5's exemplar, read literally): name (the assumption itself, quantified
-- where possible), value_numeric/unit (the bare number, nullable -- not every assumption reduces to
-- one), bound_to (what it sits under, e.g. "34% of quoted margin on EU road"), load_bearing +
-- vulnerable (both booleans; their AND is spec section 7 #7's "assumption-register binding" --
-- load-bearing x vulnerable is what makes an assumption eligible to anchor a so-what), review_date
-- (the last responsible moment to revisit), source_note (citation/rationale), status (lifecycle).
--
-- RLS PATTERN: copied from migration 313's workspace_tags (member self-service: any org member may
-- read/insert/update/delete their own workspace's rows; insert additionally requires the caller be
-- the created_by they claim), which itself mirrors migration 077's org_watchlist. This lane's
-- dispatch asked to "confirm the table's policies allow the member self-service shape" against
-- migration 271 -- that table's policies do NOT (read-only, no write policy at all, by design,
-- since it is a different object) -- so this migration supplies the member-self-service shape on
-- the NEW table instead.
--
-- Idempotent (IF NOT EXISTS / OR REPLACE throughout), two-track policy (CLAUDE.md standing rule 3):
-- schema-only, additive, no dependency write -- safe to apply as soon as reviewed. The coordinator
-- applies this via the Supabase CLI; this file is written by the lane and left unapplied.

BEGIN;

-- --- Preconditions -------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.organizations does not exist, migration 006 must be applied first';
  END IF;
  PERFORM 1 FROM pg_proc WHERE proname = 'user_belongs_to_org';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: user_belongs_to_org() does not exist, migration 006 must be applied first';
  END IF;
  IF to_regclass('public.planning_assumption_register') IS NOT NULL THEN
    RAISE NOTICE 'planning_assumption_register already exists, DDL below is idempotent (IF NOT EXISTS)';
  END IF;
END $$;

-- --- planning_assumption_register -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planning_assumption_register (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name           text NOT NULL,
  value_numeric  numeric,
  unit           text,
  bound_to       text NOT NULL,
  load_bearing   boolean NOT NULL DEFAULT false,
  vulnerable     boolean NOT NULL DEFAULT false,
  review_date    date NOT NULL,
  source_note    text,
  status         text NOT NULL DEFAULT 'active',
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_assumption_register_status_check
    CHECK (status IN ('active', 'superseded', 'retired')),
  CONSTRAINT planning_assumption_register_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT planning_assumption_register_bound_to_not_blank CHECK (length(trim(bound_to)) > 0),
  CONSTRAINT planning_assumption_register_value_unit_conominality
    CHECK (value_numeric IS NULL OR unit IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS planning_assumption_register_org_idx
  ON public.planning_assumption_register (org_id, status, created_at DESC);

COMMENT ON TABLE public.planning_assumption_register IS
  'Migration 345, lane W2-R2: the per-tenant planning-assumption register (docs/specs/03-research.md '
  'section 5) -- the set of things one forwarder''s pricing, contracting and capacity plans assume. '
  'NOT the same object as public.assumption_register (migration 271, product-modelling constants, '
  'read-only, no workspace scoping) -- see this file''s header for the naming-collision correction.';

COMMENT ON COLUMN public.planning_assumption_register.bound_to IS
  'What this assumption sits under, e.g. "34% of quoted margin on EU road" or a named corridor''s '
  'cost base (spec 03 section 5''s exemplar). Always prose; value_numeric/unit are the bare-number '
  'form when the assumption happens to reduce to one.';

COMMENT ON COLUMN public.planning_assumption_register.load_bearing IS
  'This assumption sits under a material share of plan/margin. Combined with vulnerable (AND), this '
  'is spec 03 section 7 #7''s "assumption-register binding" -- the pairing that makes an assumption '
  'eligible to anchor a research so-what, rendered as the LOAD-BEARING marker on an at-risk card.';

COMMENT ON COLUMN public.planning_assumption_register.vulnerable IS
  'This assumption depends on an unresolved external outcome (a pending regulation, an unconfirmed '
  'technology maturation). See load_bearing''s comment for the binding this pairs with.';

COMMENT ON COLUMN public.planning_assumption_register.review_date IS
  'The last responsible moment to revisit this assumption (spec 03 section 5''s "DECISION DEADLINE"), '
  'set by the customer against their own contract cycle, asset lead time, or regulatory notice period.';

COMMENT ON COLUMN public.planning_assumption_register.status IS
  'active | superseded | retired. A retuned assumption is edited in place via PATCH (unlike '
  'assumption_register''s append-only-supersession posture, migration 271) -- this register is '
  'customer-entered planning data, not a product-governed modelling constant; status tracks lifecycle '
  'without a mandated supersession chain.';

-- --- RLS: member self-service (migration 313 workspace_tags pattern) ------------------------------
ALTER TABLE public.planning_assumption_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_assumption_register_org_read ON public.planning_assumption_register;
CREATE POLICY planning_assumption_register_org_read ON public.planning_assumption_register FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS planning_assumption_register_org_insert ON public.planning_assumption_register;
CREATE POLICY planning_assumption_register_org_insert ON public.planning_assumption_register FOR INSERT
  WITH CHECK (
    (public.user_belongs_to_org(org_id) AND created_by = auth.uid())
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS planning_assumption_register_org_update ON public.planning_assumption_register;
CREATE POLICY planning_assumption_register_org_update ON public.planning_assumption_register FOR UPDATE
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role')
  WITH CHECK (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS planning_assumption_register_org_delete ON public.planning_assumption_register;
CREATE POLICY planning_assumption_register_org_delete ON public.planning_assumption_register FOR DELETE
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_assumption_register TO authenticated;

-- --- Post-checks -----------------------------------------------------------------------------------
DO $$
DECLARE
  n_cols   int;
  n_policies int;
  n_rows   int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'planning_assumption_register';
  SELECT count(*) INTO n_policies FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'planning_assumption_register';
  SELECT count(*) INTO n_rows FROM public.planning_assumption_register;

  IF n_cols <> 14 THEN
    RAISE EXCEPTION 'ABORT: planning_assumption_register has % columns, expected 14', n_cols;
  END IF;
  IF n_policies <> 4 THEN
    RAISE EXCEPTION 'ABORT: planning_assumption_register does not carry exactly 4 RLS policies (found %)', n_policies;
  END IF;

  RAISE NOTICE 'migration 345 OK: planning_assumption_register created, % columns, % RLS policies, % rows', n_cols, n_policies, n_rows;
END $$;

COMMIT;
