-- 228 — Coverage-index identity verification (B1). The census_worklist would_mint rows are POINTERS to
-- primary instruments (a URL + often a structured identifier). The Coverage Index panel (mounted INSIDE the
-- existing five surfaces, primarily Regulations — NOT a sixth top-level surface, PI-1) surfaces them as a
-- DUAL-VERIFIED catalogue: axis 1 = RELEVANCE (already encoded in notes '[low-relevance]' tags — firm-core
-- vs soft-tail), axis 2 = IDENTITY (this migration). Identity-verified means the pointer is well-formed and
-- CONFIRMED to resolve to a real primary source on a REGISTERED host — it does NOT mean the instrument has a
-- grounded brief (that is provenance_status, a separate and stricter gate; the index never conflates them).
--
-- These columns are populated by the identity-resolve pass (scripts/coverage/identity-resolve.mjs): the
-- deterministic half (URL shape + identifier scheme/shape, src/lib/coverage/identity.mjs) plus a free-fetch
-- liveness probe. HONESTY of the http probe: identity_resolves is TRUE only on a confirmed 2xx/3xx; a
-- timeout / rate-limit / network error leaves identity_resolves NULL (could-not-confirm), NEVER false —
-- a false would fabricate a dead-link verdict out of our own throttling. Only a confirmed 4xx/5xx sets
-- identity_resolves=false. The surface reads confirmed-true as the identity axis; NULL falls to soft-tail.
--
-- Additive + nullable: no change to the append-only identity columns or the guarded enumeration_status
-- ladder. Re-runnable (the pass upserts these fields on re-check via identity_checked_at). APPLIED
-- 2026-07-27 via apply_migration before the consumer read path (getCoverageIndex) + the /coverage surface.
-- Reversible (drop the six columns). Consumer: getCoverageIndex(surface) + the CoverageIndexPanel mounted
-- on the Regulations/Operations/Market/Research surfaces.

BEGIN;

ALTER TABLE public.census_worklist
  ADD COLUMN IF NOT EXISTS identity_checked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS identity_http_status   integer,
  ADD COLUMN IF NOT EXISTS identity_resolves      boolean,
  ADD COLUMN IF NOT EXISTS identity_scheme        text
    CHECK (identity_scheme IS NULL OR identity_scheme IN ('celex', 'eli', 'uk-legislation', 'generic', 'none')),
  ADD COLUMN IF NOT EXISTS identity_shape_valid   boolean,
  ADD COLUMN IF NOT EXISTS identity_host_registered boolean;

COMMENT ON COLUMN public.census_worklist.identity_resolves IS
  'B1 identity axis: TRUE only on a confirmed 2xx/3xx from a free-fetch probe; FALSE only on a confirmed 4xx/5xx; NULL = could-not-confirm (timeout/rate-limit/network) — never fabricate a dead verdict from our own throttling. Identity-verified (index-prominent) requires identity_resolves=true AND identity_host_registered=true.';

COMMENT ON COLUMN public.census_worklist.identity_host_registered IS
  'B1 identity axis: the document_url host matches a registered sources row (the pointer lives on a source we monitor). Deterministic; set by the identity-resolve pass.';

-- Partial index for the Coverage Index read path (the dual-verified would_mint set, hot query).
CREATE INDEX IF NOT EXISTS idx_census_worklist_would_mint_identity
  ON public.census_worklist (dryrun_disposition, identity_resolves)
  WHERE dryrun_disposition = 'would_mint';

COMMIT;
