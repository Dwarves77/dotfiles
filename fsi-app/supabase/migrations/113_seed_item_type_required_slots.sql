-- Migration 113: Seed item_type_required_slots (Sprint 4 Block 1, task 1.2).
--
-- Implements design-doc section 4 STEP 3-adjacent seed for criterion 5
-- (required-slot enforcement). Per decision-log row 206 (LOCKED DECISION,
-- open question 1): the SAME four slots are seeded for ALL five D1
-- item_types — regulation, directive, standard, guidance, framework:
--   - effective_date        When the instrument enters force
--   - primary_deadline       The headline compliance deadline (closest in time)
--   - jurisdictional_scope   Where the instrument applies
--   - penalty_summary        What the workspace risks if non-compliant
-- Per-type customization deferred to Block 1.5 only if the uniform four
-- prove wrong in practice. penalty_summary is satisfiable by an explicit
-- GAP label where an instrument genuinely has no penalty provision (the
-- slot rule is "addressed," not "has a number"); that semantic lives in
-- the validation function (task 1.3), not in this seed.
--
-- ADDITIVE ONLY: INSERT-only into the NEW item_type_required_slots table
-- created (empty) by migration 112. No ALTER/DROP, no NOT NULL/CHECK on
-- existing columns, no backfill or UPDATE of any existing
-- intelligence_items / intelligence_item_sections row. Idempotent via
-- ON CONFLICT (item_type, slot_key) DO NOTHING against the table's
-- UNIQUE (item_type, slot_key) constraint.

BEGIN;

INSERT INTO item_type_required_slots (item_type, slot_key, description)
VALUES
  ('regulation', 'effective_date',      'When the regulation enters force'),
  ('regulation', 'primary_deadline',    'The headline compliance deadline (closest in time)'),
  ('regulation', 'jurisdictional_scope','Where the regulation applies'),
  ('regulation', 'penalty_summary',     'What the workspace risks if non-compliant'),

  ('directive', 'effective_date',      'When the directive enters force'),
  ('directive', 'primary_deadline',    'The headline compliance deadline (closest in time)'),
  ('directive', 'jurisdictional_scope','Where the directive applies'),
  ('directive', 'penalty_summary',     'What the workspace risks if non-compliant'),

  ('standard', 'effective_date',      'When the standard enters force'),
  ('standard', 'primary_deadline',    'The headline compliance deadline (closest in time)'),
  ('standard', 'jurisdictional_scope','Where the standard applies'),
  ('standard', 'penalty_summary',     'What the workspace risks if non-compliant'),

  ('guidance', 'effective_date',      'When the guidance enters force'),
  ('guidance', 'primary_deadline',    'The headline compliance deadline (closest in time)'),
  ('guidance', 'jurisdictional_scope','Where the guidance applies'),
  ('guidance', 'penalty_summary',     'What the workspace risks if non-compliant'),

  ('framework', 'effective_date',      'When the framework enters force'),
  ('framework', 'primary_deadline',    'The headline compliance deadline (closest in time)'),
  ('framework', 'jurisdictional_scope','Where the framework applies'),
  ('framework', 'penalty_summary',     'What the workspace risks if non-compliant')
ON CONFLICT (item_type, slot_key) DO NOTHING;

COMMIT;
