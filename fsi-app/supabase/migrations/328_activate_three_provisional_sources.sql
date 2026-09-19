-- subject: Operator ruling 2026-09-17 (lane L39). Data: three provisional `sources` rows (b0d81570 clean-trucking.eu tier 4, b06a7c81 napa.fi tier 5, 3e3a2d5f bsr.org tier 6) set active; one `source_trust_events` row each (`manual_review`, created_by `human`) records the ruling. They held items 58bf0406, 0781a8c0, 01126119 at criterion 1. Tiers unchanged. APPLIED 2026-09-17 through the management API.
-- 328_activate_three_provisional_sources.sql
-- Operator ruling 2026-09-17 ("activate three sources"): the three provisional registry rows that hold
-- three live items at validate_item_provenance criterion 1 (source_not_active) become active. Each row
-- already carries a classified base_tier from the class table (association 4, industry 5, analysis 6),
-- so the items' FACT stamps resolve to a real tier; none of the three is a regulatory item, so no
-- authority floor is in play. The tier is NOT changed here (one tier per institution, SC-13).
--   b0d81570 European Clean Trucking Alliance press release, clean-trucking.eu, tier 4 (item 58bf0406)
--   b06a7c81 napa.fi (Blue Visby Solution), tier 5 (item 0781a8c0)
--   3e3a2d5f BSR blog on the air freight alliance, bsr.org, tier 6 (item 01126119)
-- Data-only. Read-back: three rows status = 'active'; one source_trust_events row per source records the
-- ruling (event_type manual_review, created_by human are the CHECK vocabularies) so the promotion path's
-- visibility contract (RD-20) holds.
BEGIN;
UPDATE sources
SET status = 'active'
WHERE id IN ('b0d81570-4888-4186-a2db-7168d0cac6e3', 'b06a7c81-8e7c-4234-808f-4360e0f2ccb7', '3e3a2d5f-9300-485e-aa5a-8fc6ede547b7')
  AND status = 'provisional';
INSERT INTO source_trust_events (source_id, event_type, details, created_by)
SELECT id, 'manual_review',
       jsonb_build_object('previous_status', 'provisional', 'new_status', 'active',
                          'reason', 'Operator ruling 2026-09-17: activate the three provisional sources holding live items at criterion 1',
                          'migration', 328),
       'human'
FROM sources
WHERE id IN ('b0d81570-4888-4186-a2db-7168d0cac6e3', 'b06a7c81-8e7c-4234-808f-4360e0f2ccb7', '3e3a2d5f-9300-485e-aa5a-8fc6ede547b7');
COMMIT;
