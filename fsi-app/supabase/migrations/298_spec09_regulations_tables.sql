-- 298 — spec 09 Regulations domain tables: EUDR geo-traceability (§1.8a), book-and-claim custody (§1.8b).
-- Lane SPEC-09, wave 3, 2026-09-03 (docs/specs/09-domain-extensions.md;
-- docs/plans/wave3-lanes-2026-09-03.md).
--
-- Same posture as migrations 296/297 in full — read 296's header before this one. Surrogate uuid PKs
-- (never `entity_id`), shared canonical vocabularies where a vocabulary column applies, SELECT-only-to-
-- authenticated RLS.
--
-- THE ONE POINT SPEC TEXT ITSELF INSISTS ON, MECHANISED HERE: "the operational consequence is a border
-- hold, not a later fine... hold_risk = 'border_hold' must render as a BLOCKING OPERATIONAL ALERT, in a
-- DIFFERENT VISUAL CLASS from a monetary exposure" and "double_count_check = 'conflict_detected' is a
-- LIABILITY, not a data-quality flag". Neither severity vocabulary is invented here (this schema does not
-- carry a bespoke severity enum) — src/lib/spec09/eudr-custody.mjs classifies both into the vocabulary a
-- renderer already needs, and every EudrCustody* component (same commit) renders the two in genuinely
-- different visual treatments, never a shared severity chip.
--
-- claimant_id (custody_chains) is the one FK here that resolves to an existing entity_kind
-- (organisation) — see migration 296's header for the "not DB-enforced kind" restraint applied the same
-- way. consignment_ref (eudr_plot_claims) has no entity-spine home (a consignment is neither a corridor
-- nor an asset in the v1 roster's sense) and is a free-text caller identifier, same reasoning as 297's
-- tce_id.

-- ── eudr_plot_claims (spec §1.8, EUDR geo-traceability) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eudr_plot_claims (
  claim_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_ref  text NOT NULL CHECK (length(consignment_ref) > 0),
  geometry_json    jsonb,            -- point for <4ha, polygon otherwise
  area_ha          numeric CHECK (area_ha IS NULL OR area_ha >= 0),
  validation_state  text NOT NULL CHECK (validation_state IN
    ('missing','malformed','valid','fails_cutoff')),
  hold_risk        text NOT NULL CHECK (hold_risk IN ('none','documentary','border_hold')),
  dds_reference    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.eudr_plot_claims IS
  'Spec 09 §1.8: EUDR due-diligence geo-traceability per consignment. hold_risk=''border_hold'' is a '
  'BLOCKING OPERATIONAL ALERT (spec text) — "a missing polygon does not cost money later, it stops the '
  'container now" — classified from validation_state by src/lib/spec09/eudr-custody.mjs, never rendered in '
  'the same visual class as a monetary-exposure figure (mechanised at the render layer: every '
  'EudrCustody* component, same commit).';
COMMENT ON COLUMN public.eudr_plot_claims.consignment_ref IS
  'Caller-supplied consignment identifier. No entity_kind fits a consignment in the v1 roster — free-text, '
  'not an entities FK (same reasoning as migration 297''s tce_id).';
COMMENT ON COLUMN public.eudr_plot_claims.geometry_json IS
  'Point geometry for area_ha < 4ha, polygon otherwise (spec text, the EUDR regulation''s own threshold). '
  'Shape is not validated at the DB layer (jsonb, no PostGIS dependency introduced by this migration) — '
  'src/lib/spec09/eudr-custody.mjs''s classifyValidationState() is the one place geometry presence/shape is '
  'read to derive validation_state.';
COMMENT ON COLUMN public.eudr_plot_claims.hold_risk IS
  'none | documentary | border_hold. border_hold is the state this table exists to surface — see table '
  'comment. Independent of validation_state as a stored column (both are written by the same classifier '
  'run, but hold_risk is never recomputed from validation_state at read time, matching spec 09 §2.1''s '
  '"materialise it" rule for anything a customer could be asked to defend).';

CREATE INDEX IF NOT EXISTS eudr_plot_claims_consignment_idx ON public.eudr_plot_claims (consignment_ref);
CREATE INDEX IF NOT EXISTS eudr_plot_claims_hold_risk_idx ON public.eudr_plot_claims (hold_risk) WHERE hold_risk <> 'none';

-- ── custody_chains (spec §1.8, book-and-claim custody) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custody_chains (
  custody_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_type     text NOT NULL CHECK (credit_type IN ('saf_bnc','green_methanol','biodiesel_bnc','ets_allowance')),
  scheme          text NOT NULL CHECK (length(scheme) > 0),   -- ISCC PLUS, RSB, SFC
  certificate_ref text NOT NULL CHECK (length(certificate_ref) > 0),
  retired_at      date,
  retirement_registry text,
  double_count_check  text NOT NULL CHECK (double_count_check IN
    ('unverified','single_claim_confirmed','conflict_detected')),
  claimant_id     text REFERENCES public.entities(entity_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- A retired certificate names the registry that recorded the retirement, or it is not a verifiable
  -- retirement (same "materialise the evidence" discipline as eudr_plot_claims.hold_risk above).
  CONSTRAINT custody_chains_retirement_needs_registry CHECK ((retired_at IS NULL) = (retirement_registry IS NULL))
);

COMMENT ON TABLE public.custody_chains IS
  'Spec 09 §1.8: book-and-claim custody for SAF/green-methanol/biodiesel/ETS credits. '
  'double_count_check=''conflict_detected'' is a LIABILITY, not a data-quality flag (spec text): "two '
  'parties claiming one SAF batch is a compliance exposure for both". src/lib/spec09/eudr-custody.mjs '
  'classifies this alongside hold_risk from the sibling table, in the same liability-vs-data-quality '
  'distinction, for one shared renderer to apply consistently.';
COMMENT ON COLUMN public.custody_chains.claimant_id IS
  'entities(entity_id), kind expected = organisation. Not DB-enforced — see migration 296''s header note. '
  'Nullable: a certificate can be on file before a claimant is attached to it.';
COMMENT ON COLUMN public.custody_chains.double_count_check IS
  'unverified | single_claim_confirmed | conflict_detected. This is NOT the origin_class/derivation '
  'envelope vocabulary (a different question: whether a real-world double-claim exists, not how reliable '
  'this row''s own data is) — spec text''s own closed three-value list, transcribed verbatim.';

CREATE INDEX IF NOT EXISTS custody_chains_claimant_idx ON public.custody_chains (claimant_id) WHERE claimant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS custody_chains_conflict_idx ON public.custody_chains (double_count_check) WHERE double_count_check = 'conflict_detected';

-- ── RLS — SELECT-only to authenticated, no write policy (see migration 296's header) ────────────────────
ALTER TABLE public.eudr_plot_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custody_chains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eudr_plot_claims_read ON public.eudr_plot_claims;
CREATE POLICY eudr_plot_claims_read ON public.eudr_plot_claims FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS custody_chains_read ON public.custody_chains;
CREATE POLICY custody_chains_read ON public.custody_chains FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.eudr_plot_claims, public.custody_chains TO authenticated;

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols int;
  n_rows int;
  rejected boolean;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema='public' AND table_name='eudr_plot_claims';
  IF n_cols <> 8 THEN RAISE EXCEPTION 'ABORT: eudr_plot_claims has % columns, expected 8', n_cols; END IF;

  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema='public' AND table_name='custody_chains';
  IF n_cols <> 9 THEN RAISE EXCEPTION 'ABORT: custody_chains has % columns, expected 9', n_cols; END IF;

  -- Adversarial proof — custody_chains must REFUSE a retirement date with no retirement registry named
  -- (an unverifiable retirement claim, exactly the double-counting surface area this table exists to close).
  BEGIN
    INSERT INTO public.custody_chains (credit_type, scheme, certificate_ref, retired_at, double_count_check)
      VALUES ('saf_bnc', 'ISCC PLUS', 'selftest-cert-1', '2026-01-01', 'unverified');
    rejected := false;
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'ABORT: custody_chains accepted retired_at with no retirement_registry';
  END IF;

  SELECT count(*) INTO n_rows FROM public.eudr_plot_claims; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: eudr_plot_claims not empty'; END IF;
  SELECT count(*) INTO n_rows FROM public.custody_chains; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: custody_chains not empty'; END IF;

  RAISE NOTICE 'migration 298 OK: 2 tables created (eudr_plot_claims, custody_chains), adversarial CHECK proven live, RLS on, 0 rows';
END $$;
