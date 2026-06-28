-- 144_scrape_cadence.sql
-- Global scrape SCHEDULE on the system_state singleton — the SINGLE source of truth for WHEN the whole
-- system scrapes. Option 1: the per-source update_frequency / next_scheduled_check cadence is RETIRED
-- (no longer decides anything); on a scheduled scrape day the WHOLE system scrapes, every active source
-- together. Model: cadence ('off'|'weekly'|'monthly') + a start_date anchor (the first run AND the
-- recurrence phase — weekly from a Tuesday => Tuesdays; monthly from the 1st => the 1st; before the
-- anchor, nothing runs). 'off' is the default and the current hold.
--
-- global_processing_paused (migration 016) is KEPT as an INDEPENDENT emergency stop: it can hard-halt
-- scraping at any time WITHOUT erasing the saved cadence/start_date (the panic button must not wipe the
-- plan). isGloballyPaused() = (scrape_cadence = 'off') OR global_processing_paused.

ALTER TABLE system_state ADD COLUMN IF NOT EXISTS scrape_cadence TEXT NOT NULL DEFAULT 'off';
ALTER TABLE system_state ADD COLUMN IF NOT EXISTS scrape_start_date DATE;

ALTER TABLE system_state DROP CONSTRAINT IF EXISTS system_state_scrape_cadence_chk;
ALTER TABLE system_state ADD CONSTRAINT system_state_scrape_cadence_chk
  CHECK (scrape_cadence IN ('off', 'weekly', 'monthly'));

COMMENT ON COLUMN system_state.scrape_cadence IS
  'Global scrape cadence (off|weekly|monthly). SINGLE source of truth for when the whole system scrapes; per-source update_frequency retired. off = hold (default/current state).';
COMMENT ON COLUMN system_state.scrape_start_date IS
  'Anchor date: the first scrape day AND the recurrence phase. weekly => that weekday; monthly => that day-of-month (clamped on short months). Before this date nothing runs ("paused until started").';
