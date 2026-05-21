ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT,
  ADD COLUMN IF NOT EXISTS classification_rationale TEXT;

COMMENT ON COLUMN public.sources.classification_confidence IS
  'Classifier confidence per docs/source-classification-framework-2026-05-10.md. Enum-like: HIGH | MEDIUM | LOW | AMBIGUOUS. CHECK constraint deferred until value set stabilizes per migration 063 convention.';
COMMENT ON COLUMN public.sources.classification_rationale IS
  'Free-form classifier rationale per docs/source-classification-framework-2026-05-10.md. Capture the why behind source_role / scope / tier assignments for audit and debugging.';
