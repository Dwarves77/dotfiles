-- ══════════════════════════════════════════════════════════════
-- Migration 004: Source Trust Framework
-- ══════════════════════════════════════════════════════════════
--
-- This migration transforms the data architecture from a flat
-- regulation catalogue into a two-layer source monitoring system.
--
-- LAYER 1: sources — portals where legislation lives (EUR-Lex,
--          Federal Register, IMO.org, etc.)
-- LAYER 2: intelligence_items — specific regulations, standards,
--          and findings that live INSIDE sources
--
-- The system monitors sources. Sources produce intelligence items.
-- A source is NOT a regulation. A regulation is NOT a source.
-- ══════════════════════════════════════════════════════════════

-- ── Drop old bare-bones source_registry (replaced by sources) ──
DROP TABLE IF EXISTS source_registry CASCADE;


-- ══════════════════════════════════════════════════════════════
-- TABLE: sources
-- The source registry. Every entry is a portal or official
-- publication maintained by a government, IGO, or authoritative
-- body where legislation is published.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE sources (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name                     TEXT NOT NULL,
  url                      TEXT NOT NULL,
  description              TEXT NOT NULL DEFAULT '',

  -- Classification
  tier                     INT NOT NULL CHECK (tier BETWEEN 1 AND 7),
  tier_at_creation         INT NOT NULL CHECK (tier_at_creation BETWEEN 1 AND 7),
  intelligence_types       TEXT[] NOT NULL DEFAULT '{}',
  domains                  INT[] NOT NULL DEFAULT '{}',
  jurisdictions            TEXT[] NOT NULL DEFAULT '{}',
  transport_modes          TEXT[] NOT NULL DEFAULT '{}',

  -- Monitoring
  update_frequency         TEXT NOT NULL DEFAULT 'weekly',
  last_checked             TIMESTAMPTZ,
  last_substantive_change  TIMESTAMPTZ,
  next_scheduled_check     TIMESTAMPTZ,
  status                   TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'stale', 'inaccessible', 'provisional', 'suspended')),

  -- Access
  paywalled                BOOLEAN NOT NULL DEFAULT FALSE,
  access_method            TEXT NOT NULL DEFAULT 'manual'
    CHECK (access_method IN ('api', 'rss', 'scrape', 'gazette', 'manual')),
  api_endpoint             TEXT,
  rss_feed_url             TEXT,

  -- Trust metrics (denormalized for query performance)
  -- These are updated by the trust engine whenever a trust event occurs
  confirmation_count       INT NOT NULL DEFAULT 0,
  conflict_count           INT NOT NULL DEFAULT 0,
  conflict_total           INT NOT NULL DEFAULT 0,
  accuracy_rate            NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
  avg_lead_time_days       NUMERIC(8,2) NOT NULL DEFAULT 0.00,
  lead_time_samples        INT NOT NULL DEFAULT 0,
  consecutive_accessible   INT NOT NULL DEFAULT 0,
  total_checks             INT NOT NULL DEFAULT 0,
  successful_checks        INT NOT NULL DEFAULT 0,
  accessibility_rate       NUMERIC(5,4) NOT NULL DEFAULT 1.0000,
  last_accessible          TIMESTAMPTZ,
  last_inaccessible        TIMESTAMPTZ,
  independent_citers       INT NOT NULL DEFAULT 0,
  total_citations          INT NOT NULL DEFAULT 0,
  highest_citing_tier      INT CHECK (highest_citing_tier IS NULL OR highest_citing_tier BETWEEN 1 AND 7),
  self_citation_count      INT NOT NULL DEFAULT 0,

  -- Trust score (computed, cached)
  trust_score_overall      INT NOT NULL DEFAULT 50,
  trust_score_accuracy     NUMERIC(5,1) NOT NULL DEFAULT 20.0,
  trust_score_timeliness   NUMERIC(5,1) NOT NULL DEFAULT 10.0,
  trust_score_reliability  NUMERIC(5,1) NOT NULL DEFAULT 10.0,
  trust_score_citation     NUMERIC(5,1) NOT NULL DEFAULT 10.0,
  trust_score_computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Tier history (JSONB array of tier change records)
  tier_history             JSONB NOT NULL DEFAULT '[]',

  -- Provenance
  cited_by                 TEXT,
  notes                    TEXT NOT NULL DEFAULT '',

  -- Timestamps
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sources indexes ──
CREATE INDEX idx_sources_status ON sources(status);
CREATE INDEX idx_sources_tier ON sources(tier);
CREATE INDEX idx_sources_trust_score ON sources(trust_score_overall);
CREATE INDEX idx_sources_next_check ON sources(next_scheduled_check)
  WHERE status IN ('active', 'stale');
CREATE INDEX idx_sources_domains ON sources USING GIN(domains);
CREATE INDEX idx_sources_jurisdictions ON sources USING GIN(jurisdictions);
CREATE INDEX idx_sources_transport ON sources USING GIN(transport_modes);


-- ══════════════════════════════════════════════════════════════
-- TABLE: intelligence_items
-- Every piece of legislation, regulation, standard, technology
-- finding, market signal, or research output that lives inside
-- a source. Replaces the flat resources table as the primary
-- data entity for new domain-expanded content.
--
-- The existing resources table is PRESERVED for backward
-- compatibility during migration. New items go here.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE intelligence_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id                TEXT UNIQUE,

  -- Content
  title                    TEXT NOT NULL,
  summary                  TEXT NOT NULL DEFAULT '',
  what_is_it               TEXT NOT NULL DEFAULT '',
  why_matters              TEXT NOT NULL DEFAULT '',
  key_data                 TEXT[] NOT NULL DEFAULT '{}',
  operational_impact       TEXT NOT NULL DEFAULT '',
  open_questions           TEXT[] NOT NULL DEFAULT '{}',
  tags                     TEXT[] NOT NULL DEFAULT '{}',

  -- Classification
  domain                   INT NOT NULL CHECK (domain BETWEEN 1 AND 7),
  category                 TEXT,
  item_type                TEXT NOT NULL DEFAULT 'regulation'
    CHECK (item_type IN (
      'regulation', 'directive', 'standard', 'guidance',
      'technology', 'market_signal', 'regional_data',
      'research_finding', 'innovation', 'framework', 'tool',
      'initiative'
    )),

  -- Source linkage — THE critical relationship
  source_id                UUID REFERENCES sources(id) ON DELETE SET NULL,
  source_url               TEXT NOT NULL DEFAULT '',

  -- Dimensions
  jurisdictions            TEXT[] NOT NULL DEFAULT '{}',
  transport_modes          TEXT[] NOT NULL DEFAULT '{}',
  verticals                TEXT[] NOT NULL DEFAULT '{}',

  -- Status and severity
  status                   TEXT NOT NULL DEFAULT 'monitoring'
    CHECK (status IN (
      'proposed', 'adopted', 'in_force', 'monitoring',
      'superseded', 'repealed', 'expired'
    )),
  severity                 TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  confidence               TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (confidence IN ('confirmed', 'unconfirmed')),
  priority                 TEXT NOT NULL DEFAULT 'MODERATE'
    CHECK (priority IN ('CRITICAL', 'HIGH', 'MODERATE', 'LOW')),
  reasoning                TEXT NOT NULL DEFAULT '',

  -- Dates
  entry_into_force         DATE,
  compliance_deadline      DATE,
  next_review_date         DATE,
  added_date               DATE NOT NULL DEFAULT CURRENT_DATE,
  last_verified            TIMESTAMPTZ,

  -- Archive
  is_archived              BOOLEAN NOT NULL DEFAULT FALSE,
  archive_reason           TEXT,
  archive_note             TEXT,
  archived_date            DATE,
  replaced_by              UUID REFERENCES intelligence_items(id),

  -- Version history
  version_history          JSONB NOT NULL DEFAULT '[]',

  -- Timestamps
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Intelligence items indexes ──
CREATE INDEX idx_items_domain ON intelligence_items(domain);
CREATE INDEX idx_items_source ON intelligence_items(source_id);
CREATE INDEX idx_items_status ON intelligence_items(status);
CREATE INDEX idx_items_severity ON intelligence_items(severity);
CREATE INDEX idx_items_priority ON intelligence_items(priority);
CREATE INDEX idx_items_legacy ON intelligence_items(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX idx_items_jurisdictions ON intelligence_items USING GIN(jurisdictions);
CREATE INDEX idx_items_transport ON intelligence_items USING GIN(transport_modes);
CREATE INDEX idx_items_verticals ON intelligence_items USING GIN(verticals);
CREATE INDEX idx_items_tags ON intelligence_items USING GIN(tags);
CREATE INDEX idx_items_archived ON intelligence_items(is_archived) WHERE is_archived = TRUE;


-- ══════════════════════════════════════════════════════════════
-- TABLE: item_timelines
-- Milestone events for intelligence items (replaces timelines
-- for new items; old timelines table preserved for legacy)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE item_timelines (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                  UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  milestone_date           DATE NOT NULL,
  label                    TEXT NOT NULL,
  is_completed             BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order               INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_item_timelines_item ON item_timelines(item_id);
CREATE INDEX idx_item_timelines_date ON item_timelines(milestone_date);


-- ══════════════════════════════════════════════════════════════
-- TABLE: item_changelog
-- What changed and when for intelligence items
-- ══════════════════════════════════════════════════════════════

CREATE TABLE item_changelog (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                  UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  change_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  change_type              TEXT NOT NULL DEFAULT 'UPDATED'
    CHECK (change_type IN ('NEW', 'UPDATED', 'STATUS_CHANGE', 'SEVERITY_CHANGE', 'ARCHIVED')),
  field                    TEXT NOT NULL,
  previous_value           TEXT NOT NULL DEFAULT '',
  new_value                TEXT NOT NULL DEFAULT '',
  impact                   TEXT,
  impact_level             TEXT DEFAULT 'MODERATE'
    CHECK (impact_level IN ('CRITICAL', 'HIGH', 'MODERATE', 'LOW')),
  detected_by              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_item_changelog_item ON item_changelog(item_id);
CREATE INDEX idx_item_changelog_date ON item_changelog(change_date);


-- ══════════════════════════════════════════════════════════════
-- TABLE: item_disputes
-- When sources conflict about an intelligence item
-- ══════════════════════════════════════════════════════════════

CREATE TABLE item_disputes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                  UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  note                     TEXT NOT NULL,
  disputing_sources        JSONB NOT NULL DEFAULT '[]',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at              TIMESTAMPTZ
);

CREATE INDEX idx_item_disputes_item ON item_disputes(item_id);
CREATE INDEX idx_item_disputes_active ON item_disputes(is_active) WHERE is_active = TRUE;


-- ══════════════════════════════════════════════════════════════
-- TABLE: item_cross_references
-- Bidirectional links between intelligence items
-- ══════════════════════════════════════════════════════════════

CREATE TABLE item_cross_references (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id           UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  target_item_id           UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  relationship             TEXT NOT NULL DEFAULT 'related'
    CHECK (relationship IN ('related', 'supersedes', 'implements', 'conflicts', 'amends', 'depends_on')),
  UNIQUE(source_item_id, target_item_id)
);

CREATE INDEX idx_item_xref_source ON item_cross_references(source_item_id);
CREATE INDEX idx_item_xref_target ON item_cross_references(target_item_id);


-- ══════════════════════════════════════════════════════════════
-- TABLE: item_supersessions
-- When one regulation replaces another
-- ══════════════════════════════════════════════════════════════

CREATE TABLE item_supersessions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_item_id              UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  new_item_id              UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  supersession_date        DATE NOT NULL,
  severity                 TEXT NOT NULL CHECK (severity IN ('major', 'minor', 'replacement')),
  note                     TEXT NOT NULL DEFAULT '',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ══════════════════════════════════════════════════════════════
-- TABLE: source_trust_events
-- Immutable audit trail of every action that affects a source's
-- trust. This is the forensic record.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE source_trust_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  event_type               TEXT NOT NULL
    CHECK (event_type IN (
      'confirmation', 'conflict_opened', 'conflict_resolved',
      'accessibility_check', 'citation_received',
      'tier_promotion', 'tier_demotion',
      'manual_review', 'stale_flag', 'paywall_change',
      'self_citation', 'discovery'
    )),
  details                  JSONB NOT NULL DEFAULT '{}',
  created_by               TEXT NOT NULL DEFAULT 'system'
    CHECK (created_by IN ('system', 'worker', 'human')),
  reviewer_id              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable: no UPDATE or DELETE via RLS (enforced in 005_rls.sql)
CREATE INDEX idx_trust_events_source ON source_trust_events(source_id);
CREATE INDEX idx_trust_events_type ON source_trust_events(event_type);
CREATE INDEX idx_trust_events_date ON source_trust_events(created_at);
-- For querying recent events by source
CREATE INDEX idx_trust_events_source_date ON source_trust_events(source_id, created_at DESC);


-- ══════════════════════════════════════════════════════════════
-- TABLE: source_conflicts
-- When two sources disagree on the same fact about the same
-- intelligence item. This is the primary mechanism by which
-- trust is gained or lost.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE source_conflicts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                  UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  source_a_id              UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  source_b_id              UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  source_a_tier            INT NOT NULL,
  source_b_tier            INT NOT NULL,
  source_a_claim           TEXT NOT NULL,
  source_b_claim           TEXT NOT NULL,
  field_in_dispute         TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'inconclusive')),
  resolution               TEXT
    CHECK (resolution IS NULL OR resolution IN (
      'source_a_correct', 'source_b_correct',
      'both_partially_correct', 'inconclusive', 'superseded'
    )),
  resolution_note          TEXT,
  resolved_by_source_id    UUID REFERENCES sources(id),
  resolved_by_human        TEXT,
  opened_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at              TIMESTAMPTZ
);

CREATE INDEX idx_conflicts_item ON source_conflicts(item_id);
CREATE INDEX idx_conflicts_source_a ON source_conflicts(source_a_id);
CREATE INDEX idx_conflicts_source_b ON source_conflicts(source_b_id);
CREATE INDEX idx_conflicts_status ON source_conflicts(status) WHERE status = 'open';


-- ══════════════════════════════════════════════════════════════
-- TABLE: source_citations
-- Tracks which sources cite which other sources. Used to
-- compute independent_citers and citation depth.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE source_citations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citing_source_id         UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  cited_source_id          UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  context                  TEXT NOT NULL DEFAULT '',
  detected_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(citing_source_id, cited_source_id)
);

CREATE INDEX idx_citations_citing ON source_citations(citing_source_id);
CREATE INDEX idx_citations_cited ON source_citations(cited_source_id);


-- ══════════════════════════════════════════════════════════════
-- TABLE: monitoring_queue
-- Scheduled source checks. The worker reads this to know what
-- to scan next.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE monitoring_queue (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  item_id                  UUID REFERENCES intelligence_items(id) ON DELETE SET NULL,
  scheduled_check          TIMESTAMPTZ NOT NULL,
  priority                 TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  last_result              TEXT
    CHECK (last_result IS NULL OR last_result IN (
      'no_change', 'updated', 'new_item', 'error', 'inaccessible'
    )),
  change_detected          BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at               TIMESTAMPTZ,
  error_message            TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mq_scheduled ON monitoring_queue(scheduled_check)
  WHERE checked_at IS NULL;
CREATE INDEX idx_mq_source ON monitoring_queue(source_id);
CREATE INDEX idx_mq_priority ON monitoring_queue(priority, scheduled_check);


-- ══════════════════════════════════════════════════════════════
-- TABLE: provisional_sources
-- Sources discovered through citation that haven't been
-- reviewed yet. All new source discoveries enter here.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE provisional_sources (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  url                      TEXT NOT NULL,
  description              TEXT NOT NULL DEFAULT '',
  domain                   INT CHECK (domain IS NULL OR domain BETWEEN 1 AND 7),

  -- Discovery chain
  discovered_via           TEXT NOT NULL DEFAULT 'citation_detection'
    CHECK (discovered_via IN ('skill_recommendation', 'citation_detection', 'worker_search', 'manual_add')),
  cited_by_source_id       UUID REFERENCES sources(id),
  cited_by_source_tier     INT,

  -- Citation accumulation
  citation_count           INT NOT NULL DEFAULT 1,
  independent_citers       INT NOT NULL DEFAULT 0,
  citing_source_ids        UUID[] NOT NULL DEFAULT '{}',
  highest_citing_tier      INT CHECK (highest_citing_tier IS NULL OR highest_citing_tier BETWEEN 1 AND 7),

  -- Assessment
  provisional_tier         INT NOT NULL DEFAULT 7 CHECK (provisional_tier BETWEEN 1 AND 7),
  recommended_tier         INT CHECK (recommended_tier IS NULL OR recommended_tier BETWEEN 1 AND 7),
  accessibility_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  publishes_structured_content BOOLEAN NOT NULL DEFAULT FALSE,
  entity_identified        BOOLEAN NOT NULL DEFAULT FALSE,

  -- Review
  status                   TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'confirmed', 'rejected', 'needs_more_data')),
  reviewer_notes           TEXT NOT NULL DEFAULT '',

  -- If confirmed, the source_id it was promoted to
  promoted_to_source_id    UUID REFERENCES sources(id),

  -- Timestamps
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at              TIMESTAMPTZ,

  -- Prevent duplicate discoveries
  UNIQUE(url)
);

CREATE INDEX idx_provisional_status ON provisional_sources(status);
CREATE INDEX idx_provisional_cited_by ON provisional_sources(cited_by_source_id);


-- ══════════════════════════════════════════════════════════════
-- TABLE: staged_updates (enhanced from 001)
-- Worker-proposed changes that require human approval.
-- Now linked to intelligence_items and sources.
-- ══════════════════════════════════════════════════════════════

-- Drop old staged_updates and recreate with proper FKs
DROP TABLE IF EXISTS staged_updates CASCADE;

CREATE TABLE staged_updates (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                  UUID REFERENCES intelligence_items(id),
  source_id                UUID REFERENCES sources(id),
  update_type              TEXT NOT NULL
    CHECK (update_type IN (
      'new_item', 'update_item', 'status_change',
      'new_source', 'source_conflict', 'archive_item'
    )),
  proposed_changes         JSONB NOT NULL DEFAULT '{}',
  reason                   TEXT NOT NULL DEFAULT '',
  source_url               TEXT,
  confidence               TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  status                   TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by              TEXT,
  reviewed_at              TIMESTAMPTZ,
  batch_id                 TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staged_status ON staged_updates(status) WHERE status = 'pending';
CREATE INDEX idx_staged_source ON staged_updates(source_id);
CREATE INDEX idx_staged_item ON staged_updates(item_id);


-- ══════════════════════════════════════════════════════════════
-- TABLE: briefings (enhanced)
-- Weekly briefing storage with source linkage
-- ══════════════════════════════════════════════════════════════

-- Preserve existing briefings table; add columns if needed
ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS source_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS domains_covered INT[] DEFAULT '{}';


-- ══════════════════════════════════════════════════════════════
-- FUNCTIONS: Auto-update timestamps
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sources_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER intelligence_items_updated_at
  BEFORE UPDATE ON intelligence_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ══════════════════════════════════════════════════════════════
-- FUNCTION: Recompute accuracy_rate when trust metrics change
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recompute_source_accuracy()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.confirmation_count + NEW.conflict_count > 0 THEN
    NEW.accuracy_rate = NEW.confirmation_count::NUMERIC
      / (NEW.confirmation_count + NEW.conflict_count)::NUMERIC;
  ELSE
    NEW.accuracy_rate = 0.5000;
  END IF;

  IF NEW.total_checks > 0 THEN
    NEW.accessibility_rate = NEW.successful_checks::NUMERIC
      / NEW.total_checks::NUMERIC;
  ELSE
    NEW.accessibility_rate = 1.0000;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sources_recompute_accuracy
  BEFORE UPDATE OF confirmation_count, conflict_count, successful_checks, total_checks
  ON sources
  FOR EACH ROW EXECUTE FUNCTION recompute_source_accuracy();


-- ══════════════════════════════════════════════════════════════
-- VIEWS: Source health at a glance
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW source_health_summary AS
SELECT
  s.tier,
  s.status,
  COUNT(*) AS source_count,
  AVG(s.trust_score_overall) AS avg_trust_score,
  SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) AS active_count,
  SUM(CASE WHEN s.status = 'stale' THEN 1 ELSE 0 END) AS stale_count,
  SUM(CASE WHEN s.status = 'inaccessible' THEN 1 ELSE 0 END) AS inaccessible_count,
  SUM(CASE WHEN s.next_scheduled_check < NOW() THEN 1 ELSE 0 END) AS overdue_count
FROM sources s
GROUP BY s.tier, s.status
ORDER BY s.tier, s.status;

CREATE OR REPLACE VIEW open_conflicts AS
SELECT
  c.*,
  sa.name AS source_a_name,
  sb.name AS source_b_name,
  i.title AS item_title
FROM source_conflicts c
JOIN sources sa ON c.source_a_id = sa.id
JOIN sources sb ON c.source_b_id = sb.id
JOIN intelligence_items i ON c.item_id = i.id
WHERE c.status = 'open'
ORDER BY c.opened_at DESC;

CREATE OR REPLACE VIEW provisional_sources_review AS
SELECT
  ps.*,
  s.name AS cited_by_name,
  s.tier AS cited_by_tier_current
FROM provisional_sources ps
LEFT JOIN sources s ON ps.cited_by_source_id = s.id
WHERE ps.status IN ('pending_review', 'needs_more_data')
ORDER BY ps.independent_citers DESC, ps.citation_count DESC;


-- ══════════════════════════════════════════════════════════════
-- COMMENTS: Document the architecture for future developers
-- ══════════════════════════════════════════════════════════════

COMMENT ON TABLE sources IS 'Layer 1: Public portals where legislation is published. EUR-Lex, Federal Register, IMO.org. The system monitors SOURCES, not individual regulations.';
COMMENT ON TABLE intelligence_items IS 'Layer 2: Specific regulations, standards, findings that live INSIDE sources. Linked to their source via source_id.';
COMMENT ON TABLE source_trust_events IS 'Immutable audit trail of every action affecting source trust. Insert-only — no updates or deletes.';
COMMENT ON TABLE source_conflicts IS 'Factual disagreements between sources about the same intelligence item. Resolution determines trust gain/loss.';
COMMENT ON TABLE source_citations IS 'Which sources cite which other sources. Drives independent_citers metric and trust scoring.';
COMMENT ON TABLE provisional_sources IS 'Sources discovered via citation that await human review before entering the active registry.';
COMMENT ON TABLE monitoring_queue IS 'Scheduled source scans. Worker reads this to know what to check next.';
COMMENT ON COLUMN sources.tier IS 'Trust tier 1-7. T1=official legal text, T2=regulator guidance, T3=IGO, T4=expert analysis, T5=industry, T6=news, T7=provisional.';
COMMENT ON COLUMN sources.trust_score_overall IS 'Composite trust score 0-100. Computed from accuracy (40%), timeliness (20%), reliability (20%), citation (20%).';
COMMENT ON COLUMN intelligence_items.source_id IS 'THE critical FK. Links this regulation/finding to the source portal it lives in. Every item must trace back to a source.';
COMMENT ON COLUMN intelligence_items.legacy_id IS 'Maps to old resources.id (e.g. "o1", "a3") for migration continuity. NULL for new items.';
