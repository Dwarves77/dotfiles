-- Migration 122 — institutions (source grouping/identity dimension)
--
-- Date: 2026-06-03
-- Workstream: Source-layer fix, defect (b) — institution identity.
--
-- Numbering: 122 is free (a prior 122 was reverted + unregistered this session).
--
-- WHY: same institution, different URLs (UNCTAD x3, the 58 entity clusters) cannot collapse
-- under the per-URL model, and `canonical_source_candidates.candidate_publisher` is free-text
-- scoring only (migration 021) — there is no institution identity. This adds it as a
-- first-class entity with an FK from sources.
--
-- DISCIPLINE THIS ENCODES:
--   * Institution is a GROUPING dimension, NOT a merge key. Tagging two sources to the same
--     institution NEVER merges them. EUR-Lex's distinct regulations stay distinct sources.
--   * Orthogonal to source_role + category. institution = WHO published; those = WHAT TYPE.
--     This migration does not touch source_role or category.
--   * Additive + reversible: a new table + a NULLABLE FK. No existing column/row semantics
--     change. Reverse = drop the FK column + the table.
--
-- registrable_domain is the SSOT grouping key (eTLD+1, e.g. unctad.org, imo.org, europa.eu);
-- name is a human label seeded from existing source names. The table is the identity, the
-- text is not.

CREATE TABLE IF NOT EXISTS public.institutions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  registrable_domain TEXT NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sources_institution ON public.sources(institution_id);

COMMENT ON TABLE public.institutions IS
  'Source grouping/identity dimension (migration 122): WHO published, keyed by registrable_domain (eTLD+1). A GROUPING tag, never a merge key — sources sharing an institution stay distinct sources. Orthogonal to source_role/category.';
COMMENT ON COLUMN public.sources.institution_id IS
  'FK to the publishing institution (migration 122). Grouping only; does NOT imply two sources are the same source. NULL until backfilled.';
