-- Migration 128: Research finding slot fix — make required slots groundable.
--
-- PROBLEM (item 88c3a053, MIT Climate Machine, 24,881ch brief, 0 FACT claims -> quarantined):
--
-- Migration 126 seeded four slots for research_finding:
--   finding            -> maps to S1 (FACT-groundable via verbatim source span)
--   methodology_limits -> maps to S1 (FACT-groundable via verbatim source span)
--   decision_relevance -> maps to S3 (TRANSITIVE section — no verbatim span; synthesis only)
--   does_not_resolve   -> maps to S5 (TRANSITIVE section — no verbatim span; synthesis only)
--
-- The groundBrief ledger system prompt instructs: "Cover EACH required slot with >=1 FACT or GAP
-- claim (set slot_key)". For a rich research brief, S3 and S5 are TRANSITIVE synthesis sections —
-- they contain labeled ANALYSIS claims ("Analytical inference:", "Operational implication:") derived
-- from S1 facts, NOT verbatim source spans. The ledger agent produces ANALYSIS claims for these
-- sections. But the ledger filter drops ANALYSIS claims whose claim_text does not appear verbatim in
-- a section that also carries an analysis label — a legitimate match — and validate_item_provenance
-- criterion 5 checks slot coverage only on FACT or GAP claim kinds, not ANALYSIS.
--
-- Result: S3 and S5 analysis claims are kept, but the slot_key is not set on them (the ledger agent
-- assigns slot_key to FACT/GAP records only, per the system prompt). validate_item_provenance sees
-- zero FACT/GAP records with slot_key='decision_relevance' or 'does_not_resolve' -> criterion 5
-- fails -> brief quarantined despite rich, honest content.
--
-- FIX (two parts):
--
-- Part A (this migration): Replace the slot descriptions for decision_relevance and does_not_resolve
-- with descriptions that EXPLICITLY signal these are satisfied by GAP claims (not FACT spans) when
-- the section is synthesis-only. The updated descriptions include the phrase "GAP claim acceptable
-- when section is synthesis" so the ledger agent knows it may emit a GAP record rather than searching
-- for a non-existent verbatim span. This is semantically correct: a synthesis section has NO verbatim
-- source span of its own — a GAP record is the honest, integrity-preserving answer.
--
-- Part B (groundBrief system prompt, documented here as the one-line orchestrator hook):
-- The system prompt's ledger instructions must note that for research_finding, sections S3 and S5
-- are TRANSITIVE (synthesis only); slot coverage for decision_relevance and does_not_resolve is
-- satisfied by a GAP claim with the section's top analytical claim as claim_text, plus slot_key set.
-- See the groundingReuse note in the author report for the exact one-line addition.
--
-- ADDITIVE ONLY: UPDATE the description for the two transitive-grounded slots. The other two slots
-- (finding, methodology_limits) remain correct as written in migration 126. ON CONFLICT not
-- applicable to UPDATE; targeting by WHERE clause on the unique (item_type, slot_key) pair.

BEGIN;

-- Update decision_relevance: S3 is a TRANSITIVE section (synthesis). Slot is satisfied by a GAP
-- claim whose claim_text is the section's lead analytical statement, slot_key set.
UPDATE item_type_required_slots
SET description = 'What the finding changes for the workspace: claims it can or cannot make, decisions impacted. S3 is a TRANSITIVE synthesis section — no verbatim source span exists. Satisfy this slot with a GAP claim (claim_kind=GAP, slot_key=decision_relevance) whose claim_text restates the section''s lead sentence.'
WHERE item_type = 'research_finding' AND slot_key = 'decision_relevance';

-- Update does_not_resolve: S5 is a TRANSITIVE section (limits + open questions). Slot is satisfied
-- by a GAP claim noting the unresolved question, slot_key set.
UPDATE item_type_required_slots
SET description = 'Limits, open questions, and convergent/contradictory research the finding does NOT settle. S5 is a TRANSITIVE synthesis section — no verbatim source span exists. Satisfy this slot with a GAP claim (claim_kind=GAP, slot_key=does_not_resolve) whose claim_text names the unresolved question.'
WHERE item_type = 'research_finding' AND slot_key = 'does_not_resolve';

COMMIT;
