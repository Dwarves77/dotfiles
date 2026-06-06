-- Migration 132: make the Operations cost_baseline + feasibility_choice slots honestly
-- GAP-satisfiable (the migration-128 pattern, applied to regional_data).
--
-- PROBLEM (UK Regional Operations Profile e77f9426, 3 items, all FACT=0 -> quarantined on
-- criterion 5 missing_required_slot feasibility_choice):
--
-- Operations is, by the spec's own framing (SKILL.md §5), "a real data-acquisition problem —
-- industrial electricity, diesel, SAF, labor, port, drayage rates per active region, much of it
-- not free, not centralized." A regional_data brief synthesised from the sources that ARE freely
-- fetchable (transport-decarbonisation policy pages, parliamentary briefings) carries real sourced
-- emissions/policy FACTs but frequently has NO verbatim cost-tariff figure and NO verbatim permit
-- verdict in the fetched content. Migration 131 wrote cost_baseline + feasibility_choice as "FACT
-- claim required" with GAP allowed "only when the regime is undocumented" — too narrow. The ledger
-- then cannot cover the slot: it has no verbatim span to make a FACT, and the description discourages
-- the GAP. Criterion 5 fails -> the whole brief rolls back -> 0 claims persisted.
--
-- FIX (integrity rule, NOT gate-gaming): a slot is GAP-satisfiable whenever the FETCHED sourced
-- content contains no verbatim figure/verdict for it. This is precisely the condition under which a
-- FACT cannot honestly be made. The substantive content (a directional cost estimate, an analytical
-- feasibility verdict) still appears in the section body as a LABELED inference ("Analytical
-- inference:"); the slot is marked GAP to say honestly "no verbatim source figure for this region
-- yet" — which is the truthful state until the Operations data-sourcing program fills the matrix.
-- This matches the spec: S1/S2 "populate incrementally" and "carry standalone value per region."
--
-- ADDITIVE: UPDATE the two over-constrained slot descriptions. cost figures/verdicts that ARE in the
-- sourced content still ground as FACT (preferred); the change only unblocks the honest GAP fallback.

BEGIN;

UPDATE item_type_required_slots
SET description =
  'S1 Operational Cost Baseline: a sourced, dated cost figure for the region (industrial electricity, '
  'fuel, labor, port handling, or drayage). Emit a FACT claim (claim_kind=FACT, slot_key=cost_baseline) '
  'when the fetched sourced content contains a verbatim cost figure. When it does NOT (cost tariffs are '
  'frequently paywalled or absent from freely-fetchable policy sources), emit a GAP claim '
  '(claim_kind=GAP, slot_key=cost_baseline) stating the cost anchor is not yet in sourced content — the '
  'honest answer until the Operations data-sourcing program supplies it. Never invent a cost figure.'
WHERE item_type = 'regional_data' AND slot_key = 'cost_baseline';

UPDATE item_type_required_slots
SET description =
  'S2 Feasibility of Operational Choices: a verdict (possible / restricted / prohibited) for a specific '
  'operational choice (on-site solar, BESS, equipment import, in-region sourcing) with reason and '
  'source. Emit a FACT claim (slot_key=feasibility_choice) when the fetched content states the verdict '
  'verbatim. When the verdict is an analytical inference (no verbatim regulatory/permit statement in '
  'the sourced content), emit a GAP claim (claim_kind=GAP, slot_key=feasibility_choice) — the labeled '
  'feasibility analysis still appears in the S2 body; the GAP honestly marks it as inference, not a '
  'verbatim source fact. Never invent a permit verdict.'
WHERE item_type = 'regional_data' AND slot_key = 'feasibility_choice';

COMMIT;
