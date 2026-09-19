-- subject: Migration 227 (Gate B derived-date mechanism, 2026-07-27). Adds `claim_kind='DERIVED'` to the section_claim_provenance CHECK + a self-FK `basis_claim_id` (→ the FACT claim a derived instance is computed from, ON DELETE SET NULL) + a fail-closed CHECK `scp_derived_requires_basis` (every DERIVED row MUST carry a basis). Backs the Gate-A scanner's SECOND coverage arm (`gate-a-derived.derivedCoveredTokens`, a pure DB lookup): a derived date (e.g. "1 June 2027" from an annual June-1 rule) is credited ONLY while its basis FACT exists AND that FACT's span still verbatim-matches its stored capture — staleness/deletion reverts the token to orphan on re-scan (derived-basis rule; re-grounds never destroy). No prose-pattern exemption anywhere in the scanner (stays literal). GATE_A_VERSION .2→2026-07-27.1. **APPLIED 2026-07-27** via apply_migration before the consumer (scanBrief derivedCovered arm + canonical-pipeline scan-site) committed; unit red/green 6/6; proven on one Operations item (e5c17fac "2027", orphan_count 5→4). Reversible (drop the 2 constraints + the column). [glyph:verbatim]
-- 227 — Gate B derived-date mechanism (operator ruling 2026-07-27): explicit DERIVED claims.
-- A derived date (e.g. "1 June 2027" computed from an annual June-1 rule) is credited by an explicit
-- section_claim_provenance row: claim_kind='DERIVED', the exact token in claim_text, its section, and a
-- basis_claim_id FK to the FACT claim (the recurring rule) that is itself verbatim-grounded. The Gate-A
-- scanner's second coverage arm (gate-a-derived.derivedCoveredTokens, a PURE DB lookup — no prose-pattern
-- judgment) credits the DERIVED token ONLY while its basis FACT exists AND that FACT's span still verbatim-
-- matches its stored capture. A DERIVED row with no basis is forbidden (the derived-basis rule: a labeled
-- inference with no grounded basis is an orphan). ON DELETE SET NULL so a deleted basis drops the FK →
-- the DERIVED loses coverage on re-scan (staleness reverts to orphan; re-grounds never destroy).
-- APPLIED 2026-07-27 via apply_migration before the consumer code (scanBrief derivedCovered arm + pipeline
-- scan-site) committed. Reversible (drop the two constraints + the column).

ALTER TABLE public.section_claim_provenance
  ADD COLUMN IF NOT EXISTS basis_claim_id uuid REFERENCES public.section_claim_provenance(id) ON DELETE SET NULL;

ALTER TABLE public.section_claim_provenance
  DROP CONSTRAINT IF EXISTS section_claim_provenance_claim_kind_check;
ALTER TABLE public.section_claim_provenance
  ADD CONSTRAINT section_claim_provenance_claim_kind_check
  CHECK (claim_kind = ANY (ARRAY['FACT'::text, 'ANALYSIS'::text, 'LEGAL'::text, 'GAP'::text, 'DERIVED'::text]));

ALTER TABLE public.section_claim_provenance
  DROP CONSTRAINT IF EXISTS scp_derived_requires_basis;
ALTER TABLE public.section_claim_provenance
  ADD CONSTRAINT scp_derived_requires_basis
  CHECK (claim_kind <> 'DERIVED' OR basis_claim_id IS NOT NULL);

COMMENT ON COLUMN public.section_claim_provenance.basis_claim_id IS
  'Gate B (mig 227): for a claim_kind=DERIVED row, the FK to the FACT claim (recurring rule) this derived instance is computed from. The Gate-A scanner credits the DERIVED token ONLY while this basis FACT exists and its span still verbatim-matches its stored capture (staleness reverts the derived token to orphan).';
