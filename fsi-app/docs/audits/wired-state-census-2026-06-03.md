# Wired-State Census — fsi-app — 2026-06-03 (READ-ONLY)

Authoritative map of what is wired vs unwired across the project. Collected directly from schema (`information_schema`, `pg_catalog`), filesystem (`find`/`rg`), and live row counts — **not** from CLAUDE.md or prior docs (which drift). Row count is truth; where a `.from().insert` grep found nothing but rows exist, the real writer (raw `pg`/`INSERT INTO`/trigger/migration) was located and cited, never marked "none."

Inputs: `supabase-cell-inventory-2026-06-03.md` (79 tables/1090 cols), `_census-triggers-functions.txt` (38 triggers / 160 functions), `_census-table-linkage.txt` (per-table writer/reader file:line), plus the prior reconciliation audit + insert-path + plumbing investigations.

Scope counts: **79 tables**, **31 app triggers** (+7 Supabase-system), **~40 app RPCs** (+ ~120 ltree/pg_trgm extension fns), **5 cron workflows**, **75 API routes**, **23 page surfaces** + 3 detail surfaces.

> **Reconciliation note (2026-06-03 closeout).** The writer/reader columns below were a **lower-bound `.from()` grep** — it undercounts reads/writes that happen inside Postgres function and trigger bodies (e.g. an RPC that `SELECT`s a table). For authoritative **connection state**, the per-table verdict in [`connection-completeness-2026-06-03.md`](connection-completeness-2026-06-03.md) supersedes this doc: that pass re-derived every table from the whole codebase **plus all 160 function/trigger bodies** and ran a reverse orphan scan. Three corrections/findings from that pass are folded in below (`intelligence_item_citations`, `d3_runs`, `ingestion_state`). This census remains authoritative for **row counts, cadence, the overlap map (§3), and the surface-to-data trace (§2.6)**.

---

## 1. Executive summary — load-bearing vs cosmetic

### Load-bearing (block a continuously-reconciled master)
1. **No content-reconcile loop.** `monitoring_queue` (507 rows) is written hourly by `check-sources/route.ts:71` with `change_detected` **hardcoded false** — it is write-wired, read-**unconsumed**. The diff that would feed reconciliation never computes. **PARTIAL.**
2. **`intelligence_changes`** (0 rows) — read at `supabase-server.ts:1361`, **no writer**. The change-delta record, read-wired/write-missing. **PARTIAL, load-bearing.**
3. **`source_conflicts`** (0 rows) — read at `supabase-server.ts:380`, **no writer**. Conflict-arbitration, read-wired/write-missing. **PARTIAL, load-bearing.**
4. **Identity SSOT stillborn.** `intelligence_items.instrument_identifier` 5/371 populated; the canonical unique index `intelligence_items_canonical_key_idx` exists but covers only those 5. Reconcile has no populated+unique match key. **PARTIAL.**
5. **Create-path ungated.** 3 live insert routes can write content-less rows (`drain-first-fetch:329`, `staged-updates:341`, `community/posts/[id]/promote:401`) + bulk scripts bypass staging. `full_brief`/`source_id` nullable. **No DB gate.**
6. **`intelligence_item_versions`** (625 rows) — write-wired (trigger), **read-unconsumed** (no `SELECT` site). The history exists but nothing surfaces it; the trigger also omits date/status fields. **PARTIAL** (the change feed's raw material, unused).
7. **`d3_runs` — live-runtime orphan; the D3 liveness ledger has no table.** `src/lib/d3/hooks.mjs` is imported by **6 production routes** (`agent/run`, `worker/check-sources`, `admin/scan`, `commit-tier-change`, `fetch-now`, `verification.ts`) and writes `.from("d3_runs")`, but **no migration defines that table** — the DDL exists only as a loose, deliberately-unapplied file at [`scripts/d3-runs.ddl.sql`](../../scripts/d3-runs.ddl.sql) (committed `58aa386`, "DEFINED, NOT applied"). Consequence: the D3 **guards are live** (they bias admit→provisional / reject→quarantine and write to `integrity_flags`, which exists), but the D3 **liveness heartbeat is a permanent no-op** — every `heartbeat()` logs "skipped," and the `max(ran_at)` self-liveness reader (`scripts/d3-run.mjs:128`) can never see a recorded run. The verification layer cannot prove its own data-scope guards ran. **Fix (gated to build): promote `scripts/d3-runs.ddl.sql` to a numbered migration and apply it** — the schema is already complete and satisfies all three call sites; applying it makes the existing live-route heartbeats land immediately (a scheduler for `d3-run.mjs` is the separate periodic-scope half).

### Cosmetic / non-blocking
- Community + notifications + forum + vendor + invitation subsystems: built, both sides wired, **0 rows** (no activity) → WIRED-DORMANT / UNWIRED-SCAFFOLD. Not a master-record blocker.
- `item_changelog` (9 seed rows) feeds the WhatChanged surface → that surface is **stale-frozen**, but cosmetic.
- 4 `_pre_phase5` backup tables + `domain_backfill_audit` + shelved `intelligence_summaries` (2310) = DEAD-DEBT cleanup.

---

## 2. Per-layer tables

### 2.1 DATA LAYER (79 tables)
Format: name | rows | writer (file:line) | reader (file:line) | last-write | status | gap

**Core pipeline — WIRED-LIVE**
- `intelligence_items` | 657 | many (`staged-updates:341`, `drain-first-fetch:329`, `community…promote:401`, bulk scripts) | RPCs `get_workspace_intelligence*` + `AdminDashboard:167` | 06-03 | **WIRED-LIVE** | create-path ungated (§1.5)
- `sources` | 799 | `recompute-trust:100`, seed/ops | `coverage-gaps:181` + RPCs | 06-03 | **WIRED-LIVE** | —
- `intelligence_item_sections` | 1005 | `sprint3-a5-backfill:127` + trigger | `supabase-server:1948` | 05-29 | **WIRED-LIVE** | batch-written, not regenerated
- `section_claim_provenance` | 2476 | `block4-retroground-runner:178` (raw pg) | `validate_item_provenance()` | grounding | **WIRED-LIVE** | grounding is script-driven, not a service
- `agent_run_searches` | 1155 | `block4-retroground-runner:158` | (substrate) | grounding | **WIRED-LIVE** | read only by provenance fn
- `agent_runs` | 1007 | `wave1-cold-start:403` + agent path | `admin/page.tsx:32` | 05-30 | **WIRED-DORMANT** | generation idle; telemetry
- `raw_fetches` | 660 | `wave1-cold-start:206` | content_hash dedupe (fetch path) | 05-19 | **WIRED-DORMANT** | the content-change signal, unused for reconcile
- `provisional_sources` | 497 | `discovery.ts:632`, backfill | `supabase-server:347` | 06-01 | **WIRED-LIVE** | —
- `integrity_flags` | 485 | `admin/integrity-flags:286` | `supabase-server:2454` | 06-02 | **WIRED-LIVE** | —
- `source_trust_events` | 828 | `cron/q7-daily-recompute:323` + hourly | `tier-override:122` | 06-02 | **WIRED-LIVE** | reachability/trust only
- `source_verifications` | 1414 | `tier1-population-runner:1145` | `spot-check/recurring:205` | 05-04 | **WIRED-DORMANT** | populated in batch
- `source_bias_tags` | 2895 | `q4-bias-batch-assign:373` | `supabase-server:849` | batch | **WIRED-DORMANT** | one-shot batch
- `monitoring_queue` | 507 | `check-sources:71` (hourly) | **none** | 06-02 | **PARTIAL** | written hourly, never consumed; `change_detected` always false
- `pending_first_fetch` | 13 | `enqueue_pending_first_fetch` trigger | `drain-first-fetch:366` | live | **WIRED-LIVE** | drain queue
- `pending_jurisdiction_review` | 110 | `derive_jurisdiction_iso` trigger (083) + `phase-5-backfill:438` | `triage…:71` | — | **WIRED-LIVE** | operator queue
- `ingest_rejections` | 131 | trigger (083) + `phase-5-backfill:448` | `triage…:52` | — | **WIRED-LIVE** | operator queue
- `ingestion_state` | 774 | migration 059 seed only (no runtime writer) | **none** (0 fns / 0 views / 0 triggers / 0 src — verified) | 05-10 (frozen) | **DEAD-DEBT (superseded mirror)** | **CORRECTED** from WIRED-LIVE: the "(pause checks)" reader was an assumption. Migration 059 declares it a *denormalized mirror* of `sources.{auto_run_enabled, processing_paused}` "for query-path performance"; the intended dual-write sync was never built, so it's a frozen 05-10 backfill snapshot. Canonical store = `sources.{auto_run_enabled, processing_paused}` + `system_state.global_processing_paused`. Live worker reads `sources` directly (`check-sources:132`, `drain-first-fetch:453`). Retire candidate.
- `ingestion_control_log` | 709 | `wave1-cold-start:563` | — | — | **WIRED-DORMANT** | append log
- `canonical_source_candidates` | 370 | `canonical-source-discover:211` | `bulk-classify:168` | 04-28 | **WIRED-DORMANT** | canonical review idle
- `staged_updates` | 24 | `community…promote:357`, scan | `admin/page.tsx:76` | 04-05 | **WIRED-LIVE** | candidate store; idle (§Q2)
- `admin_action_cooldowns` | 1 | `scan:398` | `scan:90` | — | **WIRED-LIVE** | —
- `system_state` | 1 | `pause-global:49` | `pause-global:81` | 05-18 | **WIRED-LIVE** | global pause flag
- `intelligence_item_versions` | 625 | trigger (053) | **none** | 05-25 | **PARTIAL** | written by trigger, no read/surface; trigger omits date/status fields
- `intelligence_item_citations` | 750 | migration 089 backfill (+ `source-classification-step1` repoint) | **`get_source_citation_stats` RPC — 5 runtime sites** (`supabase-server.ts:827/1080/1169`, `ask/route.ts:375`, `credibility.ts:83`) | — | **WIRED-LIVE (read) / batch-write** | **CORRECTED** from PARTIAL "read by none": the read is inside the RPC body, missed by the lower-bound grep. Read-live; write = batch/backfill only (no runtime append path)
- `workspace_item_overrides` | 3 | `workspace/overrides:104` | `supabase-server:1369` | 05-28 | **WIRED-LIVE** | the one real workflow overlay
- `workspace_settings` | 1 | `provision:119`, `settingsStore:56` | `settingsStore:163` | 04-05 | **PARTIAL** | DashboardSettings save no-ops (`settingsStore.orgId` never set); BriefingSchedule path works
- `profiles` | 2 | `provision:79`, `OnboardingWizard:197` + mirror trigger | `server-bootstrap:77` | 05-28 | **WIRED-LIVE** | mirror overlap (§3)
- `user_profiles` | 1 | migration 075 + mirror trigger | (mirror) | 05-19 | **WIRED-LIVE** | mirror overlap (§3)
- `organizations` | 1 | `provision:100` | `AdminDashboard:151` | 04-05 | **WIRED-LIVE** | —
- `org_memberships` | 2 | `AdminDashboard:207` | `admin/page.tsx:66` | 05-28 | **WIRED-LIVE** | —
- `regional_data_facts` | 75 | `sprint3-a6-find-new:265` | `supabase-server:1853` | 05-28 | **WIRED-LIVE** | operations surface
- `region_dimension_coverage` | 30 | `rdf_sync_coverage` trigger | `supabase-server:1850` | 05-28 | **WIRED-LIVE** | trigger-maintained
- `regions` | 5 | seed | `supabase-server:1846` | 05-25 | **STATIC-BY-DESIGN** | reference

**Read-wired / write-missing — PARTIAL (load-bearing subset in §1)**
- `intelligence_changes` | 0 | **none** | `supabase-server:1361` | — | **PARTIAL** | no writer; the change-delta home
- `source_conflicts` | 0 | **none** | `supabase-server:380` | — | **PARTIAL** | no writer; conflict arbitration
- `source_citations` | 0 | **none** | `trust.ts:815` | — | **PARTIAL** | superseded by `intelligence_item_citations` (§3)
- `user_watchlist` | 0 | **none** | `supabase-server:2259` | — | **PARTIAL** | watchlist read-stub, no write path, dead UI link
- `coverage_gaps` | 2 | seed/none | `supabase-server:2375` | 05-10 | **PARTIAL** | read by surface, near-empty
- `sector_contexts` | 15 | seed | `supabase-server:1366` | — | **STATIC-BY-DESIGN** | sector synopsis config

**Write-wired / read-missing — PARTIAL (inverse)**
- `source_tier_opinions` | 0 | `tier-opinions:198` | **none** | — | **PARTIAL** | write route exists, 0 rows, unread

**Legacy seed-frozen (read by detail surface, write = migration only)**
- `item_changelog` | 9 | migration 010 | `supabase-server:83` (WhatChanged) | 04-05 | **PARTIAL** | feeds WhatChanged → surface is STALE
- `item_timelines` | 107 | migration 004/010 | `supabase-server:509` | 04-05 | **STATIC/legacy** | detail timeline
- `item_disputes` | 7 | migration 010 | `supabase-server:113` | 04-05 | **STATIC/legacy** | —
- `item_cross_references` | 49 | migration 010 | `supabase-server:146` | — | **STATIC/legacy** | intersection (also computed live via `detect_intersections`)
- `item_supersessions` | 11 | migration 004 | `supabase-server:170` | 05-18 | **WIRED-DORMANT** | supersession lifecycle seed-frozen (`replaced_by`=0 live)
- `item_type_required_slots` | 20 | migration 112 | `validate_item_provenance` | — | **STATIC-BY-DESIGN** | provenance slot config
- `taxonomy_nodes` | 38 | `seed-community.sql:35` | — | — | **STATIC/scaffold** | community taxonomy seed

**Community / social subsystem (migration 007/041/060/076) — both sides wired, 0 activity**
- `community_groups` | 0 | `verify-end-to-end:463` (seed) + group routes | `community/search:102`, `[slug]/page:?` | — | **WIRED-DORMANT** | no users
- `community_posts` | 0 | `…/replies:215`, `…/route:208` | `community/page:122` | — | **WIRED-DORMANT** | no users
- `community_group_members` | 0 | `…/star:54`, seed | `[slug]/page:90` | — | **WIRED-DORMANT** | + count trigger
- `community_group_invitations` | 0 | `…/invite:93` | `…/revoke:57` | — | **WIRED-DORMANT** | —
- `community_topics` | 0 | (topic routes) | `[slug]/page:113` | — | **WIRED-DORMANT** | —
- `community_topic_groups` | 0 | none | none | — | **UNWIRED-SCAFFOLD** | join table, unused
- `forum_sections` | 17 | seed | (forum pages) | 04-05 | **WIRED-DORMANT** | 17 seed sections
- `forum_threads` | 0 | forum routes + count triggers | — | — | **WIRED-DORMANT** | no activity
- `forum_replies` | 0 | forum routes + triggers | — | — | **WIRED-DORMANT** | no activity
- `moderation_reports` | 0 | `moderation/reports:281` | `moderation/reports:99` | — | **WIRED-DORMANT** | moderation built, unused
- `post_promotions` | 0 | `…/promote:429` | `…/promote:250` | — | **WIRED-DORMANT** | promotion audit, unused
- `case_studies` | 6 | seed | (research/community) | 04-05 | **WIRED-DORMANT** | 6 seed rows
- `case_study_endorsements` | 0 | none + count trigger | none | — | **UNWIRED-SCAFFOLD** | —
- `vendors` | 0 | none (no write route) | none | — | **UNWIRED-SCAFFOLD** | vendor directory unbuilt
- `vendor_endorsements` | 0 | none + count trigger | none | — | **UNWIRED-SCAFFOLD** | —
- `vendor_regulations` | 0 | none | none | — | **UNWIRED-SCAFFOLD** | —
- `vendor_technologies` | 0 | none | none | — | **UNWIRED-SCAFFOLD** | —

**Notifications subsystem (migration 007) — both sides wired, 0 activity**
- `notifications` | 0 | `notifications/dispatch.ts:56` | `surface-coverage.ts:241` | — | **WIRED-DORMANT** | —
- `notification_events` | 0 | `notifications/trigger:36` | `notifications/trigger:56` | — | **WIRED-DORMANT** | —
- `notification_deliveries` | 0 | `notifications/trigger:85` | — | — | **WIRED-DORMANT** | —
- `notification_preferences` | 0 | `OnboardingWizard:259` | `NotificationPreferences:121` | — | **WIRED-DORMANT** | + updated_at trigger
- `notification_subscriptions` | 0 | (subscription path) | `notifications/trigger:56` | — | **WIRED-DORMANT** | —

**Org/invitation subsystem (migration 006/076/077)**
- `org_invitations` | 0 | `orgs/[org_id]/invitations:64` | `invitations/mine:41` | — | **WIRED-DORMANT** | invite flow built, unused
- `org_watchlist` | 0 | none | none | — | **UNWIRED-SCAFFOLD** | watchlist scaffold (dup of user_watchlist, §3)

**Scaffold / unbuilt**
- `briefings` | 0 | none | none | — | **UNWIRED-SCAFFOLD** | weekly briefing table, never wired
- `bulk_imports` | 0 | `bulk-import:623` | none | — | **WIRED-DORMANT** | import audit, unused

**Shelved / backup — DEAD-DEBT (see §4)**
- `intelligence_summaries` | 2310 | `add-building-standards:120` (seed) | none (SectorSynopsisView fallback) | — | **DEAD-DEBT (shelved, keep-not-delete)** | superseded synopsis store
- `intelligence_items_pre_phase5` | 655 | migration backup | none | 05-15 | **DEAD-DEBT** | phase-5 snapshot
- `item_supersessions_pre_phase5` | 5 | migration backup | none | — | **DEAD-DEBT** | snapshot
- `pending_jurisdiction_review_pre_phase5` | 107 | migration backup | none | — | **DEAD-DEBT** | snapshot
- `ingest_rejections_pre_phase5` | 0 | migration backup | none | — | **DEAD-DEBT** | empty snapshot
- `intelligence_items_domain_backfill_audit` | 212 | migration 101 | none | — | **DEAD-DEBT** | one-shot backfill audit

### 2.2 TRIGGERS (31 on app tables; 7 Supabase-system excluded)
**Provenance/identity (intelligence_items):** `set_provenance_status_trg` (AFTER I/U → re-derive provenance — WIRED-LIVE), `set_provenance_status_sections_trg`, `set_provenance_status_claims_trg` (substrate → provenance — WIRED-LIVE), `guard_provenance_flip_trg` (BEFORE U guard — WIRED-LIVE), `stamp_prov_origin_trg`, `intelligence_items_version_snapshot` (AFTER U → versions — WIRED-LIVE write / read-missing), `trg_intelligence_items_integrity_flag` (full_brief → integrity flag — WIRED-LIVE), `trg_intelligence_items_normalize_jurisdictions` (WIRED-LIVE), `intelligence_items_updated_at`.
**Sources:** `sources_recompute_accuracy`, `sources_sync_tier_columns`, `trg_sources_enqueue_first_fetch_insert/update` (→ pending_first_fetch — WIRED-LIVE), `sources_updated_at`.
**Profiles mirror:** `profiles_mirror_to_user_profiles` + `user_profiles_mirror_to_profiles` (bidirectional — overlap §3).
**Counts (community/forum/vendor):** `community_group_members_count`, `community_posts_reply_count`, `forum_replies/threads count`, `section_thread_count`, `vendor_endorsement_count`, `case_study_validation_count` — **WIRED-DORMANT** (fire only on community activity = none).
**Misc:** `regional_data_facts → rdf_sync_coverage` (WIRED-LIVE), `*_updated_at` on case_studies/forum/notification_preferences/organizations/vendors/workspace_*.

### 2.3 FUNCTIONS / RPCs (~40 app; ~120 ltree/pg_trgm extension fns excluded)
**Customer-surface reads (WIRED-LIVE):** `get_workspace_intelligence`, `_slim`, `_dashboard`, `_listings`, `_aggregates(_scoped)`, `_workspace_active_items` (overlay), `get_market_intel_items`, `get_operations_items`, `get_research_items`, `get_research_source_coverage`, `get_source_citation_stats`, `detect_intersections`, `coverage_matrix`, `community_region_counts`, `admin_attention_counts`.
**Auth/org (WIRED-LIVE/DORMANT):** `accept_invitation`, `decline_invitation`, `revoke_invitation`, `lookup_invitation`, `create_org_for_self`, `_assert_org_membership`, `user_belongs_to_org`, `user_is_group_*`, `user_owns_group`, `get_workspace_members`.
**Provenance:** `validate_item_provenance` (WIRED-LIVE).
**Read-wired/unexercised:** `get_tier_opinion_disagreements` (reads `source_tier_opinions` = 0 rows → **PARTIAL**).
**Trigger fns:** the 30+ `*_trigger`/`update_*_count`/mirror fns above.

### 2.4 CRONS (5 workflows, repo-root `.github/workflows/`)
- `source-monitoring.yml` | **hourly** `0 */1 * * *` → `/api/worker/check-sources` → writes `sources.status`, `source_trust_events`, `monitoring_queue` | **WIRED-LIVE** | reachability only; no content reconcile
- `trust-recompute.yml` | **monthly** `0 3 1 * *` → `/api/admin/recompute-trust` → `sources` trust cols | **WIRED-LIVE**
- `spot-check-monthly.yml` | **monthly** `0 3 1 * *` → `/api/admin/spot-check/recurring` → `source_verifications`, `sources.spotchecked` | **WIRED-LIVE**
- `bug-class-guard.yml`, `discipline.yml` | on-push CI | no data writes | **WIRED-LIVE (CI)**
- *(There is also `scripts/cron/q7-daily-recompute.mjs` writing `source_trust_events:323` — **no `.github` cron invokes it**; it's a manual/`/api/admin/q7-daily-recompute` route. **PARTIAL** — job exists, no scheduler.)*

### 2.5 ROUTES (75) — grouped by subsystem; every route named
- **Admin/source pipeline (30):** `/admin/scan`, `/agent/run`, `/admin/recompute-trust`, `/admin/spot-check/recurring`, `/admin/q7-daily-recompute`, `/admin/sources/*` (discover, verify, promote, recommend-tier/classification, bulk-import, commit-tier-change, tier-override, pause/pause-global, fetch-now, regenerate-brief, visibility, tier-opinions, recently-auto-approved), `/admin/canonical-sources/*` (pending, decide, bulk-approve, bulk-classify, recommend-classification), `/admin/integrity-flags*`, `/admin/intersections`, `/admin/coverage`, `/admin/attention`, `/admin/b2-progress`, `/admin/triage/*`, `/admin/users` — **WIRED-LIVE** (operator-driven).
- **Workers (2):** `/worker/check-sources` (WIRED-LIVE hourly), `/worker/drain-first-fetch` (WIRED-LIVE; seeds shell rows).
- **Workspace/content (4):** `/workspace/overrides`, `/workspace/regulations-defaults`, `/staged-updates`, `/intelligence-items/[id]/metadata` — **WIRED-LIVE**.
- **Ask/AI (1):** `/ask` — **WIRED-LIVE**.
- **Community (22):** `/community/groups/[id]/*`, `/community/posts/*`, `/community/invitations/*`, `/community/moderation/*`, `/community/notifications/*`, `/community/search` — **WIRED-DORMANT** (0 activity).
- **Notifications (1):** `/notifications/trigger` — **WIRED-DORMANT**.
- **Org/invite (9):** `/orgs/*`, `/invitations/*` — **WIRED-DORMANT** (single org live).
- **Auth (3):** `/auth/linkedin/start|callback`, — **WIRED-LIVE**.

### 2.6 SURFACES (23 pages + 3 detail) — surface → data → real/empty/stub
- `/(home)` HomeSurface → `get_workspace_intelligence` (REAL items) + **WhatChanged → `item_changelog` (9 SEED rows → STALE)** + TopUrgency/DueThisQuarter (REAL).
- `/regulations` → `get_workspace_intelligence_listings` (REAL — 101 verified). `/regulations/[slug]` RegulationDetailSurface → item + `intelligence_item_sections` (REAL where grounded) + `item_timelines/disputes/cross_references/supersessions` (SEED/legacy) + **penalty/instrument/owner phantom columns (EMPTY — never populated)**.
- `/market` → `get_market_intel_items` (REAL rows) + TrajectoryBars **honest-empty** (price tiles fabrication stripped Phase-1).
- `/operations` → `get_operations_items` + `regional_data_facts` (75 REAL) + `regions`.
- `/research` `/research/[slug]` → `get_research_items` + `get_research_source_coverage`. ResearchFindingDetailSurface.
- `/map` → items by `jurisdiction_iso` (REAL).
- `/community` `/community/[slug]` `/community/browse` `/community/moderation` → `community_*` (EMPTY — 0 rows; honest-empty post Phase-1 strip).
- `/settings` → `workspace_settings` (**DashboardSettings save no-ops** — PARTIAL) + `notification_preferences` (EMPTY) + SavedSearches (localStorage).
- `/profile` → `profiles`/`user_profiles` (REAL).
- `/onboarding` → SectorSelector → `workspace_settings.notify_on_sector_activation`.
- `/admin` → admin RPCs + many tables (REAL operator console).
- `/events` → **uncertain** — no `events` table exists; verify what it renders (likely static/stub). *(labeled uncertainty)*
- `/login` `/signup` `/privacy` `/invitations/[token]` `/workspace/new` → auth/util (no intelligence data).

---

## 3. OVERLAP MAP (priority)

| cluster | members | canonical | partial/debt | recommended consolidation |
|---|---|---|---|---|
| **change/delta record** | `intelligence_item_versions` (625, write-trigger) · `item_changelog` (9, seed, feeds WhatChanged) · `intelligence_changes` (0, read-only) | **`intelligence_item_versions`** (the only live, monotonic record) | `item_changelog` = legacy seed (debt); `intelligence_changes` = empty field-diff (partial) | Derive WhatChanged from `intelligence_item_versions` (extend trigger to date/status fields); retire `item_changelog`; keep `intelligence_changes` only if pre-computed change_summary needed for alerts |
| **profile** | `profiles` (2, 37 cols) ↔ `user_profiles` (1, 13 cols) | **`profiles`** (richer, auth source) | `user_profiles` = thin mirror | Bidirectional mirror triggers (`profiles_mirror_to_user_profiles` + reverse) risk loops; collapse to one table + a view |
| **citations** | `intelligence_item_citations` (750, backfilled) · `source_citations` (0, read trust.ts:815) | **`intelligence_item_citations`** (has data) | `source_citations` = empty, superseded | Retire `source_citations`; point `trust.ts:815` at `intelligence_item_citations` |
| **watchlist** | `user_watchlist` (0, read-stub) · `org_watchlist` (0, unreferenced) | neither wired | both PARTIAL/scaffold | Pick one (per-org `org_watchlist` fits the multi-tenant model); build one write path; drop the other |
| **promotion/insert** | `staged_updates` materialization (24) · `drain-first-fetch:329` seedRow · `community…promote:401` · bulk scripts | **`staged_updates`** (candidate store, has materialized_item_id) | the 3 bare-insert paths bypass it | Route all inserts through `staged_updates` + a promotion gate (no-bare-row) |
| **source vetting** *(found)* | `provisional_sources` (497) · `canonical_source_candidates` (370) · `source_verifications` (1414) · `source_tier_opinions` (0) | `provisional_sources` + `source_verifications` (live) | `canonical_source_candidates` (dormant), `source_tier_opinions` (empty) | 3-4 overlapping source-vetting stores; consolidate the review queues |
| **operator queues** *(found)* | `ingest_rejections` · `pending_jurisdiction_review` · `monitoring_queue` · `staged_updates` | each distinct purpose | — | OK distinct, but all read by `/admin/triage/*` + `/admin/attention` — unify the surface |
| **regions** *(found)* | `regions` (5) · `region_dimension_coverage` (30) · `regional_data_facts` (75) | complementary (region → dimension → fact) | — | Not debt; trigger-synced. Leave. |
| **pre_phase5 backups** *(found)* | 4 `_pre_phase5` tables + `domain_backfill_audit` | the live tables | all 5 = DEAD-DEBT | Drop after phase-5 confidence |

---

## 4. RETIRE-CANDIDATES (DEAD-DEBT)

| table | rows | reason | caveat |
|---|---|---|---|
| `intelligence_items_pre_phase5` | 655 | phase-5 migration backup snapshot | confirm phase-5 stable first |
| `item_supersessions_pre_phase5` | 5 | phase-5 backup | — |
| `pending_jurisdiction_review_pre_phase5` | 107 | phase-5 backup | — |
| `ingest_rejections_pre_phase5` | 0 | empty phase-5 backup | drop now |
| `intelligence_items_domain_backfill_audit` | 212 | one-shot backfill audit, no reader | keep only if audit-trail needed |
| `source_citations` | 0 | superseded by `intelligence_item_citations` | repoint `trust.ts:815` first |
| `intelligence_summaries` | 2310 | shelved synopsis store (superseded model) | **DECISION: keep, don't delete** (per prior ruling) — retire only when SectorSynopsisView removed |
| `community_topic_groups`, `case_study_endorsements`, `vendor_*` (4) | 0 | unwired scaffold within the unbuilt vendor/community-extras | retire only if vendor directory is cut from roadmap |
| `org_watchlist` OR `user_watchlist` | 0 | duplicate watchlist (keep one) | decide which |

---

## Method & uncertainty notes
- Writers for `section_claim_provenance`/`agent_run_searches` are raw-`pg` in `block4-retroground-runner.mjs` (script, not a service) — confirmed, not "none."
- `intelligence_item_citations` (750) writer = migration 089 backfill + the `source-classification-step1` repoint script; **RESOLVED 2026-06-03**: no runtime append path exists (agent citation extraction writes to `source_citations`/`provisional_sources`, not this edge table) — write is batch-only. Read side is live via the `get_source_citation_stats` RPC (see corrected row in §2.1).
- `/events` surface **RESOLVED 2026-06-03**: not a data surface — [`src/app/events/page.tsx`](../../src/app/events/page.tsx) is a `permanentRedirect("/community/events")` defense-in-depth fallback for the 308 in `next.config.ts` (PR-D IA refactor). No `events` table is needed; not a defect.
- "WIRED-DORMANT" for community/notifications means both code sides connect but 0 rows (no activity), NOT "unbuilt" — this corrects CLAUDE.md's "UI not yet built," which has drifted (the pages and routes exist).
- Cadence/last-write from `updated_at`/`created_at` where present; append-only tables (no `updated_at`) show last `created_at`.
