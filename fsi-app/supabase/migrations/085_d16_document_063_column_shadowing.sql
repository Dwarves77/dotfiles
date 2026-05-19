-- Migration 085: D16 resolution. Document the migration 063 column shadowing decision.
--
-- BACKGROUND
--
-- Per Sprint 1 schema-reconciliation-discovery-2026-05-18.md Anomaly #4 and
-- Sprint 2 plan D16: migration 063 attempted to add `tier TEXT NULL` and
-- `jurisdictions TEXT[] NULL DEFAULT '{}'` to public.sources via
-- ADD COLUMN IF NOT EXISTS. Both silently no-op'd because migration 004 had
-- already created these columns with different types:
--
--   sources.tier         = INTEGER NOT NULL with CHECK (tier BETWEEN 1 AND 7)
--   sources.jurisdictions = TEXT[] NOT NULL DEFAULT '{}'
--
-- The other 12 columns migration 063 introduced (source_role, secondary_roles,
-- scope_topics, scope_modes, scope_verticals, expected_output,
-- classification_assigned_at, classification_observed_distribution,
-- observed_correctness_count, last_observed_at, classification_confidence,
-- classification_rationale) all applied cleanly. So the 5-axis classification
-- framework is partially live: 12 of 14 intended columns took effect.
--
-- DECISION (D16, resolved 2026-05-19): Option B (accept divergence + document).
--
-- Rationale:
--   - 794 live sources use the INT tier with all 7 tier values populated
--     (tier 1: 378, 2: 164, 3: 116, 4: 78, 5: 37, 6: 1, 7: 20)
--   - The env-policy SKILL.md Section "Source Type Hierarchy" defines 6
--     type-levels (binding law, regulator guidance, intergovernmental body,
--     industry body, news reporting, analysis and opinion). The INT 1-7
--     model maps cleanly: 1-6 to the 6 types, 7 as overflow/uncategorized
--   - ALTERing tier INT to TEXT is lossy (requires mapping integers to
--     a string vocabulary; loses tier slot semantics) and breaks consumers
--     that rely on the INT type for comparisons and the CHECK constraint
--     for range validation
--   - The jurisdictions column NOT NULL DEFAULT '{}' is fine; empty array
--     functions equivalently to NULL for "unknown jurisdiction" use cases,
--     and no consumer differentiates NULL from empty
--   - Build 7 (Market Intel signal aggregation) does not depend on D16;
--     proceeding against the existing schema is safe
--
-- Future: if env-policy skill amendments DEMAND a TEXT-typed tier column
-- with the T1-T6 vocabulary, that is a SEPARATE migration with explicit
-- operator authorization for the skill-amendment dispatch + the schema-
-- change dispatch (per sprint-followups-discipline planning-doc rule that
-- skill-closed scope cannot be re-opened as a tactical decision).

COMMENT ON COLUMN public.sources.tier IS
  'Integer 1-7 source tier per the 6-level Source Type Hierarchy in environmental-policy-and-innovation SKILL.md (1=binding law, 2=regulator guidance, 3=intergovernmental body, 4=industry body, 5=news reporting, 6=analysis and opinion, 7=overflow/uncategorized). Migration 063 attempted to change this to TEXT but the ADD COLUMN IF NOT EXISTS silently no-op''d against the migration 004 INT column. Decision (D16, 2026-05-19): accept divergence per migration 085 header. ALTER to TEXT is lossy and breaks consumers. Future skill-amendment-driven schema change would require explicit operator authorization.';

COMMENT ON COLUMN public.sources.jurisdictions IS
  'Text array of jurisdiction codes (lowercase region codes like us, eu, uk, ca, au, jp, us-ca, us-federal, us-state) for the source. NOT NULL DEFAULT empty array. Migration 063 attempted to allow NULL but the ADD COLUMN IF NOT EXISTS silently no-op''d. Decision (D16, 2026-05-19): accept divergence per migration 085 header. Empty array functions equivalently to NULL for "unknown" cases; no consumer differentiates.';

COMMENT ON COLUMN public.sources.tier_at_creation IS
  'Captures the tier value at source creation time. Migration 004 schema. CHECK (tier_at_creation BETWEEN 1 AND 7). Mirrors sources.tier shape; not affected by migration 063 shadowing attempt.';

COMMENT ON COLUMN public.sources.highest_citing_tier IS
  'Optional integer 1-7 noting the highest tier that has cited this source. NULL allowed. Migration 004 schema. Not affected by migration 063 shadowing attempt.';
