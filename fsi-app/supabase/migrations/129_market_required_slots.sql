-- Migration 129: seed item_type_required_slots for market_signal + initiative.
--
-- WHY: validate_item_provenance criterion 5 passes VACUOUSLY for market_signal
-- and initiative because item_type_required_slots has zero rows for those types.
-- Any shallow market brief passes the slot gate regardless of content quality.
-- This migration closes the vacancy so the grounding ledger must cover the
-- four load-bearing facts/gaps in a Market Signal Brief.
--
-- HOW SLOT_KEY STAMPING WORKS (matches migration 113 + 126 + canonical-pipeline.ts):
-- groundBrief (canonical-pipeline.ts line 265) stores FACT/GAP claims as:
--   "[slot_key] claim_text"
-- validate_item_provenance criterion 5 checks:
--   claim_text ILIKE '%' || v_slot.slot_key || '%'
-- So each slot_key must be a short token the ledger agent will stamp
-- into the claim_text prefix when it emits a FACT or GAP claim covering that slot.
-- The system-prompt instructs: "Cover EACH required slot with >=1 FACT or GAP
-- claim (set slot_key)" — the ledger agent receives slot_key names from
-- item_type_required_slots.slot_key and prefixes them onto the stored claim_text.
--
-- SLOT RATIONALE (4 slots, mirroring the 4-slot pattern in migrations 113 + 126):
--
--   signal_event       → S1 "What's Moving and What Triggered It"
--                        Always has a verbatim source span (the triggering event).
--                        Groundable as FACT. A market signal without a named event
--                        has no claim to make; GAP is honest when the event is
--                        too thin to span-ground.
--
--   driving_parties    → S2 "Who's Driving It and What They Want"
--                        Named parties + stated interests = sourced FACT spans.
--                        When no named parties appear in source, GAP is correct.
--
--   conversion_trigger → S3 "Expected Trajectory and Conversion Triggers"
--                        The specific trigger that flips signal to commercial
--                        pressure. Per analysis-construction-spec SKILL.md §6,
--                        this section frequently links a specific Regulation item.
--                        Span-groundable when the trigger is announced; GAP when
--                        the trigger is inferred from precedent only.
--
--   action_now         → S7 "What the Workspace Should Do Now"
--                        S7 is TRANSITIVE (synthesised from S1-S6) so no verbatim
--                        source span exists. Satisfy this slot with a GAP claim
--                        (claim_kind=GAP, slot_key=action_now) whose claim_text
--                        restates the section's lead action sentence.
--                        This mirrors the decision_relevance / does_not_resolve
--                        pattern in migration 128 for research_finding.
--
-- ADDITIVE ONLY: INSERT-only, ON CONFLICT (item_type, slot_key) DO NOTHING.
-- Idempotent. No ALTER/DROP, no backfill of existing rows.

BEGIN;

INSERT INTO item_type_required_slots (item_type, slot_key, description)
VALUES
  ('market_signal', 'signal_event',
   'The named triggering event or development — what actually moved (announcement, price break, policy step, partnership). Grounded by a verbatim span from the source; GAP acceptable when event detail is not yet public.'),

  ('market_signal', 'driving_parties',
   'The named parties driving the signal and their stated interests or leverage. Grounded by verbatim span; GAP when parties are not named in the source.'),

  ('market_signal', 'conversion_trigger',
   'The specific future event or threshold that would convert this signal into binding commercial pressure or regulatory obligation. May link a specific Regulation item (No-vacuum S3). FACT when the trigger is announced; GAP when inferred from precedent.'),

  ('market_signal', 'action_now',
   'What the workspace should do now — positioning moves (vendor conversations, contract clauses, data tracking, coalition participation). S7 is a TRANSITIVE synthesis section — no verbatim source span exists. Satisfy with a GAP claim (claim_kind=GAP, slot_key=action_now) whose claim_text is the section lead action sentence.'),

  ('initiative', 'signal_event',
   'The named triggering event or development — what actually moved (announcement, price break, policy step, partnership). Grounded by a verbatim span from the source; GAP acceptable when event detail is not yet public.'),

  ('initiative', 'driving_parties',
   'The named parties driving the initiative and their stated interests or leverage. Grounded by verbatim span; GAP when parties are not named in the source.'),

  ('initiative', 'conversion_trigger',
   'The specific future event or threshold that would convert this initiative into binding commercial pressure or regulatory obligation. May link a specific Regulation item (No-vacuum S3). FACT when announced; GAP when inferred.'),

  ('initiative', 'action_now',
   'What the workspace should do now — positioning moves (vendor conversations, contract clauses, data tracking, coalition participation). S7 is a TRANSITIVE synthesis section — no verbatim source span exists. Satisfy with a GAP claim (claim_kind=GAP, slot_key=action_now) whose claim_text is the section lead action sentence.')

ON CONFLICT (item_type, slot_key) DO NOTHING;

COMMIT;
