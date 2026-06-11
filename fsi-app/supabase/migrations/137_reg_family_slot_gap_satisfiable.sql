-- Migration 137: make penalty_summary + primary_deadline honestly GAP-satisfiable for the
-- NON-BINDING reg-family types (standard / framework / guidance). The migration-132 pattern
-- (rewrite item_type_required_slots.description so the grounding agent emits an EXPLICIT honest
-- GAP claim when no verbatim binding fact exists; validate_item_provenance criterion 5 already
-- accepts a GAP claim carrying the slot_key as a covered slot).
--
-- PROBLEM (operator-confirmed 2026-06-08; the redo's verified->quarantined regression root cause):
-- migration 113 seeded the SAME four binding-law slots — effective_date, primary_deadline,
-- jurisdictional_scope, penalty_summary — HARD-required for all five reg-family item_types. But
-- standard / framework / guidance are FREQUENTLY NON-BINDING: a voluntary accounting standard
-- (GLEC, GHG Protocol, ISO 14083), a strategy/plan (IMO GHG Strategy, a national freight plan), or
-- interpretive guidance genuinely has NO compliance deadline and NO penalty. With the slot HARD and
-- no verbatim deadline/penalty in the fetched content, the ledger cannot cover the slot — criterion 5
-- fails missing_required_slot -> the whole brief rolls back -> a correctly-grounded non-binding brief
-- is FALSELY quarantined (loses customer surfacing). Bucket evidence (probe-reg-family-buckets.mjs,
-- 2026-06-08): the standard/framework/guidance buckets are dominated by voluntary standards, strategies
-- and guidance; 0 titles carry binding-instrument markers.
--
-- SCOPE — exactly what is observed-broken, nothing more (Jason's approved matrix, 2026-06-08):
--   * penalty_summary  -> GAP-ok on standard / framework / guidance
--   * primary_deadline -> GAP-ok on standard / framework / guidance
--   * regulation / directive  : UNCHANGED — stay fully HARD on all four slots (binding instruments).
--   * effective_date          : UNCHANGED everywhere — even a non-binding instrument has an
--                               adoption/publication date (HARD; watch-item only — flip only if
--                               living/continuously-updated docs actually false-quarantine on it).
--   * jurisdictional_scope    : UNCHANGED everywhere — scope is near-universal; "global, voluntary,
--                               any organisation" IS a scope (HARD).
--
-- INTEGRITY (carry-condition B, NOT gate-gaming): the GAP is authorised ONLY by the FETCHED SOURCE's
-- characterisation of the instrument as voluntary / non-binding (or the source genuinely stating no
-- deadline / no penalty) — NEVER licensed by the item_type label alone. Where the source states a real
-- deadline or penalty (e.g. a binding instrument mistyped into one of these buckets), the agent MUST
-- still emit a FACT; the loosening cannot produce a false GAP. The GAP claim must STATE that basis
-- (the instrument is voluntary / the source sets no deadline-penalty), so it reads as an honest,
-- source-grounded acknowledgement of the dimension — not silent omission. Never invent a penalty or a
-- deadline. All other criteria (span-grounded FACTs, no unlabeled binding-modal assertions, no
-- ungrounded URLs) are untouched.
--
-- ADDITIVE: UPDATE six over-constrained slot descriptions only. A deadline/penalty that IS in the
-- sourced content still grounds as a FACT (preferred); this change only unblocks the honest GAP
-- fallback for the genuinely non-binding case.

BEGIN;

-- ── penalty_summary: GAP-ok on the three non-binding types ──────────────────────────────
UPDATE item_type_required_slots
SET description =
  'penalty_summary — what the workspace risks if non-compliant. Emit a FACT claim (claim_kind=FACT, '
  'slot_key=penalty_summary) when the fetched sourced content states a verbatim penalty, fine, '
  'sanction, or enforcement consequence. When the fetched content characterises this instrument as '
  'VOLUNTARY / non-binding, or states no penalty exists, emit a GAP claim (claim_kind=GAP, '
  'slot_key=penalty_summary) that SAYS SO on that basis — e.g. "No penalty: the source presents this '
  'as a voluntary standard / non-binding framework with no enforcement mechanism as of [date]." The '
  'GAP must be grounded in the source''s own non-binding characterisation, NEVER licensed by the item '
  'type alone: if the source states a real penalty, emit the FACT. Never invent a penalty.'
WHERE item_type IN ('standard', 'framework', 'guidance') AND slot_key = 'penalty_summary';

-- ── primary_deadline: GAP-ok on the three non-binding types ─────────────────────────────
UPDATE item_type_required_slots
SET description =
  'primary_deadline — the headline compliance deadline (closest in time). Emit a FACT claim '
  '(claim_kind=FACT, slot_key=primary_deadline) when the fetched sourced content states a verbatim '
  'compliance deadline. When the fetched content characterises this instrument as VOLUNTARY / '
  'non-binding, or sets no compliance deadline, emit a GAP claim (claim_kind=GAP, '
  'slot_key=primary_deadline) that SAYS SO on that basis — e.g. "No compliance deadline: the source '
  'presents this as a voluntary standard / strategy with no mandated date as of [date]." The GAP must '
  'be grounded in the source''s own non-binding characterisation, NEVER licensed by the item type '
  'alone: if the source states a real deadline, emit the FACT. Never invent a deadline.'
WHERE item_type IN ('standard', 'framework', 'guidance') AND slot_key = 'primary_deadline';

COMMIT;
