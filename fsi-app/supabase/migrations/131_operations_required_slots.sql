-- Migration 131: seed item_type_required_slots for item_type='regional_data'.
--
-- Mirrors migration 113 (regulatory slots) and migration 126 (research slots).
-- Operations Profile (analysis-construction-spec SKILL.md §5) has 8 sections;
-- the load-bearing content that the ledger must ground falls in S1 (cost
-- baseline — SPAN grounded) and S2 (feasibility choices — SPAN grounded).
-- S3/S4 are MATRIX-gated (conditional, may omit) and thus satisfy via GAP
-- when the coverage threshold is not met. S5–S7 are TRANSITIVE or conditional;
-- S8 is the sources list.
--
-- Slot token rationale — the ledger stamps claim_text as "[slot_key] ...":
--
--   cost_baseline       S1 body. Every regional_data brief MUST anchor one
--                       sourced, dated cost figure for the region (electricity,
--                       fuel, labor, port handling). The token "cost_baseline"
--                       appears as the first slot_key claim in S1. Without it,
--                       the brief has no grounded cost anchor — the slot is
--                       the spec's single most critical Operations deliverable.
--
--   feasibility_choice  S2 body. Every regional_data brief MUST state at least
--                       one feasibility verdict for an operational choice
--                       (possible / restricted / prohibited) with reason and
--                       source. Token "feasibility_choice" appears in S2.
--                       Omitting S2 entirely leaves the reader without the
--                       make-vs-buy intelligence Operations Profile exists to
--                       supply.
--
--   pending_change      S7 body. Pending changes shift the cost and feasibility
--                       picture; a brief that silently omits S7 could cause the
--                       reader to act on stale data. Even when no changes are
--                       scheduled, the slot MUST be addressed — with a GAP claim
--                       ("No publicly announced changes as of [date]") rather
--                       than silent omission. Token "pending_change" in S7.
--                       GAP claim acceptable when no changes are scheduled.
--
--   region_jurisdiction S1–S4 collectively. The item's jurisdiction codes are
--                       the key to matrix eligibility for S3/S4. The brief must
--                       state which jurisdiction(s) it covers so the matrix gate
--                       can anchor to the right dimension×region cell. Token
--                       "region_jurisdiction" appears once in S1 or S2 when the
--                       brief names the specific region explicitly with a source.
--                       GAP claim acceptable when jurisdiction is ambiguous or
--                       multi-region (state the ambiguity honestly).
--
-- Slots are satisfiable by FACT or GAP claims. GAP is the honest answer when
-- data is genuinely unavailable (no public tariff schedule, no announced
-- pending changes, etc.). The ledger accepts GAP; validate_item_provenance
-- criterion 5 treats GAP as a covered slot.
--
-- ADDITIVE ONLY: INSERT into item_type_required_slots.
-- ON CONFLICT (item_type, slot_key) DO NOTHING — idempotent.

INSERT INTO item_type_required_slots (item_type, slot_key, description)
VALUES
  (
    'regional_data',
    'cost_baseline',
    'S1 Operational Cost Baseline: at least one sourced, dated cost figure for the region '
    '(industrial electricity, fuel, labor, port handling, or drayage). FACT claim required. '
    'The brief is not an Operations Profile without a cost anchor.'
  ),
  (
    'regional_data',
    'feasibility_choice',
    'S2 Feasibility of Operational Choices: at least one verdict (possible / restricted / '
    'prohibited) for a specific operational choice (on-site solar, BESS, equipment import, '
    'in-region sourcing) with reason and source. FACT claim required. GAP acceptable only '
    'when regulatory/permit regime is genuinely undocumented for this region.'
  ),
  (
    'regional_data',
    'pending_change',
    'S7 Pending Changes That Shift the Calculus: at least one sourced pending change '
    '(regulation under consultation, infrastructure under construction, energy market shift, '
    'supplier base change) OR an explicit GAP claim ("No publicly announced changes as of '
    '[date]") when none are scheduled. Silent omission is never acceptable. GAP claim '
    'acceptable when data is genuinely unavailable.'
  ),
  (
    'regional_data',
    'region_jurisdiction',
    'S1–S2 jurisdiction anchor: the brief must name the jurisdiction(s) it covers with a '
    'source so the matrix gate can match this item to the correct dimension×region cell '
    'for S3/S4 eligibility. GAP claim acceptable when jurisdiction is multi-region or '
    'ambiguous (state the ambiguity explicitly).'
  )
ON CONFLICT (item_type, slot_key) DO NOTHING;
