-- 044_integrity_flag_trigger_tune.sql
--
-- Migration 035 introduced an 8-phrase regex set to detect agent self-flags
-- in `intelligence_items.full_brief`. Triage of the resulting 57 flagged
-- items (docs/INTEGRITY-TRIAGE-PLAN.json) revealed 55/57 hit on the phrase
-- "integrity rule" — but those briefs were EXPLAINING the integrity rule
-- (per SKILL.md citation discipline), not flagging an integrity ISSUE.
-- Same pattern for "should be there" which appeared in legitimate prose
-- ("an exemption notification should be there for items above 50kg").
--
-- This migration narrows the trigger to phrases that ONLY appear when the
-- agent is genuinely flagging a problem with the source / brief content:
--
-- DROPPED:
--   - "integrity rule"     -- 55 false positives
--   - "should be there"    -- 1 false positive (over-flag found in r13)
--   - "if .{1,40}? was intended"  -- conversational / over-flag prone
--
-- KEPT:
--   - "replace the source URL"
--   - "do not act on (any |the )?prior brief"
--   - "specific article, regulatory text, or guidance document"
--   - "unable to verify"
--   - "could not confirm"
--
-- After the trigger redefinition, the existing flag column is REFRESHED:
-- every row is re-examined against the new phrase set and false-positive
-- flags are cleared. Genuine flags (the 2 of 57 not pointing at "integrity
-- rule") are preserved.

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
  ELSIF NEW.full_brief ~* 'specific article, regulatory text, or guidance document' THEN
    v_phrase := 'specific article, regulatory text, or guidance document';
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

-- Refresh existing flags via no-op UPDATE (re-fires the trigger).
UPDATE intelligence_items SET full_brief = full_brief WHERE full_brief IS NOT NULL;

COMMENT ON FUNCTION recompute_agent_integrity_flag IS
  'W2.C agent-integrity-flag trigger, retuned 2026-05-06 after triage of 57 false-positive-heavy flags. Phrase set narrowed from 8 to 5 to drop over-broad patterns.';
