-- 326_regulation_directive_slot_gap_source_says_so.sql
-- Operator ruling 2026-09-17 ("1bb72c94 do your rec"): the source-characterised GAP allowance that
-- migration 137 gave penalty_summary and primary_deadline on standard / framework / guidance now applies to
-- regulation and directive as well. The rule is unchanged: a GAP is licensed ONLY by the fetched source's
-- own statement that there is no penalty / no deadline (a Council Decision concluding an international
-- agreement, a regulation whose enforcement sits in national transposition), never by the item type; a
-- real penalty or deadline in the source still forces the FACT. Data-only: the validator's criterion 5
-- already accepts a GAP claim for any slot; the description is what the grounding prompt and the
-- record-briefs pre-write mirror (schema.mjs slotAllowsGap, lane L25) read. Live instance: 1bb72c94
-- (84/358/EEC), the only item in the corpus held by the slot rule on 2026-09-17.
BEGIN;
UPDATE item_type_required_slots
SET description =
  'penalty_summary: what the workspace risks if non-compliant. Emit a FACT claim (claim_kind=FACT, '
  'slot_key=penalty_summary) when the fetched sourced content states a verbatim penalty, fine, '
  'sanction, or enforcement consequence. When the fetched content states no penalty, fine, sanction or '
  'enforcement consequence (a Council Decision concluding an agreement, an instrument whose enforcement '
  'sits in national transposition, an instrument the source characterises as non-binding), emit a GAP '
  'claim (claim_kind=GAP, slot_key=penalty_summary) that SAYS SO on that basis, e.g. "No penalty: the '
  'source states no penalty, fine or enforcement consequence; enforcement sits with national law as of '
  '[date]." The GAP must be grounded in the source''s own text, NEVER licensed by the item type alone: if '
  'the source states a real penalty, emit the FACT. Never invent a penalty.'
WHERE item_type IN ('regulation', 'directive') AND slot_key = 'penalty_summary';
UPDATE item_type_required_slots
SET description =
  'primary_deadline: the headline compliance deadline (closest in time). Emit a FACT claim '
  '(claim_kind=FACT, slot_key=primary_deadline) when the fetched sourced content states a verbatim '
  'compliance deadline. When the fetched content sets no compliance deadline (a Council Decision '
  'concluding an agreement, an instrument whose dates sit in national transposition, an instrument the '
  'source characterises as non-binding), emit a GAP claim (claim_kind=GAP, slot_key=primary_deadline) '
  'that SAYS SO on that basis, e.g. "No compliance deadline: the source sets no mandated date as of '
  '[date]." The GAP must be grounded in the source''s own text, NEVER licensed by the item type alone: if '
  'the source states a real deadline, emit the FACT. Never invent a deadline.'
WHERE item_type IN ('regulation', 'directive') AND slot_key = 'primary_deadline';
COMMIT;
