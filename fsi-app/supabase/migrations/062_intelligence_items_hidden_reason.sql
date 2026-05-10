-- Migration 062: intelligence_items.hidden_reason
--
-- Adds a free-text column to capture WHY an item was flagged-and-hidden,
-- distinct from the integrity-flag mechanism (agent_integrity_phrase).
-- Off-topic hides set pipeline_stage='archived' AND populate hidden_reason
-- with operator-drafted reason text. The integrity flag column stays
-- single-purpose (NULL when no integrity flag), preserving query semantics
-- for "show me items with integrity issues".
--
-- Per topic-relevance investigation 2026-05-09 + multi-task wave dispatch
-- v2 Task 2 + Claude Code review on schema-mechanism choice.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT NULL;

COMMENT ON COLUMN intelligence_items.hidden_reason IS
  'Operator-drafted reason text when an item is flagged and hidden, typically used together with pipeline_stage=archived for off-topic hides. Distinct from agent_integrity_phrase which is reserved for the integrity-flag mechanism. NULL when no hide reason applies.';
