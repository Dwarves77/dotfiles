-- 037_source_verification.sql
-- W2.F — auto-verification pipeline audit log.
--
-- The verification pipeline (see src/lib/sources/verification.ts) classifies
-- every discovered candidate URL into one of three tiers and acts on the
-- classification:
--   H — auto-approved → INSERT into sources (status='active', admin_only=false)
--   M — provisional   → INSERT into provisional_sources (status='pending_review')
--   L — rejected      → no source row written; row here is the only record
--
-- Every candidate writes one row regardless of action_taken. Tier L rows are
-- noise-suppressed in the human review surfaces but remain queryable here
-- for forensics and false-negative review.
--
-- This migration only adds the audit table. The action-taken inserts (into
-- sources / provisional_sources) are performed by the pipeline using the
-- existing schemas — no schema changes to those tables.

CREATE TABLE IF NOT EXISTS source_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_url TEXT NOT NULL,
  candidate_name TEXT NULL,

  -- Discovery context — jurisdictions the candidate was discovered for
  -- (passed by the discovery agent). May differ from the candidate's
  -- actual jurisdictional coverage, which is determined later.
  jurisdiction_iso TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Detected language. NULL if detection failed; the pipeline treats
  -- NULL as "non-English" for safety (downgrades to tier M).
  language TEXT NULL,

  -- Haiku-emitted scores. NULL when the model call failed and the row
  -- fell through to a non-AI rejection path (e.g. reachability failure).
  ai_relevance_score INT NULL CHECK (ai_relevance_score IS NULL OR (ai_relevance_score BETWEEN 0 AND 100)),
  ai_freight_score INT NULL CHECK (ai_freight_score IS NULL OR (ai_freight_score BETWEEN 0 AND 100)),
  ai_trust_tier TEXT NULL CHECK (ai_trust_tier IS NULL OR ai_trust_tier IN ('T1', 'T2', 'T3')),

  -- Final classification.
  verification_tier TEXT NOT NULL CHECK (verification_tier IN ('H', 'M', 'L')),
  action_taken TEXT NOT NULL CHECK (action_taken IN ('auto-approved', 'queued-provisional', 'rejected')),

  -- Free-text reason for rejected/queued rows. Examples: 'reachability',
  -- 'duplicate', 'ai_relevance_low', 'not_freight_relevant', 'domain_unknown',
  -- 'language_non_english'.
  rejection_reason TEXT NULL,

  -- Full step-by-step pipeline log. Captures every decision point so a
  -- spot-check reviewer can reconstruct why the row landed where it did.
  -- Schema is documented in verification.ts (VerificationLog).
  verification_log JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Back-references to the row created by action execution, if any.
  -- ON DELETE SET NULL so deleting a source/provisional doesn't cascade
  -- away the audit trail.
  resulting_source_id UUID NULL REFERENCES sources(id) ON DELETE SET NULL,
  resulting_provisional_id UUID NULL REFERENCES provisional_sources(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- URL lookup — used by idempotency check ("has this URL been verified
-- before?") and the spot-check forensics view.
CREATE INDEX IF NOT EXISTS idx_source_verifications_url
  ON source_verifications(candidate_url);

-- Tier filter — used by the recently-auto-approved viewer and the
-- false-positive review queue.
CREATE INDEX IF NOT EXISTS idx_source_verifications_tier
  ON source_verifications(verification_tier);

-- Recency — used by the recently-auto-approved viewer (last N days) and
-- the monthly random-sample audit job. DESC matches the "newest first"
-- query pattern.
CREATE INDEX IF NOT EXISTS idx_source_verifications_created
  ON source_verifications(created_at DESC);

-- Lookup by resulting source — used by the recently-auto-approved viewer
-- to attach verification metadata to each source row.
CREATE INDEX IF NOT EXISTS idx_source_verifications_resulting_source
  ON source_verifications(resulting_source_id)
  WHERE resulting_source_id IS NOT NULL;

COMMENT ON TABLE source_verifications IS
  'W2.F: Audit log for the auto-verification pipeline. Every discovered candidate writes one row regardless of action_taken (auto-approved / queued-provisional / rejected). Tier L rows are noise-suppressed in human review surfaces but remain queryable for forensics.';

COMMENT ON COLUMN source_verifications.verification_log IS
  'JSONB log of every pipeline step: { reachability: {status, finalUrl, attempts}, content: {fetched, length}, domain: {pattern, confidence}, duplicate: {match}, language: {detected}, ai: {raw, ...}, aggregation: {triggers, decision} }.';

-- ── RLS ──
-- Match the pattern used by source_trust_events (migration 004/005):
-- read-only for anon, service_role bypasses RLS for writes.
ALTER TABLE source_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "source_verifications_read"
  ON source_verifications FOR SELECT USING (true);
