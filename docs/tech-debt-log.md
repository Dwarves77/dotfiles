# Tech Debt Log

Ongoing register of known tech debt that is currently safe (no production breakage, no data corruption risk) but should be addressed in a future pass. Each entry includes the safety net keeping it benign, the cost of leaving it, and a rough remediation sketch.

Format: newest entries at the top.

---

## 2026-07-12 — migration-135 source-archive guard is host-level, target is institutionKey-level

**Safety net:** The `_guard_source_archive()` trigger (migration `135_source_registration_guard.sql`) prevents archiving an `intelligence_items` row with a source-y `archive_reason` unless an **active source at the same host** exists. It is host-level (`_url_host(s.url) = _url_host(NEW.source_url)`), matching the pre-#292 host-keyed `registerSource`.

**Divergence:** PR #292 (`4f8809a`) made `registerSource` dedup **institution-level** for shared-government portals via `institutionKey()` (host + path prefix for `SHARED_PORTAL_KEYDEPTH` hosts). The DB archive guard was NOT aligned — it still checks host-level. So on a shared portal, archiving `gob.mx/economia` as a source-y reason passes the guard as long as ANY active `gob.mx` source exists (e.g. `gob.mx/semarnat`), even though the specific institution differs.

**Cost of leaving:** Low. The guard's invariant ("don't archive-as-source without SOME registered source at the host") still holds; it is merely weaker than the registration layer. Real archives go through `reclassifyToSource` (register-then-archive), which now keys institution-level, so the mismatch only matters for a hand-rolled archive on a shared-portal host where a sibling institution is registered but the exact one is not.

**Remediation sketch:** Follow-on migration that swaps `_url_host()` for an `institution_key()` SQL function mirroring `db.mjs institutionKey()` (same `SHARED_PORTAL_KEYDEPTH` table + path-prefix logic), so the DB guard and the JS registration layer agree. Author with a fire-test (archive on a shared portal where only a sibling institution is registered must RAISE). Reference: PR #292, `scripts/lib/db.mjs institutionKey`.

**Priority:** Low (registration layer is the load-bearing dedup; guard is a backstop).

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
