-- Migration 112: Source-provenance invariant — schema landing (Sprint 4 Block 1, task 1.1).
--
-- Implements design-doc section 4 STEPS 1-2 plus the new provenance tables
-- (section 3a). ADDITIVE ONLY:
--   - NEW enum provenance_status (incl. pending_human_verify)
--   - NEW columns intelligence_items.provenance_status (DEFAULT 'unverified')
--     and intelligence_items.provenance_verified_at
--   - NEW table agent_run_searches (with result_content_excerpt)
--   - NEW table section_claim_provenance
--   - NEW table item_type_required_slots
--
-- STRICTLY OUT OF SCOPE for this migration (per Block 1 hard fence +
-- design-doc section 3a [POST-RECONCILIATION] bullets + decision-log row 218):
--   - NO ALTER/DROP of any existing column/table/constraint
--   - NO NOT NULL / CHECK added to EXISTING columns
--     (intelligence_items.source_id stays nullable;
--      intelligence_item_sections.source_ids stays as-is)
--   - NO backfill / UPDATE of any existing intelligence_items or
--     intelligence_item_sections row data
--   - NO validate_item_provenance function (task 1.3, migration follows)
--   - NO set_provenance_status trigger (task 1.4)
--   - NO active_intelligence_items view (task 1.10)
--   - NO seed of item_type_required_slots (task 1.2)
--
-- Adding the brand-new provenance_status column with DEFAULT 'unverified'
-- populates the NEW column for existing rows with 'unverified'. This is the
-- design intent (section 4 step 1: "Default 'unverified' at insert"). It does
-- NOT change any pre-existing status field on those rows; no item is migrated
-- to 'verified' / 'pending_human_verify' / 'quarantined' here. Nothing flips.

BEGIN;

-- ── Enum: provenance_status ─────────────────────────────────────────
-- Four terminal/initial states per design-doc section 3a.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provenance_status') THEN
    CREATE TYPE provenance_status AS ENUM (
      'unverified',
      'verified',
      'pending_human_verify',
      'quarantined'
    );
  END IF;
END$$;

-- ── intelligence_items: new provenance columns (additive) ───────────
-- DEFAULT 'unverified' so future inserts initialize correctly; existing
-- rows receive the default for the NEW column only. No existing status
-- field is touched. No constraint enforcement (task 1.3/1.4).
ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS provenance_status provenance_status NOT NULL DEFAULT 'unverified';

ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS provenance_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN intelligence_items.provenance_status IS
  'Provenance invariant status (Sprint 4). Default unverified at insert; trigger (task 1.4) sets terminal status verified / pending_human_verify / quarantined on future writes. Block 1 task 1.1 only lands the column with default; no existing item status flips until Phase 2 reconciliation.';

COMMENT ON COLUMN intelligence_items.provenance_verified_at IS
  'Timestamp the item reached provenance_status = verified, populated by the trigger or by the admin verification queue (Component 6).';

-- ── Table: agent_run_searches (criterion 2 enabling table) ──────────
-- Persists each web_search call (query, result URL/title/index) plus a
-- cached content excerpt so Component 3 span-checks run without re-fetching.
-- agent_run_id is intentionally a bare uuid (no agent_runs FK dependency
-- in Block 1 task 1.1).
CREATE TABLE IF NOT EXISTS agent_run_searches (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id           UUID,
  intelligence_item_id   UUID REFERENCES intelligence_items(id) ON DELETE CASCADE,
  search_query           TEXT,
  result_url             TEXT,
  result_title           TEXT,
  result_index           INTEGER,
  result_content_excerpt TEXT,
  searched_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_run_searches_item_id
  ON agent_run_searches(intelligence_item_id);

CREATE INDEX IF NOT EXISTS idx_agent_run_searches_run_id
  ON agent_run_searches(agent_run_id);

COMMENT ON TABLE agent_run_searches IS
  'Per-run web_search log (Sprint 4 Addition A enabling table). One row per search result surfaced during the run that wrote an item content. result_content_excerpt caches the ~2KB snippet so claim-level span-checks (Component 3) run without re-fetching the page at validation time.';

COMMENT ON COLUMN agent_run_searches.result_content_excerpt IS
  'Cached text snippet (~2KB) from the web_search result, used for FACT-claim span verification without re-fetch.';

-- ── Table: section_claim_provenance (Addition A core) ───────────────
-- One row per emitted claim. claim_kind constrained to the four-value set.
-- FACT claims require source_span + source_id at validation time (enforced
-- by the validation function in task 1.3, not by a column constraint here).
CREATE TABLE IF NOT EXISTS section_claim_provenance (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_row_id           UUID REFERENCES intelligence_item_sections(id) ON DELETE CASCADE,
  intelligence_item_id     UUID REFERENCES intelligence_items(id) ON DELETE CASCADE,
  claim_text               TEXT NOT NULL,
  claim_kind               TEXT NOT NULL CHECK (claim_kind IN ('FACT', 'ANALYSIS', 'LEGAL', 'GAP')),
  source_span              TEXT,
  source_id                UUID REFERENCES sources(id) ON DELETE SET NULL,
  search_result_id         UUID REFERENCES agent_run_searches(id) ON DELETE SET NULL,
  source_tier_at_grounding INTEGER,
  extracted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by              UUID,
  verified_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_section_claim_provenance_item_id
  ON section_claim_provenance(intelligence_item_id);

CREATE INDEX IF NOT EXISTS idx_section_claim_provenance_section_row_id
  ON section_claim_provenance(section_row_id);

CREATE INDEX IF NOT EXISTS idx_section_claim_provenance_source_id
  ON section_claim_provenance(source_id);

CREATE INDEX IF NOT EXISTS idx_section_claim_provenance_claim_kind
  ON section_claim_provenance(claim_kind);

COMMENT ON TABLE section_claim_provenance IS
  'Per-claim provenance (Sprint 4 Addition A core). One row per substantive claim emitted in a section. claim_kind in (FACT, ANALYSIS, LEGAL, GAP). FACT claims must carry a source_span + source_id grounded in the cited source; CRITICAL/HIGH items require source_tier_at_grounding in (1,2) (enforced by validate_item_provenance, task 1.3). verified_by / verified_at populated by the admin verification queue (Component 6).';

COMMENT ON COLUMN section_claim_provenance.source_tier_at_grounding IS
  'Snapshot of the grounding source effective_tier at validation time, used for the CRITICAL/HIGH per-claim authority floor.';

-- ── Table: item_type_required_slots (criterion 5 enforcement) ───────
-- Declarative slot requirements per item_type. Seeded in task 1.2
-- (NOT in this migration). Each declared slot must be present in
-- section_claim_provenance as a FACT or GAP row, else the gate fails.
CREATE TABLE IF NOT EXISTS item_type_required_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type   TEXT NOT NULL,
  slot_key    TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_type, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_item_type_required_slots_item_type
  ON item_type_required_slots(item_type);

COMMENT ON TABLE item_type_required_slots IS
  'Declarative required-slot vocabulary per item_type (Sprint 4 criterion 5). For each item_type, every listed slot_key must be addressed by at least one section_claim_provenance row (FACT span-grounded OR explicit GAP). Seeded in task 1.2; this migration creates the empty table only.';

COMMIT;
