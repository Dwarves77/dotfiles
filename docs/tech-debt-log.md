# Tech Debt Log

Ongoing register of known tech debt that is currently safe (no production breakage, no data corruption risk) but should be addressed in a future pass. Each entry includes the safety net keeping it benign, the cost of leaving it, and a rough remediation sketch.

Format: newest entries at the top.

---

## 2026-05-12 — jurisdiction normalizer not called at app layer for two write paths

**Safety net:** Migration 072 installed a `BEFORE INSERT OR UPDATE OF jurisdictions, jurisdiction_iso` trigger on `intelligence_items` that runs `_normalize_jurisdictions()` on writes. Both paths below produce output that passes through the trigger before hitting disk, so values are normalized regardless.

**Paths:**

1. `fsi-app/supabase/seed/W4_3_materialize_orphans.mjs:197-203` — staged_updates materializer pipes `proposed_changes.jurisdictions` verbatim into `intelligence_items.jurisdictions`. App-layer call to the normalizer would short-circuit double-work in the trigger and make the data shape predictable at write site.

2. `fsi-app/supabase/seed/W4_1_iso_backfill.mjs:345` — `deriveJurisdictionISO()` writes only to `jurisdiction_iso` from URL host + content inference. Already produces canonical ISO so trigger is a no-op for it, but the path doesn't call the shared normalizer, so any future divergence in `_normalize_jurisdictions` semantics would not be reflected here.

**Cost of leaving:** Trigger work doubles for path 1 (computes the same result twice). Path 2 risks silent divergence if the normalizer evolves.

**Remediation sketch:** Extract `_normalize_jurisdictions` SQL function logic into a thin JS helper (or call the SQL function directly via RPC) and have both write paths invoke it before the INSERT/UPDATE. Defer until after the migration consolidation policy is in place — the consolidation may reveal a cleaner home for shared write-path helpers.

**Priority:** Low (trigger is the load-bearing safety net).

---
