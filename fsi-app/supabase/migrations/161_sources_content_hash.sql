-- Migration 161: sources content-change fingerprint columns (P2-6 / chrome-audit S1-10).
--
-- check-sources wrote `change_detected: false` HARDCODED — zero change rows ever; "source
-- monitoring" was accessibility-only. The worker now fingerprints the SAME Browserless render the
-- accessibility check already pays for (zero extra units) and compares against the last observed
-- fingerprint. These two columns are that state:
--   last_content_hash        sha256 hex of the last successful render's normalized text
--                            (NULL until first fingerprintable render; thin/error captures
--                            never overwrite it)
--   last_content_changed_at  stamped when a fingerprint differs from the prior one — the
--                            queryable "this source changed" signal for the loop-flip wave
--
-- Purely additive, nullable, no backfill (first post-apply scrape day seeds hashes; changes
-- detect from the second). Consumer: check-sources worker (same PR) + content-change.mjs pure
-- fingerprint. Downstream auto-action on change is deliberately NOT wired here — that rides the
-- loop flip (operator's word).
--
-- APPLY: delegated; schema DDL applies BEFORE the dependent code merges per the two-track policy.
-- Ledger row 161 recorded same transaction. Reversible (DROP COLUMN x2).

BEGIN;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS last_content_hash text,
  ADD COLUMN IF NOT EXISTS last_content_changed_at timestamptz;

COMMENT ON COLUMN public.sources.last_content_hash IS
  'P2-6 change detection: sha256 of the last successful render''s normalized text (content-change.mjs). Thin/error captures never overwrite it.';
COMMENT ON COLUMN public.sources.last_content_changed_at IS
  'P2-6 change detection: stamped when a render''s fingerprint differs from the prior last_content_hash.';

COMMIT;
