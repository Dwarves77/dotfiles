# MASTER systemic audit — every subsystem, line by line (2026-06-28)

READ-ONLY. Exhaustive deep read of the WHOLE codebase under the settled rule: **fetch OR compute whose
result is not used (discarded / written-where-nothing-reads / report-only / silently-errored) = BROKEN.**

## Coverage (provable, sweep-first)
13 deep readers, each enumerated its slice with `git ls-files` and attested every file read:
- API routes: 76 (worker+cron, admin, user/app) — all read
- lib: 109 (agent, sources, rest) — all read
- components: 173 (3 partitions) — all read
- workflows/stores/hooks: 8 — all read
- migrations: 137 (001-070, 071-137) — all read
- app pages/layouts: 22 — all read
**Total: 411 source files + 137 migrations, every line.**

## De-noising — corrections to earlier quick-grep passes (so we don't act on noise)
The fast walled-off sweep over-flagged; the deep reads corrected these. **Confirmed:**
- **q7-daily-recompute IS cron'd** (vercel.json nightly). An earlier reader checked only `.github/workflows`
  and called it "no cron" — wrong. It runs; it's broken a *different* way (wrong column).
- **Dead components = 8, not ~21.** Grep-confirmed dead: `explore/FilterBar`, `explore/SearchBar`,
  `explore/SortSelector`, `domains/FacilityOptimization`, `domains/RegionalIntelligence`,
  `domains/TechnologyTracker`, `home/DueThisQuarter`, `shell/StatStrip`. **TabBar, ExportBuilder,
  UrgencyFilterBar, and the market/* + resource/* components ARE mounted** (deep-read grep) — earlier "dead" claim withdrawn.
- **The legacy FSI tables (resources/briefings/changelog/disputes/cross_references/supersessions/timelines)
  were DROPPED in migration 013** — they are NOT stranded-present. Earlier "8 dead tables still present" withdrawn.
- **`get_market_intel_items` / `get_research_items` / `get_operations_items` / `get_technology_items` /
  `get_workspace_intelligence_*` are WIRED** via `runCategoryRpc(orgId,"<name>")` in supabase-server.ts.
  The "14 walled RPCs" claim was a literal-`.rpc()`-grep artifact — withdrawn.
- **`trust_score_*` is read** (supabase-server credibility builder) and **`source_trust_events` is read**
  (tier-override audit query). Not pure write-only — earlier claims corrected.

---

## CONFIRMED BROKEN — by class (deep-read, mostly CONFIRMED both sides)

### A. Fetch/compute without use — the "data not wired in" core
| # | Subsystem | Break | Status |
|---|---|---|---|
| A1 | **q7 convergence cron** | computes a tier, `.update({tier})` → 094 shim → `base_tier`; never writes `effective_tier`; 0 tier changes ever. Nightly compute into a void. | BROKEN |
| A2 | **check-sources** | Browserless-renders each source, uses `.status`, **discards body**; `change_detected` hardcoded false. | BROKEN *(disabled)* |
| A3 | **drain-first-fetch** | fetches body (api/rss/browserless), Haiku-extracts metadata, **discards body** (agent/run re-fetches). | BROKEN *(disabled)* |
| A4 | **spot-check** | renders+Haiku-classifies a sample; the verdict is **report-only, never applied** to the source. | BROKEN *(disabled)* |
| A5 | **B#2 citation stats** | pipeline writes `sources_used[]`; `get_source_citation_stats` (mig 098) reads the `intelligence_item_citations` edge table that **generation never writes**. Stats stale every brief. | BROKEN |
| A6 | **convergence engine** | `aggregateConvergence`→`effective_tier` only via the broken q7; the effective-tier divergence never lands. | BROKEN |

### B. Error-swallow (the line-37 class) — silent failures, CONFIRMED on live paths
| # | Site | What it silently breaks | Severity |
|---|---|---|---|
| B1 | **generate-brief.ts:116** | daily-spend query drops `error` → `DAILY_CAP_USD` cost cap **silently disabled** on any query failure | CRITICAL (cost) |
| B2 | **canonical-pipeline.ts:708** | sources-pagination drops `error` → incomplete resolver → **spurious NULL-stamps** (feeds the claims-tier/264 drift) | CRITICAL (correctness) |
| B3 | generate-brief.ts:70 | item fetch drops `error` → inserts null source_id/url silently | High |
| B4 | generate-brief.ts:388 | audit-gate-failure record result discarded → "fail-closed record" unverified (quarantine may lose its reason) | High |
| B5 | canonical-pipeline.ts:402/481/587/609/625/648 | item/pool reads + claim insert drop `error` → silent empty-pool / lost claims while step reports ok | Med-High |
| B6 | source-growth.ts:95 | duplicate-source check uses substring `ilike('%host%')` → false-positive "exists" → silent drop/mis-link | Med |
| B7 | source-growth.ts:168 | convergence reads drop `error` → wrong metrics written | Med |
| B8 | scan/route.ts:114 | existing-items query drops `error` → **all regs treated as new** (duplicate staging); :227 JSON parse uncaught | Med |
| B9 | spot-check:390 | forensic audit-log insert swallowed (`.then(()=>x,()=>x)`) | Low-Med |
| B10 | invitations/mine:34 | getUserById error → returns empty invitation list silently | Med |
| B11 | profile/NotificationPreferences.tsx:175 | empty `.catch()` on upsert → save fails with no user feedback | Med |
| — | AdminDashboard:183, map/market/operations soft-fails, pause.ts | **intentional** documented fail-open — NOT bugs | OK |

*(NEEDS-CONFIRM: an earlier reader flagged `orgs/[org_id]/members` + `workspace/overrides` auth-gate swallows;
the deep user-routes read returned them CLEAN. Down-weighted pending a targeted re-read.)*

### C. Dead / unwired (confirmed by grep, both sides read)
- **8 components** (listed above) + the `showDueThisQuarter` setting whose consumer (`DueThisQuarter`) is dead = write-without-read.
- **trust.ts**: `evaluatePromotion`, `evaluateDemotion`, `evaluateProvisionalSource`, `computeConflictResolutionImpact`, `computeCitationComponentFromRows` — dead exports (Q7 promotion/demotion spec, never called; the live path is inert anyway).
- **briefing/systemPrompt.ts** `buildBriefingSystemPrompt`; **agent/source-pool.ts** `buildSourcePool` (retired); **format.ts** (3 fns); **hooks** `useScrollToResource`; **workspaceStore** `setJurisdictionWeights`/`setSectorWeights`.
- **Routes with no trigger/caller**: `worker/reconcile` (+ `lib/sources/reconcile.ts` writers dormant), `admin/sources/discover`, `admin/sources/verify`, `admin/sources/recently-auto-approved`, `notifications/trigger`.
- *(Corrected: `extract-research-sections`/`auditSections` ARE reached via the format-spec dispatch — not dead.)*

### D. Stranded schema (DB side of "built but unused")
- **`monitoring_queue.change_detected`** (always false) + **`monitoring_queue.reconciled_at`** (mig 124, never read) — the dead change-detection/reconcile contract.
- **`intelligence_item_citations`** — backfilled once, generation never writes it (the A5 break).
- **`theme_candidate`** — write-only (intentional Emergence-Capture residual; follow-on unbuilt).
- **Migration-007 "community vision" layer** — `forum_sections/forum_threads/forum_replies/vendors/
  vendor_*/case_studies/case_study_endorsements` (10 tables) + ~19 profile cols + notification infra:
  zero readers in src (superseded by the live `community_groups/community_posts/community_group_members`
  system, which IS wired). Large stranded surface — likely an abandoned Phase-1 vision. *(NEEDS product call.)*

### E. Routing mismatches (writer col A ≠ reader col B)
- q7 `tier` vs readers `effective_tier` (A1). • `sources_used[]` vs citation-stats edge table (A5).
- *(NEEDS-CONFIRM: `/regulations` uses `getListingsOnly()` slim payload — verify `RegulationsSurface` doesn't read a field the slim set omits.)*

### F. The biggest absence — no automated content-freshness loop (corpus is manual-only)
check-sources (change signal hardcoded off, body discarded) + monitoring_queue (consumer filters
`change_detected=true`, never true) + reconcile (no trigger) + drain (onboarding only) + scan→staged_updates
(manual approval) + no regen cron ⇒ **nothing re-grounds a brief when source content changes.** The corpus
is only ever as fresh as manual `/api/agent/run`. This IS the session-long staleness, root-caused.

---

## THE COUNT (act-on-data mechanisms)
- **Scheduled jobs: 7 total → 3 work** (data-audit-lane, trust-recompute, discipline/bug-class CI) **/ 4 broken** (q7, check-sources, drain, spot-check).
- **Fetch paths: ~6 broken** (all automated/worker; operator-initiated generation fetches are wired).
- **Compute stranded: ~4** (q7, B#2, monitoring_queue, theme_candidate).
- **Error-swallows: ~11 real** (2 critical: cost-cap + NULL-stamp), excluding intentional fail-opens.
- **Dead code: 8 components + ~10 functions/hooks/store-actions + 5 unwired routes + ~12 stranded schema objects/tables.**
- **Freshness loop: 0 (does not exist).**
- **WORKS (verified end-to-end):** the customer read path (pages → `get_*_items`/listings RPCs → surfaces),
  the operator-initiated generation pipeline (generate→register→section→ground→grow → stored brief, modulo
  the swallows above), provenance gating, Layer-C audit-gate teeth, admin review surfaces, community
  groups/posts, the trust-score render chain. The *interactive/read* product is largely wired; the
  *automated/background* layer is where the breakage concentrates.

## Honest scope assessment
This is a **systemic verification gap, not isolated breaks.** The signature is uniform: a mechanism's front
half runs (schedule fires, schema exists, function is called) while the back half is disconnected, and because
the output is unread **nothing errors** — so it was never caught. It concentrates in the **automated/background
tier** (crons, workers, the freshness loop, the convergence/citation compute, the cost/stamp swallows). The
**customer-facing read path and the operator-initiated generation path are mostly sound.** Roughly **half the
automated act-on-data mechanisms don't use their data**, and the single largest one — automated freshness — was
never built. The fix is structural (an end-to-end "output reaches a consumer" check + building the freshness
loop), plus a focused error-swallow sweep on the two critical sites (cost cap, NULL-stamp), not N cosmetic patches.

Remediation deferred per instruction — this is the scope map. Nothing was changed in this pass.
