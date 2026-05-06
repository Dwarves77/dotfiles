-- 035_agent_integrity_flags.sql
-- Detect integrity-flag phrases in agent-emitted full_brief content.
-- Computed boolean + matched-phrase storage, recomputed via trigger
-- on every intelligence_items insert/update where full_brief changes.
--
-- Background: the agent that generates intelligence_items.full_brief is
-- instructed by SKILL.md to flag integrity concerns in plain English when
-- it can't verify the source URL or the source content doesn't match the
-- request. These flags were buried in the markdown body and never surfaced
-- to operators — SB 253 (CA climate disclosure) was self-flagged by the
-- agent and went unseen for 30+ days. This migration extracts the flag
-- so the admin surface can render it.

ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS agent_integrity_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS agent_integrity_phrase TEXT NULL,
  ADD COLUMN IF NOT EXISTS agent_integrity_flagged_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS agent_integrity_resolved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS agent_integrity_resolved_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial index — fast lookup for the admin sub-tab list. Only indexes
-- unresolved flagged rows; resolved rows fall out and don't bloat the index.
CREATE INDEX IF NOT EXISTS idx_intel_items_agent_integrity_flag
  ON intelligence_items(agent_integrity_flag)
  WHERE agent_integrity_flag = TRUE AND agent_integrity_resolved_at IS NULL;

-- Detection function — case-insensitive regex match against the canonical
-- phrase list. Updates only the integrity columns; the agent_integrity_resolved_*
-- fields are never touched here (they belong to the admin resolution flow).
--
-- The phrase list is ordered by specificity so the most diagnostic match
-- wins. Phrase patterns are conservative — broad matches like "should be
-- there" can collide with legitimate brief content, so the admin UI is
-- expected to be the final arbiter.
CREATE OR REPLACE FUNCTION recompute_agent_integrity_flag()
RETURNS TRIGGER AS $$
DECLARE
  v_phrase TEXT;
BEGIN
  IF NEW.full_brief IS NULL THEN
    NEW.agent_integrity_flag := FALSE;
    NEW.agent_integrity_phrase := NULL;
    RETURN NEW;
  END IF;

  v_phrase := NULL;

  IF NEW.full_brief ~* 'replace the source URL' THEN
    v_phrase := 'replace the source URL';
  ELSIF NEW.full_brief ~* 'do not act on (any |the )?prior brief' THEN
    v_phrase := 'do not act on prior brief';
  ELSIF NEW.full_brief ~* 'should be there' THEN
    v_phrase := 'should be there';
  ELSIF NEW.full_brief ~* 'if .{1,40}? was intended' THEN
    v_phrase := 'if X was intended';
  ELSIF NEW.full_brief ~* 'specific article, regulatory text, or guidance document' THEN
    v_phrase := 'specific article, regulatory text, or guidance document';
  ELSIF NEW.full_brief ~* 'integrity rule' THEN
    v_phrase := 'integrity rule';
  ELSIF NEW.full_brief ~* 'unable to verify' THEN
    v_phrase := 'unable to verify';
  ELSIF NEW.full_brief ~* 'could not confirm' THEN
    v_phrase := 'could not confirm';
  END IF;

  IF v_phrase IS NOT NULL AND NOT NEW.agent_integrity_flag THEN
    NEW.agent_integrity_flag := TRUE;
    NEW.agent_integrity_phrase := v_phrase;
    NEW.agent_integrity_flagged_at := NOW();
  ELSIF v_phrase IS NULL THEN
    NEW.agent_integrity_flag := FALSE;
    NEW.agent_integrity_phrase := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_intelligence_items_integrity_flag ON intelligence_items;
CREATE TRIGGER trg_intelligence_items_integrity_flag
BEFORE INSERT OR UPDATE OF full_brief ON intelligence_items
FOR EACH ROW EXECUTE FUNCTION recompute_agent_integrity_flag();

-- One-shot backfill across existing rows. Re-assigning full_brief to itself
-- triggers the BEFORE trigger which recomputes the flag. Idempotent — safe
-- to re-run; rows whose phrase was already detected don't change state.
UPDATE intelligence_items SET full_brief = full_brief WHERE full_brief IS NOT NULL;

COMMENT ON COLUMN intelligence_items.agent_integrity_flag IS 'TRUE when full_brief contains agent-emitted integrity concern phrase. Auto-recomputed via trigger on full_brief change.';
COMMENT ON COLUMN intelligence_items.agent_integrity_phrase IS 'The canonical phrase pattern that matched. NULL when flag is FALSE.';
COMMENT ON COLUMN intelligence_items.agent_integrity_flagged_at IS 'Timestamp of the first detection — set only on the FALSE→TRUE edge.';
COMMENT ON COLUMN intelligence_items.agent_integrity_resolved_at IS 'Timestamp of admin resolution (replace_url / regenerate / mark_resolved).';
COMMENT ON COLUMN intelligence_items.agent_integrity_resolved_by IS 'auth.users.id of the admin who resolved the flag.';
