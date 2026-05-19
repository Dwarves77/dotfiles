# Caro's Ledge Sprint 1 System Audit, 2026-05-18 post-PR-#122

**Date:** 2026-05-18
**Branch state at audit:** `feat/sprint-1-phase-5-implementation` at `f5e8728`
**Audit scope:** read-only verification across schema, code, data flow, /admin, docs, cross-cutting, customer-facing pages
**Method:** five parallel research agents (Sections A+C, B, D, E+F, G), synthesized
**Skill load:** `sprint-followups-discipline` and `environmental-policy-and-innovation` invoked per operator override of the SKILL's investigation-out-of-scope clause; OBS coverage table and DP compliance section included below

---

## Audit summary

**Overall state: INCONSISTENT.**

Sprint 1 core deliverables (PRs #119, #120, #121 merged; #122 open) are intact at the schema, code, docs, and PR-state layers. Two findings break the coherent label and warrant operator attention before any Phase 6 design dispatch: (1) `jurisdiction_iso` is empty on all 10 sampled most-recent `intelligence_items` rows despite Phase 5 workload A claiming to backfill 457 rows, and (2) the `integrity_flags` table is reported absent from the live schema by Section A while admin code (`IntegrityFlagsView`, `PlatformIntegrityFlagsView`) references it as a migration-048 table — one of the two reports must be wrong, and reconciliation is required before Phase 7 design proceeds since Phase 7 inherits the triage surface for this table.

---

## OBS coverage table (audit relevance)

Per the operator override, this audit applies the `sprint-followups-discipline` OBS coverage format. Every open OBS reviewed for audit-relevance; the audit DOES NOT remediate, it REPORTS.

| OBS | State | Audit decision | Cross-references | Audit relevance |
|---|---|---|---|---|
| OBS-1 | Cleared | NO ACTION | (none) | Schema check confirms migration 082 shipped (Section A). |
| OBS-2 | Open | DEFER | OBS-8 | Bounded; standalone Sprint 1 follow-up owner per OBS-8. |
| OBS-3 | Open | DEFER | (none) | Post-Sprint-1 candidate; out of audit scope. |
| OBS-4 | Implemented | NO ACTION | DP-1 | Migration 082 source_column tracking shipped. Phase 7 UI surface (still open) inherits DP-1. |
| OBS-5 | Open | DEFER | OBS-11 | Phase 5 used Option 1 (DISABLE TRIGGER bracket) per design; future trigger-pollution work deferred to migration 083 candidate if needed. |
| OBS-6 | Informational | NO ACTION | (none) | Q5 amendment history; CHECK constraint vocabulary confirmed (Section A). |
| OBS-7 | Open | DEFER | (none) | External dependency (counsel review); no audit action available. |
| OBS-8 | Deferred | NO ACTION | OBS-2 | Standalone Sprint 1 follow-up dispatch owner. |
| OBS-9 | Deferred | NO ACTION | OBS-14, OBS-15 | Sprint 2 owner; audit's general scan of `verification.ts` confirmed 75/55 thresholds intact. |
| OBS-10 | Open | DEFER | (none) | Post-Phase-7 monitoring; audit confirms no Phase 7 ship yet (Section D). |
| OBS-11 | Implemented | NO ACTION | OBS-12 | DISABLE/ENABLE bracket pattern landed in `phase-5-backfill.mjs` and `phase-5-rollback.mjs`. |
| OBS-12 | Implemented | NO ACTION | OBS-11 | Bulk SQL CTE canonical pattern at commit `30ba022`. |
| OBS-13 | Open | DEFER | OBS-14, DP-1 | Phase 7 design owner. Audit Section C surfaces a potentially BROADER finding than OBS-13's 5-row scope (see DRIFT-C.1); operator should decide whether DRIFT-C.1 is in OBS-13 scope or a new OBS. |
| OBS-14 | Open | DEFER | OBS-4, OBS-13, OBS-9, DP-1 | Phase 7 design owner. Audit confirms DP-1 violation in current `/admin` code (Section D). |
| OBS-15 | Open | DEFER | OBS-14, OBS-9, DP-1 | Phase 6 owner; Phase 7 consumer. Audit confirms gap empirically (Section C sample of 3 briefs: all cite homepages only). |
| OBS-16 | Reserved | NO ACTION | (none) | Carryforward placeholder. |

---

## DP compliance section

This audit produces no design or UI output, so DP-1 is not under test for THIS dispatch's own deliverable. The audit does verify DP-1's existing-state status in code (Section D), which is captured below for operator reference.

| DP | Compliance test | Result for THIS audit | Evidence |
|---|---|---|---|
| DP-1 (Single-Pane Operator Review) | Can the operator complete every related decision on a single item from one screen? | NOT APPLICABLE to audit deliverable (audit produces no operator surface). | The audit verified DP-1 STATUS in production code: the existing `/admin` route has a DP-1 violation today (4-tab workflow inside one component, see Section D). Phase 7 design will be subject to DP-1 binding. |

---

## Section A: Schema state findings

| Check | Status | Detail |
|---|---|---|
| Migrations 071-082 present | **PARTIAL FAIL** | 071, 072, 073, 074, 075, 076, 077, 079, 080, 081, 082 present in `supabase_migrations.schema_migrations`. **078 is missing.** No migrations beyond 082 (correct). |
| Public tables present (14 expected) | **PARTIAL FAIL** | 12 of 14 present. **Missing per query: `integrity_flags` and `recurring_spot_check_log`.** See Critical Finding #2 below for reconciliation with Section D evidence. Present: agent_runs, ingest_rejections, ingestion_control_log, intelligence_items, item_cross_references, item_supersessions, org_memberships, pending_jurisdiction_review, profiles, sources, system_state, workspace_settings. |
| Phase 5 snapshot tables (4 expected, 7-day retention to 2026-05-25) | PASS | `intelligence_items_pre_phase5`, `ingest_rejections_pre_phase5`, `pending_jurisdiction_review_pre_phase5`, `item_supersessions_pre_phase5` all present. |
| Migration 079 partial unique index | PASS | `intelligence_items_canonical_key_idx` UNIQUE on `(jurisdiction_iso, instrument_type, instrument_identifier) WHERE instrument_type IS NOT NULL AND instrument_identifier IS NOT NULL`. |
| RLS active on PJR and IR | PASS | `rowsecurity = true` on both. |
| Trigger `trg_intelligence_items_normalize_jurisdictions` | PASS | Present on `intelligence_items`; `tgenabled = 'O'` (origin / enabled). |
| `intelligence_items.instrument_type` 15-enum CHECK | PASS | 15 members confirmed: local_law, state_statute, national_regulation, federal_statute, federal_rule, federal_executive_order, eu_regulation, eu_directive, municipal_ordinance, agency_guidance, court_decision, industry_standard, market_signal, research_item, voluntary_initiative. |
| `item_supersessions.severity` CHECK includes 'replacement' | PASS | `CHECK (severity = ANY (ARRAY['major','minor','replacement']))`. |
| Column comments per migration 081 | PARTIAL | Comments confirmed on `ingest_rejections.rejection_reason`, `ingest_rejections.triage_action`, `pending_jurisdiction_review.resolution_value`, `pending_jurisdiction_review.source_column`. NOT VERIFIED for `integrity_flags` (table presence ambiguous, see Critical Finding #2). |

---

## Section C: Data flow integrity findings

| Check | Status | Detail |
|---|---|---|
| IR receiving new rows post pause-OFF (2026-05-18T18:16:54Z) | **NO new rows** | 0 rows in IR, PJR, or intelligence_items with timestamps after pause-OFF. Most recent IR: 2026-05-18T17:55:57Z (21 minutes before pause-OFF). Most recent PJR: 2026-05-17T18:44:41Z. Most recent intelligence_items: 2026-05-11T21:20:03Z. Interpretation: no new ingest has run since pause-OFF. Trigger-on-new-INSERT cannot be proven from post-pause activity; relies on pre-pause evidence. |
| Sample 10 most-recent `intelligence_items` | **PARTIAL DRIFT (CRITICAL)** | jurisdictions canonical arrays populated (e.g., `['GB','GB-ENG']`, `['CA','CA-ON']`, `['US-PA']`). **`jurisdiction_iso` is empty array on ALL 10 rows** despite tokens like `US-PA`, `CA-ON`, `GB-ENG` being parseable per migration 080's CASE. `instrument_type` and `instrument_identifier` NULL on all 10 (correct per Phase 6 not yet shipped). See Critical Finding #1 below. |
| OBS-15 brief citation gap | **CONFIRMED** | All 3 sampled briefs cite source HOMEPAGES, no article-level metadata. Brief `856166be` cites `fca.org.uk`. Brief `8cb6e73e` cites `https://www.eba.europa.eu/` only. Brief `bcd84403` cites "ESMA homepage" / "ESMA's published statement on its homepage." No DOI, authors, abstract, or publication date in any sampled brief. |
| `system_state.global_processing_paused` | PASS | `false`, `updated_at = 2026-05-18T18:16:54.751Z`. |
| Trigger fires on new INSERT/UPDATE | NOT VERIFIED post-pause | No post-pause rows to inspect. Trigger schema state OK (enabled). Observable output suggests the canonical ISO array may not populate as expected; see Critical Finding #1. |

---

## Section B: Code connectivity findings

| Check | Status | Detail |
|---|---|---|
| `verification.ts` 75/55 thresholds | PASS | `THRESHOLDS` at [fsi-app/src/lib/sources/verification.ts:255-260](fsi-app/src/lib/sources/verification.ts#L255-L260) with `AI_RELEVANCE_H: 75`, `AI_FREIGHT_H: 55`. Used at lines 604, 608, 633, 634. |
| classify-* scripts wired | NOT VERIFIED (pattern absent) | No files match the audit-brief's `classify-*.mjs` / `classify-*.ts` pattern. Closest analogues `backfill-classify-batch.mjs` and `backfill-classify-metadata-batch-1.mjs` target only `public.sources`, not migration-082 tables. Audit-brief pattern may be stale. |
| `haiku-classify.ts` wired | PARTIAL | [fsi-app/src/lib/llm/haiku-classify.ts](fsi-app/src/lib/llm/haiku-classify.ts) exports `haikuVerifyCandidate` (used by verification.ts:935). The companion `haikuClassify` export was removed 2026-05-11 (gravestone at lines 277-281). Production content-classification now uses [fsi-app/src/lib/llm/first-fetch-classify.ts](fsi-app/src/lib/llm/first-fetch-classify.ts) consumed by `/api/worker/drain-first-fetch`. Several `supabase/seed/*.mjs` and `scripts/*.mjs` carry inline classifier copies that do NOT import the shared module (drift risk: prompt rules can diverge). |
| `getAppData` `unstable_cache` pattern present and used | PASS | [fsi-app/src/lib/data.ts:101](fsi-app/src/lib/data.ts#L101); 60s TTL; tag `APP_DATA_TAG`. All target routes ride APP_DATA_TAG via sister fetchers (see route inventory below). |
| `next.config.ts` headers() PERF-1 + pilot | PASS | [fsi-app/next.config.ts:66-145](fsi-app/next.config.ts#L66-L145) matches PERF-1 spec exactly. All 7 PERF-1 entries present in expected order. Community pilot preserved at lines 135-143. `/admin`, `/login`, `/settings` not cached. Zero drift. |
| Admin chrome leaks (RC-1, pre-Phase-7) | CONFIRMED (expected) | `HomeSurface.tsx:236-252` unconditionally renders `HousekeepingSection` (Coverage gaps + Awaiting review) for every user. `DashboardCoverageGaps.tsx:36-121` unconditionally renders "Suggest a source" / "Add to registry" CTAs. `DashboardAwaitingReview.tsx:44-133` unconditionally renders "Open admin queue →" CTA when items > 0. Server-side fetcher `fetchAwaitingReview` gates via `isPlatformAdminInline` so non-admins see empty state; component itself has no gate. Expected pre-Phase-7. |
| `/admin/jurisdiction-queue` absent | PASS | No files; no references; Phase 7 not shipped. |

### `APP_DATA_TAG` consumer inventory

- `/` ([src/app/page.tsx:19-54](fsi-app/src/app/page.tsx#L19-L54)): `getAppData` + `getWorkspaceAggregates` + `getWatchlist` + `getCoverageGaps` + `getAwaitingReview`
- `/operations` ([src/app/operations/page.tsx:20-23](fsi-app/src/app/operations/page.tsx#L20-L23)): `getResourcesOnly` + `getScopedWorkspaceAggregates(OPERATIONS_SCOPE)`
- `/market` ([src/app/market/page.tsx:21](fsi-app/src/app/market/page.tsx#L21)): `getResourcesOnly` + `getScopedWorkspaceAggregates`
- `/regulations` ([src/app/regulations/page.tsx](fsi-app/src/app/regulations/page.tsx)): `getListingsOnly` + `cachedPlatformTotal`
- `/research` ([src/app/research/page.tsx:26-29](fsi-app/src/app/research/page.tsx#L26-L29)): `getResearchPipeline` + `getScopedWorkspaceAggregates(RESEARCH_SCOPE)`
- `/map` ([src/app/map/page.tsx:23-27](fsi-app/src/app/map/page.tsx#L23-L27)): `getListingsMapData` + `getCoverageGaps`

---

## Section D: /admin operator surfaces findings

| Check | Status | Detail |
|---|---|---|
| Admin route inventory | PASS | Exactly one file-based route: [fsi-app/src/app/admin/page.tsx](fsi-app/src/app/admin/page.tsx). No `(admin)` route group, no subroutes, no layout wrapper. |
| Each route renders without error | NOT VERIFIED | Requires live browser session against carosledge.com or local dev server with seeded test org. Imports resolve statically. |
| Workspace vs platform scope per route | **DRIFT (potential security finding)** | The single `/admin` route gates on inline `org_memberships.role IN ('owner','admin')` (workspace-scoped) but renders platform-wide data: all orgs via `OrganizationsTable`, all sources via `fetchSourceData(includeAdminOnly=true)`, platform `integrity_flags`. Banner copy says "you are looking at platform-wide controls," but the gate is workspace-derived. RLS may compensate at data layer but route-level gate does not match the surface's stated scope. **No `is_platform_admin` check is performed in the route file.** |
| Four-tab DP-1 violation workflow exists | CONFIRMED in code | The three (four) DP-1-example surfaces are tabs inside ONE route (`/admin`), switched via `setActiveTab(...)`. AdminTab union: `integrity-flags`, `platform-integrity-flags`, `sources`, `audit`. Same URL, same component, conditional bodies. DP-1 violation structurally present. |
| Zero references to IR/PJR in /admin | PASS | Zero matches for `ingest_rejections` or `pending_jurisdiction_review` in `src/app/admin/` or `src/components/admin/`. Matches only in migrations (080, 082) and throwaway scripts. Phase 7 jurisdiction triage UI absent as expected. |

### Additional /admin finding

- **Audit log tab is a reachable placeholder.** `activeTab === "audit"` renders a `ComingSoonBanner`. The tab appears in the strip (`count: 0`) but is navigable. Comment at `AdminDashboard.tsx:836`: "Workspace-wide audit log lands in Phase D... captured at the database level and will surface here once the audit_log read endpoint ships." Operator has a navigable affordance with no functional surface behind it.

---

## Section E: Documentation consistency findings

| Check | Status | Detail |
|---|---|---|
| `followups.md` OBS state matches branch reality | PASS | OBS-1 through OBS-16 reviewed; all state labels (cleared / implemented / open / deferred) internally consistent with branch reality and the prior turn-2 narrative. |
| `design-principles.md` present with DP-1 | PASS | [docs/design-principles.md](docs/design-principles.md) complete: DP-1 Single-Pane Operator Review with MUST language, binary compliance test, scope, out-of-scope, violation example, compliance example, cross-references, owners. No DP-2+ entries (correct; agent does not author without operator authorization). |
| Skills inventory | PASS | [fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md](fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md) present. [fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md](fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md) present. Global `~/.claude/skills/frontend-design/SKILL.md` present. |
| MEMORY.md index updated | PASS | 7 entries including `feedback_sprint_followups_loop_closure.md`. |
| Phase 1-5 design docs all present | PASS | All 9 expected files in `docs/sprint-1/`. |
| Unexpected sprint-1 docs (Phase 6+) | PASS | No phase-6/8/9/10/11 docs (correct per "Phase 5 of 11"). |

### Minor: `perf-1-design.md` classification question

[docs/sprint-1/perf-1-design.md](docs/sprint-1/perf-1-design.md) is present on disk but not in the operator's brief-listed expected set. PERF-1 shipped as PR #121; doc correlates. Recommend either adding `perf-*-design.md` to the expected-set definition or moving perf docs to a separate tree. Not OBS-worthy.

---

## Section F: Cross-cutting findings

| Check | Status | Detail |
|---|---|---|
| PR #119 merged | PASS | MERGED. "sprint-1/phase-4a: canonical-entity columns + jurisdiction vocab + admin signal docs + type drift". |
| PR #120 state | PASS (correction) | MERGED. "sprint-1/phase-4b: operator queue tables + rejected-token routing". Operator brief said "open"; audit confirms MERGED. No repo drift; brief wording drift only. |
| PR #121 merged | PASS | MERGED. "perf-1/cache-headers-browser-cache-only". |
| PR #122 open | PASS | OPEN. "sprint-1/phase-5: dedup transactions + jurisdictions/ISO backfill". |
| Branch HEAD ≥ f5e8728 | PASS | `f5e87284a9e06f534643525e305a7c1ab909b8a3` exactly. |
| No tracked-file WIP on feature branches | PASS | `git status --short` shows only untracked `??` entries (audit reports, tmp scripts, archive); zero `M`/`A`/`D`/`R` on tracked files. |
| Snapshot tables present | COVERED BY SECTION A | 4 of 4 snapshot tables intact; 7-day retention to 2026-05-25. |

### Recent commits (last 10)

```
f5e8728 sprint-1: DP-1 single-pane operator review (binding design principle)
4e05b55 sprint-1: sprint-followups-discipline skill for OBS loop closure
5cb450d Merge remote-tracking branch 'origin/master' into feat/sprint-1-phase-5-implementation
71666fe docs(followups): OBS-14 triage UI source metadata; OBS-15 brief article-level source context
b61306c sprint-1/phase-5-impl: turn-2 execute complete (workload A + B + EU); 3/4 gates PASS
30ba022 sprint-1/phase-5-impl: refactor backfill script (bulk SQL + session-mode pooler + batch=50) + OBS-11
f942916 sprint-1/phase-4b: operator queue tables + rejected-token routing (#120)
c820b25 docs(sprint-1): OBS-9 classifier loop Sprint 2 pre-decisions + OBS-10 drift monitoring
69ebd9d sprint-1/phase-5-impl: backfill script + verification sample pass + OBS-6/7/8 followups
a37af4c perf-1: content-aware browser cache headers on 7 read-heavy routes (#121)
```

---

## Section G: Customer-facing page health findings

| Route | Status | Detail |
|---|---|---|
| `/` | PASS (file-level) | [src/app/page.tsx](fsi-app/src/app/page.tsx). EditorialMasthead + DashboardHero + HomeSurface. AI bar intentionally absent (Phase D rule). |
| `/regulations` | PASS | [src/app/regulations/page.tsx](fsi-app/src/app/regulations/page.tsx). Masthead + DashboardHero + RegulationsSurface kanban. AI bar present. |
| `/regulations/[slug]` | PASS | [src/app/regulations/[slug]/page.tsx](fsi-app/src/app/regulations/[slug]/page.tsx). `notFound()` for missing items. UUID→slug redirect via service role. AI bar in RegulationDetailSurface. |
| `/research` | PASS | [src/app/research/page.tsx](fsi-app/src/app/research/page.tsx). ResearchView with pipeline rows. Coverage matrix tab hidden (stub deferred). AI bar present. |
| `/market` (canonical) | PASS | [src/app/market/page.tsx](fsi-app/src/app/market/page.tsx). MarketPage with two tabs. AI bar present. No `/market-intel` route exists. |
| `/operations` | PASS | [src/app/operations/page.tsx](fsi-app/src/app/operations/page.tsx). OperationsPage with juris/facility tabs. AI bar present. |
| `/map` | PASS | [src/app/map/page.tsx](fsi-app/src/app/map/page.tsx). MapPageView with Leaflet + side rail. AI bar present. |

### Known-issue findings

- **Market Intel "Watch this week" alerts.** SideCard at `MarketPage.tsx:368-384` renders `{watchCount + elevatedCount}` followed by "alerts" (data-driven, not hard-coded; the "8" varies with workspace data). **Clickthrough wiring BROKEN**: SideCard is a static `<div>` with no `onClick`, no `<Link>`, no `href`. The summary text below names categories but provides no navigation. Classification: missing UI component (the card is not interactive). Live count NOT VERIFIED.
- **Operations "Not yet ingested" attribution.** Three render sites in `OperationsPage.tsx`:
  - L617 `EmptyJurisdiction`: triggered when `regions.length === 0` (no `regional_data` for filter). **Coverage gap.**
  - L446-450 `ComingSoonBanner` "Phase D": triggered when an open region exists but `chips.every(c => c.items.length === 0)`. **Wiring gap masquerading as coverage gap.** The region has items but none of the 5 chip regex matchers (Solar, Electricity, Labor, EV Charging, Green Building) caught them. Real ingested items slot nowhere visible. Recommend an "Uncategorized" fallback chip OR relax matchers.
  - L673 `FacilityPanel` zero-state: triggered when no `domain=6` rows. **Coverage gap.**
- **Research citation linking.** WeeklyBriefing.tsx L182-211 wraps top-5 item titles in `<Link href={'/regulations/${r.id}'}>` ✅. ResearchView pipeline rows (`PipelineRow` L890) link titles correctly ✅. However ResearchView `publishedThisWeek` callout list (L546-552) renders titles as `<b>` text WITHOUT `<Link>` ❌. NOT VERIFIED whether brief BODY markdown (`intelligence_items.full_brief`) contains inline regulation references with links.
- **AI query bar.** Present on /regulations, /regulations/[slug], /market, /operations, /research, /map. Absent on / by design. Submission dispatches `CustomEvent("open-ask-assistant")` listened by `AskAssistant.tsx` mounted globally via `AppShell.tsx:94`. Live submit/response NOT VERIFIED.

### General scan findings

- **Empty states without remediation CTAs:** MarketPage EmptyState (L766-781), OperationsPage EmptyJurisdiction (L604-624) + FacilityPanel (L662-679) + ComingSoonBanner (L784-820), MapPageView "Coverage snapshot unavailable" (L526-534), /research "No items match the current filters". Pattern-level UI debt.
- **Dead-text regulation references:** ResearchView `publishedThisWeek` callout list (titles as `<b>` only).
- **Internal language exposed to end-users:** /market EmptyState body mentions "the worker writes item_type = 'X' records". Violates the `environmental-policy-and-innovation` workspace-anchored rule.
- **Broken navigation:** None detected. All `NAV_ITEMS` href targets resolve.

---

## Critical findings

### Critical #1: `jurisdiction_iso` empty on all 10 sampled most-recent rows

**Observation.** The 10 most-recent `intelligence_items` rows (by `created_at`, all from 2026-05-11 or earlier) show non-empty `jurisdictions` arrays containing parseable ISO 3166-1 / 3166-2 tokens (e.g., `['US-PA']`, `['CA','CA-ON']`, `['GB','GB-ENG']`) but **`jurisdiction_iso` is empty array on all 10 rows**.

**Why this is critical.** Phase 5 workload A claimed to backfill 457 ISO-empty rows on 2026-05-18. Per the Phase 5 design and the post-flight report (3/4 gates PASS), these rows should have `jurisdiction_iso` populated by the trigger's migration-080 CASE. The sampled rows are from BEFORE Phase 5 ran (created 2026-05-11 or earlier), so they were eligible for the backfill. Either:

1. The Phase 5 backfill UPDATEs did not persist for these rows (UPDATE never ran on them, or UPDATE ran but the trigger-disabled re-route did not write `jurisdiction_iso`).
2. The trigger's CASE in migration 080 has a path that produces empty `jurisdiction_iso` for inputs the audit assumes should populate it (e.g., subdivision-only tokens like `US-PA` may correctly route to `jurisdictions[]` but the parent country `US` is not auto-derived for `jurisdiction_iso`).
3. The 10 sampled rows are NOT in the 457 Phase 5 target set (e.g., Phase 5 scope was tighter than expected and these rows fell outside it).
4. Phase 5 ran but a later mutation reset `jurisdiction_iso` back to `[]`.
5. The sample query targeted a column that does not reflect the live state (audit script bug, unlikely given the consistency of result).

**What it means.** Until reconciled, the Phase 5 "457 rows backfilled" claim cannot be confirmed at the post-state observable level for these specific rows. OBS-13 documented a known 5-row failure (all-rejected token sets); this finding looks BROADER than OBS-13 (parseable tokens, not rejected ones). The operator should decide whether this is in OBS-13 scope or a new OBS.

**Recommended remediation (operator decides).**
- Investigation dispatch: run the Phase 5 design's gate 7.2a query against the full table, breakdown by (a) Phase-5-touched, (b) parseable tokens present, (c) `jurisdiction_iso` empty. If the count is materially larger than the documented 5, the Phase 5 post-flight needs revisit.
- Cross-check migration 080's CASE: verify the function handles subdivision-only token sets (e.g., `['US-PA']` alone, no parent `US` token).
- Decide OBS-13 expansion vs new OBS.

### Critical #2: `integrity_flags` and `recurring_spot_check_log` reconciliation

**Observation.** Section A's `information_schema.tables` query reports `integrity_flags` and `recurring_spot_check_log` ABSENT from `public` schema. Section D shows admin code (`IntegrityFlagsView.tsx`, `PlatformIntegrityFlagsView.tsx`) referencing the migration-048 `integrity_flags` table. Both reports cannot be correct.

**Why this is critical.** If the table is genuinely absent, the admin views will fail at runtime when an admin opens the integrity-flags tab. If the table is present and Section A's query was wrong (e.g., wrong schema, wrong query shape), the audit's schema-state confidence is degraded but the system is fine.

**Most likely explanations (in order of probability).**
1. Tables exist but in a schema other than `public` (e.g., `private`, app schema, or with a non-standard name). Section A's query was scoped to `public`.
2. Tables exist in `public` but Section A's `information_schema` query has a subtle filter that missed them.
3. Tables genuinely absent, admin views are dead code waiting on a never-shipped migration.
4. Migration 048 was rolled back at some point and the admin code was not removed.

**Recommended remediation (operator decides).**
- 5-minute investigation: run `SELECT schemaname, tablename FROM pg_tables WHERE tablename IN ('integrity_flags', 'recurring_spot_check_log');` from the live DB. Definitive answer.
- If absent and admin views reference them: hot fix or scope to Phase 7 cleanup.
- If present in non-public schema: update the audit script's expected-set definition.
- If migration 048 was rolled back: open new OBS documenting the rollback.

---

## Consolidated drift findings

| ID | Where | Intended state | Actual state | Recommended remediation |
|---|---|---|---|---|
| DRIFT-A.1 | Schema migrations | 071-082 contiguous | 078 missing | Investigate migration history (5 min). Either restore 078 or document the gap. |
| DRIFT-A.2 | Schema tables | `integrity_flags` present | Section A says absent; Section D shows code refs | See Critical Finding #2. |
| DRIFT-A.3 | Schema tables | `recurring_spot_check_log` present | Section A says absent | See Critical Finding #2. |
| DRIFT-C.1 | Data flow | `jurisdiction_iso` populated for rows with parseable tokens | Empty on all 10 sampled most-recent rows | See Critical Finding #1. |
| DRIFT-C.2 | Ingest activity | New ingest writes IR/PJR | Zero ingest activity since pause-OFF (22 minutes elapsed at audit time) | Either scheduler is idle / not yet picked up the unpause, or scheduler is paused at a higher layer. Investigation in a separate dispatch. |
| DRIFT-C.3 | Brief generation | Article-level source metadata | All sampled briefs cite homepages only | OBS-15 confirmed empirically. Phase 6 owner. |
| DRIFT-B.1 | Classify scripts | classify-* files exist | Audit-brief pattern matches no files | Audit-brief pattern likely stale; clarify the intended file set. |
| DRIFT-B.2 | Classifier code path | Single shared classifier module | `haikuClassify` removed; seed scripts carry inline copies | Watch for prompt-rule drift; not OBS-worthy today. |
| DRIFT-D.1 | `/admin` route gate | Platform-scoped gate matching the platform-scoped surface | Workspace-membership gate, platform-scoped surface (potential security finding) | Phase 7 admin chrome scope. Verify RLS compensates; if not, hot fix. |
| DRIFT-D.2 | `/admin` audit tab | Either implemented or hidden | Navigable placeholder (ComingSoonBanner) | Either hide the tab until audit_log read endpoint ships or implement minimal view. |
| DRIFT-G.1 | /market alerts card | Click-through to filtered view | Non-interactive `<div>` | Wire as button or Link. Small UI follow-up. |
| DRIFT-G.2 | /operations chip matchers | Real ingested items slot into chips | When chip regex misses, items invisible; banner mis-attributes as coverage gap | Phase 6 ingest wiring or matcher relaxation. |
| DRIFT-G.3 | /research publishedThisWeek callout | Titles as `<Link>` | Titles as `<b>` text only | Small UI follow-up. |
| DRIFT-G.4 | Customer-facing empty states | CTAs on all empty states | Multiple pages lack CTAs | Pattern-level UI debt; separate UI follow-up. |
| DRIFT-G.5 | /market EmptyState copy | Workspace-anchored copy | Exposes internal worker language ("the worker writes item_type") | Violates environmental-policy-and-innovation workspace-anchored rule. Copy follow-up. |

---

## Recommended new OBS (operator authorizes additions in a separate dispatch)

The audit does not add OBS entries. Recommendations for operator review:

- **REC-OBS-A: Migration 078 authorship/rollback gap.** Either authored and never applied, never authored, or applied then rolled back. Schema continuity affects future migration confidence. *Owner suggestion: investigation dispatch.*
- **REC-OBS-B: `integrity_flags` and `recurring_spot_check_log` reconciliation.** See Critical Finding #2. *Owner suggestion: 5-minute investigation; result determines next steps.*
- **REC-OBS-C: `jurisdiction_iso` empty on rows Phase 5 should have populated.** See Critical Finding #1. *Owner suggestion: targeted Phase 5 post-flight expansion query; if confirmed broader than OBS-13's 5 rows, opens new OBS or expands OBS-13.*
- **REC-OBS-D: `/admin` route gate scope mismatch.** Workspace-membership gate, platform-scoped surface. Potential security finding pending RLS-compensation verification. *Owner suggestion: Phase 7 admin chrome OR hotfix if RLS does not compensate.*
- **REC-OBS-E: `/admin` audit log tab is reachable placeholder.** Operator-visible affordance with no functional surface. *Owner suggestion: Phase 7 (hide or implement).*
- **REC-OBS-F: Ingest scheduler idle since pause-OFF.** 22+ minutes with no writes. May be schedule timing, may be a higher-layer pause. *Owner suggestion: investigation in a separate dispatch.*
- **REC-OBS-G: /market "Watch this week" alert card non-interactive.** *Owner suggestion: Phase 7 UI or small follow-up.*
- **REC-OBS-H: /operations region-level "Coming soon Phase D" banner mis-attributes wiring gap as coverage gap.** *Owner suggestion: Phase 6 ingest wiring.*
- **REC-OBS-I: /research publishedThisWeek callout titles rendered as `<b>` not Links.** *Owner suggestion: small UI follow-up.*
- **REC-OBS-J: Customer-facing empty states lack remediation CTAs across multiple pages.** *Owner suggestion: pattern-level UI debt; separate follow-up.*
- **REC-OBS-K: /market EmptyState exposes internal worker-language to end users.** Violates workspace-anchored rule. *Owner suggestion: copy follow-up.*
- **REC-OBS-L: `haiku-classify` seed-script inline copies risk prompt-rule drift from shared classifier path.** *Owner suggestion: watch, not open today.*

---

## Customer-facing value gaps

| Route | Issue | Likely cause | Remediation owner |
|---|---|---|---|
| /market | "Watch this week" alerts card non-interactive | Wiring/UI | Phase 7 UI or separate small follow-up |
| /operations | Region-level "Coming soon Phase D" banner fires when items exist but match no chip regex | Wiring | Phase 6 ingest wiring (or matcher relaxation) |
| /operations | Multiple empty states lack remediation CTAs | UI | Separate UI follow-up |
| /research | `publishedThisWeek` callout titles rendered as `<b>` not Links | UI | Separate UI follow-up |
| /research | Source coverage matrix stub deferred | Coverage | Phase 6 or later (per code comment "ETA Phase D") |
| /market | EmptyState body exposes internal worker language | UI/copy (skill violation) | Separate copy follow-up |
| Multiple | Live alert count, AI submit behavior, brief content link inlining | Verification requires running app | NOT VERIFIED |

---

## Phase 6 design readiness

**Verdict: NOT READY without operator decision on Critical Findings #1 and #2.**

**Reasoning.** Phase 6 design dispatches will inherit the schema state Phase 5 leaves behind. If `jurisdiction_iso` is broadly empty on rows the trigger should populate (Critical #1), Phase 6 ingest wiring inherits a write path that may not produce expected canonical arrays, and the Phase 6 design will have no clean foundation to specify behavior against. If `integrity_flags` table is genuinely absent (Critical #2), the Phase 6 brief-generation work has no surface to write integrity flags to during ingest, which propagates into Phase 7 as a missing dependency.

**What should land first (in priority order):**

1. **5-minute investigation: `integrity_flags` table actual location.** `SELECT schemaname, tablename FROM pg_tables WHERE tablename IN ('integrity_flags', 'recurring_spot_check_log');`. Operator can run or dispatch.
2. **Targeted investigation: `jurisdiction_iso` empty on parseable-token rows.** Reproduce Section C's finding at scale (all rows, not just 10). If the count is materially larger than OBS-13's 5 rows, decide whether to expand OBS-13 scope or open a new OBS BEFORE Phase 6 design.
3. **5-minute investigation: migration 078 authorship/rollback.** Either fix the gap or document why it exists.
4. **Decide: `/admin` route gate scope.** Verify RLS compensation; if not, hotfix BEFORE Phase 7 design (security finding takes precedence over chrome design ergonomics).
5. **Decide: ingest scheduler state.** Confirm scheduler has picked up the unpause; if not, separate investigation.

**What Phase 6 design CAN proceed on without remediation.** Brief-generation scope per OBS-15 (article-level source context), the integrity rule from `environmental-policy-and-innovation`, and the Phase 6 / Phase 7 ownership split documented in OBS-15. These can be designed in parallel with the above investigations as long as the design accommodates whatever findings the investigations produce.

---

## Audit conclusion

Sprint 1 has shipped substantive infrastructure (PRs #119, #120, #121 merged; #122 open for review). The architectural patterns established this sprint (DP-1 single-pane operator review, sprint-followups-discipline OBS loop closure, OBS-12 bulk SQL CTE canonical, OBS-11 trigger-bracket rollback safety) are intact across code and docs.

Two findings break the COHERENT label: (1) `jurisdiction_iso` empty on rows Phase 5 should have populated, and (2) the `integrity_flags` table reconciliation question. Both are small investigations (5 to 30 minutes each) and once resolved, Phase 6 design can proceed.

The remaining drift findings are either expected pre-Phase-7 state (RC-1 admin leaks, no jurisdiction triage queue, audit log placeholder), customer-facing UI debt for separate small follow-ups (alerts card, empty state CTAs, publishedThisWeek links, /market copy), or minor doc-classification questions (perf-1-design.md not in the listed expected set).

This audit reports findings only. Operator authorizes any new OBS additions, remediation dispatches, or Phase 6 design dispatch in a separate message.
