-- Migration 149 (count-integrity: severity backfill enabling the leak #3 card swap). Deterministic,
-- idempotent, zero re-classification.
--
-- DIAGNOSIS (read-only, 2026-07-03). 254/259 verified items already carry severity (98%). The 5 nulls
-- are ALL regulations-surface and ALL carry a priority (HIGH/MODERATE). The ops/reg severity vocabulary
-- IS lower(priority) — mapPriorityToSeverity (src/types/intelligence.ts) maps CRITICAL/HIGH/MODERATE/LOW
-- to critical/high/moderate/low — so those fill deterministically from data already on the row, with no
-- model call. Market/research severity is a SEMANTIC model output (a different per-surface vocab), is
-- already 100% populated on the verified set, and is NOT priority-derivable; this backfill therefore
-- touches ONLY the ops/reg surfaces (the surface_of guard) and never invents a market/research severity.
--
-- WHY. The leak #3 card swap (surface cards reading get_surface_counts.by_severity instead of deriving
-- severity client-side) requires the DB severity column to be authoritative. After this lands, verified
-- severity is 100% and by_severity can back the cards. signal_band is deliberately left as an HONEST
-- PARTIAL — band (price/corporate/corridor) is a market-only concept, nulls on non-market surfaces are
-- correct, and the 35 null-band market items have no deterministic source; the band cards will render the
-- classified subset plus an honest "N unclassified" (operator ruling 2026-07-03, no spend).
--
-- DEPENDS ON surface_of() (migration 148) — orders after it; applies in the SAME supabase db push
-- (146 + 147 + 148 + 149). Idempotent: the WHERE severity IS NULL guard makes a re-run a no-op. Forward-
-- only data backfill (no down-migration). NOT YET APPLIED.

UPDATE intelligence_items
SET severity = lower(priority)
WHERE severity IS NULL
  AND priority IS NOT NULL
  AND surface_of(item_type, domain) IN ('regulations', 'operations');
