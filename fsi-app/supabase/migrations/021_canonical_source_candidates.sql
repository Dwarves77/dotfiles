-- ════════════════════════════════════════════════════════════════════
-- Migration 021 — canonical_source_candidates
--
-- Stores canonical-source-discovery candidates for intelligence_items
-- whose current source coverage is stale, missing, or thin. Discovery
-- pipeline (Task 4 of pre-B.2):
--   1. Classifier walks intelligence_items, flags rows by issue
--   2. Discovery agent (Claude with web_search) proposes 1-3 candidates
--      per flagged row
--   3. Verifier fetches candidate URLs and confirms title/content match
--   4. Rows land here for human review
--   5. Reviewer approves/rejects via admin UI (separate follow-up
--      commit) — approval flow updates intelligence_items.source_id and
--      creates a sources row if the candidate isn't already in the
--      registry
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS canonical_source_candidates (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id     UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  current_source_id        UUID REFERENCES sources(id) ON DELETE SET NULL,
  current_source_url       TEXT,
  issue_classification     TEXT NOT NULL CHECK (issue_classification IN
    ('stale_url', 'missing_link', 'missing_source', 'thin_match')),
  candidate_url            TEXT NOT NULL,
  candidate_title          TEXT,
  candidate_publisher      TEXT,
  confidence               TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  rationale                TEXT,
  verified                 BOOLEAN NOT NULL DEFAULT false,
  verified_status_code     INT,
  verified_content_excerpt TEXT,
  reviewed                 BOOLEAN NOT NULL DEFAULT false,
  decision                 TEXT NOT NULL DEFAULT 'pending'
                             CHECK (decision IN ('pending', 'approved', 'rejected', 'deferred')),
  reviewer_id              UUID,
  reviewed_at              TIMESTAMPTZ,
  reviewer_notes           TEXT,
  promoted_to_source_id    UUID REFERENCES sources(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canonical_candidates_item
  ON canonical_source_candidates(intelligence_item_id);
CREATE INDEX IF NOT EXISTS idx_canonical_candidates_pending
  ON canonical_source_candidates(decision) WHERE decision = 'pending';
CREATE INDEX IF NOT EXISTS idx_canonical_candidates_classification
  ON canonical_source_candidates(issue_classification);

COMMENT ON TABLE canonical_source_candidates IS
  'Canonical-source discovery candidates pending human review. Each row is one proposed URL for one intelligence_item. An item can have multiple candidates (typically 1-3 from a single discovery run). Approval flow: set decision=approved and promoted_to_source_id; downstream code updates intelligence_items.source_id and (if needed) inserts a new sources row.';

COMMENT ON COLUMN canonical_source_candidates.issue_classification IS
  'Why this item needed discovery. stale_url: source_id present but URL returns 4xx/5xx. missing_link: no source_id but item topic implies a known authoritative source should exist. missing_source: no source_id and no obvious canonical source in the registry. thin_match: source_id present, URL works, but content is institutional homepage rather than item-specific (e.g., regulator landing page instead of the regulation page).';

COMMENT ON COLUMN canonical_source_candidates.confidence IS
  'Discovery agent self-rated confidence. high = exact-name match against authoritative publisher. medium = strong topic match against likely-authoritative publisher. low = best guess; reviewer should verify carefully.';
