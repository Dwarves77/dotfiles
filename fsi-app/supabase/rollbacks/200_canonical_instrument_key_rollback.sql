-- Rollback for migration 200 (Wave-α Track C8) — canonical instrument key.
-- Drops the twin-defect guard index, the normalizing trigger, both functions, and the column.
-- Data note: the column is a derived normalization of instrument_identifier + source_url, so dropping it
-- loses nothing that cannot be re-derived; the backfill script (backfill-canonical-keys.mjs) reconstructs it.

BEGIN;

DROP INDEX IF EXISTS public.uq_intelligence_items_canonical_key_verified_live;

DROP TRIGGER IF EXISTS trg_set_canonical_instrument_key ON public.intelligence_items;
DROP FUNCTION IF EXISTS public.set_canonical_instrument_key();
DROP FUNCTION IF EXISTS public.derive_canonical_instrument_key(text, text);

ALTER TABLE public.intelligence_items
  DROP COLUMN IF EXISTS canonical_instrument_key;

COMMIT;
