# Tech Debt Log

Ongoing register of known tech debt that is currently safe (no production breakage, no data corruption risk) but should be addressed in a future pass. Each entry includes the safety net keeping it benign, the cost of leaving it, and a rough remediation sketch.

Format: newest entries at the top.

---

## 2026-07-13 — archived rows retain last-live provenance_status (no terminal 'archived' status) — the root of the count ambiguity

**Defect (schema semantics):** `is_archived` (boolean) and `provenance_status` (enum) are orthogonal columns. When an item is archived, `is_archived` flips to `true` but `provenance_status` is **left at its last-live value**. So there are currently **160 rows with `is_archived=true AND provenance_status='quarantined'`** — archived items still carrying a live-status label. A count on `provenance_status` alone (status-only) therefore includes archived rows: the status-only quarantined total is `197 = 37 live + 160 archived`, while the live backlog is `37`. This is the **root cause of the count ambiguity** that produced, in one week, a ~5x understatement and a ~5x overstatement (see ADR-013, the 197→37 drift-reconciliation).

**Safety net (why it is benign today):**
- The disposition audit (`scripts/verify/quarantine-disposition-audit.mjs`) already filters `is_archived=false`, so the live-backlog invariant is measured correctly.
- Customer-read surfaces gate on `provenance_status='verified'` **and** exclude archived rows, so no customer count is wrong.
- The `report-states-quarantine-scope` **doctrine** (tightened in #297) now requires every population count to state its archival predicate (live-only vs status-only), so the ambiguity is **labeled** at report time.
- The retained last-live status is arguably useful provenance ("what state was this in when archived") and `archive_reason` records why it left.

**Cost of leaving:** The doctrine makes the ambiguity **visible** but does not **remove** it. Every ad-hoc `provenance_status` count remains a labeling hazard — a future query that forgets the `is_archived=false` predicate silently over-counts by the archived population (currently 160, and growing as more items are archived). It is a standing foot-gun, not a live correctness bug.

**Remediation sketch (schema-semantics decision, migration implications):** Decide between —
1. **Terminal status** — add an `'archived'` value to the `provenance_status` enum and set it on archive. Cleanest for counting, but LOSES the last-live status unless it is preserved elsewhere (e.g. a new `last_live_provenance_status` column or reconstructable from `archive_reason` + history). Touches the `set_provenance_status` trigger, `validate_item_provenance`, every customer-read RPC, and the disposition audit.
2. **Keep two columns, remove the counting hazard structurally** — a generated/view column `live_provenance_status` that is `NULL` when `is_archived`, and route all counts through it; or a canonical `live_quarantine` view. Lower blast radius, preserves last-live status, but adds a surface to keep consistent.

Either path is a migration + consumer sweep (enum change or view/column + every counter). Pick at a housekeeping window; author with a fire-test (a status-only count must NOT change the live-backlog number). Motivating reference: ADR-013 (197→37 reconciliation, 2026-07-13); the 160 archived-quarantined rows are the concrete instance.

**Priority:** Low-Medium (benign today via the audit's predicate + the doctrine label; the structural fix removes a recurring query foot-gun rather than fixing a live break).

---

## 2026-07-13 — source-tooling fetch layer not yet snapshot-first (grounding-acquisition is)

**Scope ruling (operator, snapshot-first rebuild):** The snapshot-first pipeline (snapshot lookup → freshness probe → $0 cheap-verify → LOCKED paid acquire) governs **grounding acquisition only** — the generation/grounding path through `verify-item` / `canonical-pipeline`. The ~20 **source-tooling fetchers** (verification.ts, recommend-source-tier.ts, the fetch-now / bulk-import / spot-check / check-sources / drain-first-fetch routes, and `spot-check/recurring`) were deliberately left OUT of scope: they are already governed by the F16 transport-hold gate (`SCRAPE_HOLD`) and are not the $65 re-fetch-what-we-have waste class the rebuild targets.

**Safety net:** F16 (`assertFetchAllowed` at the single `canonical-fetch.mjs::browserlessFetch` primitive) still gates every one of those fetchers — a held scrape blocks them all. The frozen source-monitoring + spot-check crons mean none of them run unattended today. Browserless spend from this layer is bounded by the Browserless unit budget, not the (frozen) Anthropic monthly ceiling.

**Cost of leaving:** Unknown until measured. These fetchers can re-fetch source content the `raw_fetches` snapshot store already holds (the same disconnect the grounding path had), so there may be avoidable Browserless spend here. It is NOT model spend and NOT the July-ceiling waste, so it was correctly deprioritized.

**Trigger to address:** the Phase-2 spend gauge (or a Browserless-unit report) shows source-tooling fetch as a real, non-trivial line of spend. At that point: route these fetchers through the same snapshot-store read (getSnapshot → freshness probe → reuse stored body when fresh) before a paid Browserless fetch, mirroring the grounding-side snapshot-first order. Reference: `src/lib/sources/snapshot-store.mjs`, `freshness-probe.mjs`; the grounding-side wiring in `src/workflows/generate-brief.ts::groundStep` is the pattern.

**Priority:** Low-Medium (deferred by design; revisit on the gauge signal, not speculatively).

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

## 2026-07-16 — version-out consolidation (executor-universality ruling)
`scripts/_reground/drain-clear.mjs` replicates `eraseClaimWithProof`'s fail-closed archive-then-delete through the guarded path (`guardedInsert` claim_versions → `guardedDelete` section_claim_provenance) because `eraseClaimWithProof` (src/lib/agent/ledger-apply.mjs) uses the raw supabase builder API and db.mjs deliberately does not export a write client (the only write surface is the guarded functions). Two version-out implementations exist long-term. POST-DRAIN CONSOLIDATION (operator flagged 2026-07-16): unify to ONE shared implementation in ledger-apply.mjs that both the pipeline and scripts call with their appropriate client (inject the write ops as deps, or a single erase entry point), so the hold-loop and any future eraser inherit the identical fail-closed logic. The DB-layer migration-209 DELETE trigger already covers status-recompute for all writers by construction.

---

## 2026-07-22 — GUARD-1 pool INSERT payload size (ADR-016 residual, accepted fail-loud)

**Context:** ADR-016 removed the storage-side fetch caps, so `agent_run_searches.result_content_excerpt` can now hold a full document up to `STORAGE_MAX_CHARS` (10M, the pathological-page sanity ceiling). The GUARD-1 all-or-nothing pool persist in `src/lib/agent/canonical-pipeline.ts` (`generateBrief` + `generateBriefRefreshPrimary`) is a single batched INSERT.

**Accepted residual (operator ruling on PR #371, 2026-07-22):** No code change. Supabase publishes no fixed REST request-body byte limit; the constraining layer is the upstream API gateway and cannot be tested under the write-freeze. A single 10M-char row is ~10MB and passes with wide margin; only a pathological coincidence of many multi-MB captures in ONE item's pool would approach the gateway limit. The failure path is already FAIL-LOUD, not silent: an INSERT rejection returns `generate_failed` with no brief written and no partial pool (a clean retry, never a fragment). An RPC-per-row transaction would preserve atomicity but does NOT reduce request-body size, so it does not by itself solve a gateway-size rejection.

**Trigger condition (build then, not before):** if a pool persist ever fails on payload size, build RPC-transaction chunking then — a server-side function that accepts the pool rows and does DELETE + per-row INSERT inside one transaction, paired with client-side chunking of the request body under the then-measured gateway limit, preserving GUARD-1 atomicity.

**Priority:** Low (fail-loud today; realistic document sizes never trigger it).
