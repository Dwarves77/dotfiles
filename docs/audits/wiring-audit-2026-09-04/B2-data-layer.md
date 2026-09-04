# B2 — Data layer: migrations, live-application status, readers/writers

**Audit:** wiring-audit-2026-09-04 · **Lane:** AUDIT-B2 (DATA LAYER) · **Window:** every commit since 2026-08-21 (`_prs.txt`, 107 PRs) · **Mode:** read-only (repo + live read-only SQL against `kwrsbpiseruzbfwjpvsp`)

Status labels per rule 14: **[CONFIRMED]** = re-verified this session against a live query or a file read directly. **[HYPOTHESIS]** = inferred from code/docs, not independently re-run.

**How "applied live" was checked**: primarily `supabase_migrations.schema_migrations` (exists in this project — `to_regclass('supabase_migrations.schema_migrations')` is non-null; there is no `public.schema_migrations`). Where a migration's row was absent from that table, live object existence was checked directly instead (`to_regclass`, `information_schema.columns`, `pg_get_constraintdef`, `pg_get_functiondef`) — several migrations in this window applied cleanly but were never recorded in the tracking table (see §2). Each row below states which check the "Applied" column rests on.

---

## 0. Scope and file inventory

35 migration files were added to `fsi-app/supabase/migrations` since 2026-08-21 (boundary commit `99fd47e4`, 266, dated 2026-08-21 itself): **266–290, 293–300, 302–303**, plus **207** (a drift-documentation file added late in the window, 2026-09-04, for DDL applied live back on 2026-08-01 — see §3). That is 36 files total in scope.

**Numbering gaps confirmed genuine, not missing files**: `git log --all --diff-filter=A` shows **291, 292, 301, 304 have never existed** in this repo's history at any point — reserved numbers, never filled, not a deletion. `291_own_body_types_extension`-adjacent confusion is explained by 207's own header (§3).

---

## 1. Migration-by-migration inventory

| # | File (PR, date) | Creates/changes | Applied live? (check used) | Readers / writers in code | Loop stage | Verdict |
|---|---|---|---|---|---|---|
| 266 | `theme_briefs.sql` (#475, 08-21) | Table `theme_briefs` + RLS | ✅ `schema_migrations` v20260821184630 | Read: `ThemeStrip.tsx`, `research/[slug]/page.tsx`, `api/admin/themes/route.ts`. Write: `src/lib/research/theme-brief.mjs` (current, imported from 5+ call sites) **and** `scripts/connections/generate-theme-brief.mjs` (pre-registered, not yet present) — shared-dataset-ownership.md flags this pair **TO-VERIFY, possible supersession** | connections/surfaces | WIRED+USED |
| 267 | `origin_class_and_envelope.sql` (#482, 08-29) | `origin_class`/`derivation` CHECK constraints on `intelligence_items`, `regional_data_facts`, `state_cost_facts` | ✅ `schema_migrations` v20260830005305 | Constraint-only; consumed wherever those columns are read (credibility-tier chips) | population-turn / surfaces | WIRED+USED |
| 268 | `market_series.sql` (#483, 08-29) | Table `market_series` + RLS | ✅ `schema_migrations` v20260830020924 | Write: `scripts/producers/market/eu-weekly-oil-bulletin.mjs`. Read: `src/lib/supabase-server.ts` | population-turn (surfaces) | WIRED+USED — 2,743 live rows |
| 269 | `routing_rpcs_use_surface_of.sql` (#485, 08-30) | `CREATE OR REPLACE` `get_research_items`/`get_operations_items`/`get_market_intel_items` | ✅ `schema_migrations` v20260830035607 | Called via named wrappers in `supabase-server.ts` (`fetchResearchItems` etc.) | surfaces | WIRED+USED |
| 270 | `widen_org_watchlist_market_series.sql` (#496, 08-30) | Widens `org_watchlist_item_type_check` to admit `'market_series'` | ✅ **direct DDL check** — `pg_get_constraintdef` confirms the widened array live; **absent from `schema_migrations`** (see §2) | `src/app/api/watchlist/route.ts` (`ITEM_TYPES` set) | surfaces | WIRED+USED |
| 271 | `assumption_register.sql` (#499, 08-30) | Table `assumption_register` + RLS | ✅ **direct DDL check** — `to_regclass` confirms table live; **absent from `schema_migrations`** (see §2) | **Zero code references** (`grep .from("assumption_register")` = 0 files) | none | **BUILT-NOT-WIRED** — table exists, 0 rows, no writer/reader anywhere in `src/`/`scripts/` |
| 272 | `customer_rpcs_project_jurisdiction_iso.sql` (#499, 08-30) | `DROP`+`CREATE OR REPLACE` on 8 customer RPCs to project `jurisdiction_iso` | ✅ **direct DDL check** — `pg_get_functiondef` on all 3 sampled RPCs contains `jurisdiction_iso`; **absent from `schema_migrations`** (see §2) | Consumed by `src/lib/jurisdictions/iso.ts`'s `normalizeJurisdictionIsoColumn`, wired at the 3 `Resource`-mapper call sites | surfaces | WIRED+USED |
| 273 | `coverage_gap_candidates_live_ddl_catchup.sql` (#501, 08-31) | Documents 5 live-only columns on `coverage_gap_candidates` (drift catch-up, own class) | ✅ **direct DDL check** — all 5 columns confirmed live; **absent from `schema_migrations`** (see §2) | Read by `acquisition_backlog_v` view | source sweep | WIRED+USED (documentation-class migration, matches drift-207 pattern one migration early) |
| 274 | `item_forward_events.sql` (#506, 09-01) | Table `item_forward_events` + RLS + indexes | ✅ **direct DDL check** — table + `uq_item_forward_events_dedupe` index confirmed live; **absent from `schema_migrations`** (see §2) | Read: `api/admin/forward-events/route.ts`, `api/health/surfaces/route.ts`, `read-upcoming.mjs`, `read-register.mjs`. Write: **3 registered paths** — `mint-item.ts` (mint-time), `apply-staged-update.ts` (substantive-update re-extract), `scripts/forward-events/run-extraction.mjs`+coordinator-apply (batch); shared-dataset-ownership.md documents all 3 as intentional, keyed to the 275 dedupe index | population-turn / forward-events | WIRED+USED — 1,149 live rows |
| 275 | `item_forward_events_dedupe_key_fix.sql` (#506, 09-01) | Replaces the 274 dedupe UNIQUE index (274's key silently dropped 54% of the first real run) | ✅ **direct DDL check** — `uq_item_forward_events_dedupe` confirmed live with the fixed key; **absent from `schema_migrations`** (see §2) | Same writers as 274 | population-turn / forward-events | WIRED+USED |
| 276 | `connection_theme_runs_theme_delta.sql` (#507, 09-01) | Adds `theme_delta` column to `connection_theme_runs` | ✅ `schema_migrations` v20260901190126 | `scripts/connections/analyze-corpus.mjs` (theme clustering) | connections | WIRED+USED |
| 277 | `corpus_turn_requests.sql` (#507, 09-01) | Table `corpus_turn_requests` + trigger `enqueue_corpus_turn_request()` (fires on `intelligence_items` provenance/archive/tag changes) + RLS | ✅ `schema_migrations` v20260901213944 | Write: DB trigger (mechanical, primary), `api/admin/corpus-turn-requests/route.ts` (manual `reason='manual'`). **Consume: `scripts/turns/consume-turn-requests.mjs` exists but the `corpus-turn` harness family has zero run artifacts** (empty `scripts/harness-runs/corpus-turn/` — not even a `PENDING-RUN.md`, unlike `ledger-consume`/`source-sweep`; not registered in `scripts/harness-runs/governing-files.mjs` either) | population-turn → connections | **WIRED-NOT-RUN** — 1,709 open rows live, **0 consumed** [CONFIRMED, live SQL] |
| 278 | `item_grade.sql` (#507, 09-01) | Adds `item_grade` column + index to `intelligence_items` | ✅ `schema_migrations` v20260901213958 | Read/write throughout mint (`brief`/`record` grade split); surfaces filter by grade | population-turn / surfaces | WIRED+USED — live split: `record\|verified`=1,101, `brief\|verified`=334, `brief\|quarantined`=83 (non-archived) |
| 279 | `source_content_fingerprint.sql` (#507, 09-01) | RLS on `intelligence_changes` | ✅ `schema_migrations` v20260901214007 | Change-detection / propagation-adjacent reads | change-detection | WIRED+USED |
| 280 | `theme_briefs_public_read.sql` (#507, 09-01) | Adds a public SELECT policy on `theme_briefs` | ✅ `schema_migrations` v20260901214014 | Enables anonymous read on `/research/[slug]` | surfaces | WIRED+USED |
| 281 | `data_sources_ecb.sql` (#517, 09-02) | Hand-written `INSERT ... ON CONFLICT DO NOTHING` registering `data_sources.source_key='ecb'` | ✅ `schema_migrations` v20260902112701 | Unblocks `scripts/producers/market/ecb-fx-producer.mjs`'s FK write (producer itself is **kill-switched off** per its own header) | population-turn (market) | **BUILT-NOT-WIRED at the producer** — FK gate closed, but the producer that would use it is disabled by its own kill switch; **known drift acknowledged in the file itself**: `data_sources` now carries `'ecb'` while `src/lib/contracts/source-licence.mjs`'s `SOURCE_LICENCES` register does not, so the DB-side and app-side licence gates disagree until a follow-up change adds the matching entry |
| 282 | `entities.sql` (#517, 09-02) | Tables `entities`, `entity_identifiers`, `entity_scope` + RLS | ✅ `schema_migrations` v20260902112737 | Write: `scripts/entities/backfill-entities.mjs`, `scripts/propagation/seed-derived-values.mjs`. Read: `community/[slug]/page.tsx`, `community/discover/page.tsx`, `api/notices/route.ts` | propagation (entity spine) | WIRED+USED for `entities`/`entity_identifiers` (2,022 / 2,016 rows); **`entity_scope` = 0 rows, no writer found** — DESIGNED-ONLY |
| 283 | `entity_refs.sql` (#517, 09-02) | Table `entity_refs`; FK columns `instrument_entity_id`/`organisation_entity_id` on `intelligence_items`/`sources` | ✅ `schema_migrations` v20260902112807 | Write: `scripts/entities/backfill-entities.mjs` (`guardedUpdate` on the FK columns), `seed-derived-values.mjs`. Read: `api/notices/route.ts` | propagation | WIRED+USED — 1,185 rows |
| 284 | `propagation_outbox.sql` (#517, 09-02) | Table `propagation_events`; trigger `emit_propagation_event()` on `market_series`/`emission_factors`/`regional_data_facts`/`derived_values` | ✅ `schema_migrations` v20260902113008 | Write: DB trigger (fully automatic, fires on every insert/update to the 4 spine tables). Consume: `src/lib/propagation/drain.ts` via `.github/workflows/propagation-drain.yml` | propagation | **WIRED-NOT-RUN at scale** — trigger fires correctly (2,754 events emitted total, [CONFIRMED]); drain has run exactly twice (2026-09-02, `propagation-run-001`/`002`, both against a queue depth of 6) and **2,748 events sit undrained** [CONFIRMED, live SQL: `drained_at IS NULL` count]. Corroborated independently by lane C1 |
| 285 | `derivation_dag_and_derived_values.sql` (#517, 09-02) | Tables `derived_values`, `derivation_edges`; functions `assert_acyclic()`, `invalidate_dependents()`, `effective_confidence()`, `register_derived_value()` | ✅ `schema_migrations` v20260902113142 | Write: `src/lib/propagation/register-derivation.ts` (`registerDerivedValue` → `register_derived_value` RPC, called from `drain.ts` and `methods/index.ts` — the governed path) **and** `scripts/propagation/seed-derived-values.mjs` (bootstrap, plain upsert, its own header notes no RPC exists for the entity tables it also seeds) | propagation | WIRED+USED, but thin — 6 rows each in `derived_values`/`derivation_edges`, all from the one 2026-09-02 seed run; the DAG has not been extended to cover anything produced since (2,737 new `market_series` rows, obligations, entities) |
| 286 | `statutory_and_estimates.sql` (#517, 09-02) | Tables `statutory_computations`, `estimated_values`; trigger `assert_statutory_purity()` | ✅ `schema_migrations` v20260902113240 | `admissibleFor()` (`src/lib/propagation/admissible-for.ts`) is the reader gate; no writer of either table found in `src/`/`scripts/` | propagation | **DESIGNED-ONLY** — 0 rows in both tables, isolation machinery shipped, nothing ever populates it |
| 287 | `sensitive_aggregates.sql` (#517, 09-02) | Tables `sensitive_field_policy`, `aggregate_query_log`; functions `bucket_width_multiplier`, `bucket_value`, `publish_aggregate` | ✅ `schema_migrations` v20260902113429 | 5 policy rows live (seeded by the migration itself); `aggregate_query_log` = 0 rows — no caller of `publish_aggregate` found outside its own test | community aggregates | **BUILT-NOT-WIRED** — `publish_aggregate()` RPC exists live but has zero code callers; `aggregate_query_log` (its own audit trail) has never been written |
| 288 | `source_type_taxonomy.sql` (#533, 09-02) | `sources.source_type` (array) + GIN index | ✅ `schema_migrations` v20260902201119 | Backfill referenced by maintenance step `source-type-backfill` | source sweep | WIRED+USED |
| 289 | `criterion2_url_balanced_parens.sql` (#535, 09-02) | In-place `pg_get_functiondef` patch to `validate_item_provenance` (URL-extraction regex, balanced parens) | ✅ `schema_migrations` v20260902202729 **and** direct confirm (function body verified live) | Fires on every claim/section insert (mint validation) | population-turn (mint gate) | WIRED+USED |
| 290 | `obligations.sql` (#536, 09-02) | Table `obligations` + indexes + RLS | ✅ `schema_migrations` v20260903005821 | Write: `scripts/obligations/derive-obligations.mjs` (derives obligations from `item_forward_events`). Read: `src/lib/obligations/read-register.mjs`, `item_forward_events.sql`'s cross-reference (40 files touch the word "obligations", most are prose; the actual table I/O is these two) | population-turn / forward-events | WIRED+USED — 1,149 rows, **exactly matching `item_forward_events`'s row count**, confirming the 1:1 derivation |
| 293 | `community_identity_and_guard.sql` (#539, 09-03) | Table `community_member_profiles`; RLS/columns on `community_posts`; table `community_thread_entities` | ✅ `schema_migrations` v20260903060338 | `api/community/profile/route.ts` + 3 more community routes | community | WIRED+USED (schema); `community_member_profiles`/`community_thread_entities` = 0 rows live — no community members have signed up yet |
| 294 | `community_aggregate_instruments.sql` (#539, 09-03) | Tables `community_benchmark_instruments`, `community_benchmark_responses` | ✅ `schema_migrations` v20260903060421 | `api/community/benchmarks/[key]/respond/route.ts`, `api/community/benchmarks/current/route.ts` | community | WIRED+USED — 3 instrument rows seeded; 0 responses yet |
| 295 | `community_promotion_machine.sql` (#539, 09-03) | `community_posts` promotion-state columns; table `community_promotion_transitions` | ✅ `schema_migrations` v20260903060446 | No `.from("community_promotion_transitions")` call site found in `src/`/`scripts/` | community | **BUILT-NOT-WIRED** — 0 `community_posts` exist to promote; transitions table has no writer |
| 296 | `spec09_market_tables.sql` (#539, 09-03) | Tables `carrier_compliance_pools`, `surcharge_audits`, `oem_tech_roadmaps`, `indexation_clauses`, `reroute_events` + RLS | ✅ `schema_migrations` v20260903060602 | Read: `SurchargeAuditPanel`/`OemRoadmapPanel`/`ReroutingPanel` — all 3 **rendered on `/market/page.tsx`** (reachable). No reader component for `carrier_compliance_pools` or `indexation_clauses`. Write: producers in `scripts/spec09/*.mjs`, all $0-sourcing-gapped (see §4) — only `reroute-producer.mjs` is dispatchable (via `maintenance.yml`'s `spec09-reroute` step, dry by default) | market surfaces | **WIRED-NOT-RUN** for `surcharge_audits`/`oem_tech_roadmaps`/`reroute_events` (page reads them, 0 rows, producer ships 0 by design — see §4); **BUILT-NOT-WIRED** for `carrier_compliance_pools`/`indexation_clauses` (no UI reader at all) |
| 297 | `spec09_operations_tables.sql` (#539, 09-03) | Tables `tce_data_quality`, `auxiliary_energy_profiles`, `grid_connection_queues` + RLS | ✅ `schema_migrations` v20260903060644 | Read: `DqiPanel`/`AuxiliaryEnergyPanel`/`GridQueuePanel`, all 3 rendered on `/operations/page.tsx`. Write: `scripts/spec09/{dqi,auxiliary-energy,grid-queue}-producer.mjs`, none dispatched anywhere (not in any `.yml`), all ship 0 rows by documented design | operations surfaces | **WIRED-NOT-RUN** — page reads live, table is 0 rows, no dispatchable producer at all (worse than 296's `reroute_events`, which at least has a maintenance-workflow entry) |
| 298 | `spec09_regulations_tables.sql` (#539, 09-03) | Tables `eudr_plot_claims`, `custody_chains` + RLS | ✅ `schema_migrations` v20260903060714 | Read: `EudrCustodyPanel`, rendered on `/regulations/page.tsx`. Write: `scripts/spec09/eudr-custody-producer.mjs`, not dispatched anywhere, ships 0 rows by design | regulations surfaces | **WIRED-NOT-RUN** — same pattern as 297 |
| 299 | `item_type_required_slots_wave3.sql` (#545, 09-03) | 3 new rows for `item_type_required_slots` (`corridor_identity`, `evidence_agreement_signal`, `source_authority_signal`) | ❌ **NOT APPLIED** — direct check: `item_type_required_slots` carries none of the 3 new `slot_key` values for `market_signal`/`initiative`/`research_finding` [CONFIRMED, live SQL]. Also absent from `schema_migrations` | The file's own header states the reason: applying it before the matching population re-mint would flip existing verified `market_signal`/`initiative`/`research_finding` items to `quarantined` on their next touch (criterion 5 re-evaluates on every claim/section insert) | population-turn (record-tier readiness) | **DELIBERATELY UNAPPLIED — the operator gate is the coordinated population-pass sequence its own header names** ("NOT APPLIED by this lane — no DB credentials here; the coordinator applies it," step 1 of a 3-step sequence in `docs/plans/population-pass-2026-09-03.md`). The kit-side mirror (`scripts/mint/item-type-required-slots.json`) already carries these 3 slots — kit is stricter than the live DB by design until this migration lands |
| 300 | `criterion2_url_typographic_delimiters.sql` (#557, 09-03) | In-place patch to `validate_item_provenance` (exclude guillemets/curly quotes from URL regex) | ✅ `schema_migrations` v20260904001306 **and** direct confirm (`pg_get_functiondef` contains `«`) | Same mint-gate call site as 289 | population-turn (mint gate) | WIRED+USED |
| 302 | `criterion3_rating_not_refusal.sql` (#566, 09-04) | In-place patch to `validate_item_provenance` — `fact_below_authority_floor` moves from `v_failures` (hard reject) to `v_result.warnings` (non-blocking rating) | ✅ `schema_migrations` v20260904054918 **and** direct confirm (`pg_get_functiondef` contains `below_floor_facts`) | Same mint-gate call site as 289/300 | population-turn (mint gate) | WIRED+USED |
| 303 | `slim_listings_id_tiebreak.sql` (#572, 09-04) | `CREATE OR REPLACE` `get_workspace_intelligence_slim` — adds `, ii.id ASC` to its ORDER BY | ✅ `schema_migrations` v20260904084952 **and** direct confirm | `src/lib/supabase-server.ts`'s `LISTINGS_RPCS_WITH_OWN_TOTAL_ORDER` set **already includes `"get_workspace_intelligence_slim"`** with a comment citing this migration — the code-side half the migration's own header called for has landed | surfaces (`/operations`, `/market` pagination) | WIRED+USED — DB and code sides both confirmed live/landed |
| 207 | `own_body_types_extension.sql` (#567, 09-04) | **Drift-documentation migration.** In-place patch to `validate_item_provenance` widening the own-body authority floor from `item_type='standard'` to `ANY('standard','framework','initiative')` | See §3 — the underlying DDL has been live since 2026-08-01; file 207 exists only to make a clean migration replay match reality | Same mint-gate call site as 289/300/302 | population-turn (mint gate) | WIRED+USED (live since before this window; file itself is a same-window documentation-only add) |

---

## 2. Migrations applied live but absent from `schema_migrations` (tracking-ledger drift)

**270, 271, 272, 273, 274, 275** are all confirmed live via direct DDL/object inspection (§1) but **have no row in `supabase_migrations.schema_migrations`** — a 6-file gap sitting in the middle of an otherwise fully-tracked run (269 and 276 both have clean rows either side of it). This is a distinct phenomenon from 207/273's own drift-documentation pattern: these are ordinary forward migrations whose DDL landed correctly but whose application was not recorded by whatever process normally writes that table (several of their own headers say "APPLIED to project kwrsbpiseruzbfwjpvsp on <date> by the coordinator" — i.e. applied via a direct `execute_sql`/`apply_migration` path rather than a tracked `supabase db push`).

**Consequence**: `schema_migrations` is not a reliable ledger of "what's live" for this window on its own — 6 of 34 applied migrations (18%) are missing from it. Anyone relying on that table alone to answer "is migration N live" for 270–275 would get a false negative. This audit used direct object inspection as the authoritative check for exactly this reason, per the task's own instruction. **Flag for the operator**: either backfill these 6 rows into `schema_migrations` (so a future `supabase db diff`/reset-replay doesn't choke expecting them absent) or document the direct-apply path as the sanctioned alternative track.

---

## 3. The drift-207 precedent, and its 273 sibling

**207** is the named precedent: `validate_item_provenance`'s own-body-floor widening (`standard` → `standard, framework, initiative`) was applied directly to production on **2026-08-01 04:44:00 UTC**, recorded in `schema_migrations` under **version `20260801004400`, name `extend_own_body_floor_to_voluntary_instruments_v203`** — a name and number that do not correspond to any file on disk. File `207_own_body_types_extension.sql` was added to the repo on 2026-09-04 (#567) purely so a from-scratch migration replay reproduces the live function body; its own `DO $$` block checks for the guard marker first and is a documented no-op against the already-patched live function. **[CONFIRMED, live SQL: the exact version/name pair exists in `schema_migrations`; the file 207 itself is absent from that table under its own name.]**

**273** is the same pattern one migration earlier in this window: it "records the five live-only columns migration 214 never created" — columns that were added out-of-band between 214 (2026-07-17) and 223 (2026-07-25), predating this audit's window, caught by an internal migrations-reality audit on 2026-08-31 and closed with a guarded (`ADD COLUMN IF NOT EXISTS`) catch-up file. Both 207 and 273 are evidence the team already has a working discipline for closing drift when it's found — the gap is that **new** drift (§2's 270–275) is accumulating in this same window even as older drift gets swept up.

**No additional never-migrated live objects were found** in this session's sweep of the 36 in-window migrations — every table/column/function/index each migration claims to create was directly confirmed live (§1). This is not an exhaustive live-vs-disk diff of the entire schema (out of this lane's scope); it covers only the objects the 36 in-window migration files themselves name.

---

## 4. Zero-row live objects from this window (19 of 32 new tables)

| Table | Migration | Rows | Why | Verdict |
|---|---|---|---|---|
| `assumption_register` | 271 | 0 | No writer anywhere in code (spec catalogued 10 constants; none inserted) | BUILT-NOT-WIRED |
| `entity_scope` | 282 | 0 | No writer found | DESIGNED-ONLY |
| `statutory_computations` | 286 | 0 | No writer found (isolation layer built, unfed) | DESIGNED-ONLY |
| `estimated_values` | 286 | 0 | No writer found | DESIGNED-ONLY |
| `aggregate_query_log` | 287 | 0 | `publish_aggregate()` RPC exists, zero callers | BUILT-NOT-WIRED |
| `community_member_profiles` | 293 | 0 | Feature live, no users signed up yet | WIRED-NOT-RUN (population, not code, gap) |
| `community_thread_entities` | 293 | 0 | Same | WIRED-NOT-RUN |
| `community_benchmark_responses` | 294 | 0 | Same | WIRED-NOT-RUN |
| `community_promotion_transitions` | 295 | 0 | No writer found; also 0 `community_posts` to promote | BUILT-NOT-WIRED |
| `carrier_compliance_pools` | 296 | 0 | Producer ships 0 by documented $0-sourcing gap; **no UI reader exists** | BUILT-NOT-WIRED |
| `surcharge_audits` | 296 | 0 | Producer ships 0 (gap: needs customer invoice upload, no upload flow exists); UI reader wired on `/market` | WIRED-NOT-RUN |
| `oem_tech_roadmaps` | 296 | 0 | Producer ships 0 (gap: no $0 structured feed); UI reader wired on `/market` | WIRED-NOT-RUN |
| `indexation_clauses` | 296 | 0 | Producer ships 0 by design (contract-specific data, no bulk source); **no UI reader exists** | BUILT-NOT-WIRED |
| `reroute_events` | 296 | 0 | Producer wired into `maintenance.yml` (`spec09-reroute` step, dry by default) but blocked: needs 2 `entities.kind='corridor'` rows, only 1 exists live; UI reader wired on `/market` | WIRED-NOT-RUN |
| `tce_data_quality` | 297 | 0 | Producer ships 0 (customer/shipment-specific data, no bulk source); **not dispatched from any workflow at all**; UI reader wired on `/operations` | WIRED-NOT-RUN |
| `auxiliary_energy_profiles` | 297 | 0 | Same pattern | WIRED-NOT-RUN |
| `grid_connection_queues` | 297 | 0 | Same pattern | WIRED-NOT-RUN |
| `eudr_plot_claims` | 298 | 0 | Producer ships 0 by design (per-consignment filings, no bulk source); **not dispatched**; UI reader wired on `/regulations` | WIRED-NOT-RUN |
| `custody_chains` | 298 | 0 | Same pattern | WIRED-NOT-RUN |

All 9 `spec09` producer gaps (296–298) are self-documented in `scripts/spec09/SOURCES.md`, written by the same lane that built the tables — this is disclosed, not hidden, drift. The distinguishing signal for the audit's DEAD/WIRED-NOT-RUN/BUILT-NOT-WIRED split is whether a page component reads the table: 7 of 9 have one (surcharge_audits, oem_tech_roadmaps, reroute_events, tce_data_quality, auxiliary_energy_profiles, grid_connection_queues, eudr_plot_claims), 2 do not (carrier_compliance_pools, indexation_clauses).

**Populated tables from this window** (for contrast): `market_series`=2,743, `propagation_events`=2,754, `item_cross_references`=20,401 (pre-existing table, heavily written by connections lane), `corpus_turn_requests`=1,709, `item_forward_events`=1,149, `obligations`=1,149, `entities`=2,022, `entity_identifiers`=2,016, `entity_refs`=1,185, `connection_theme_runs`=48, `connection_themes`=21, `theme_briefs`=9, `community_benchmark_instruments`=3, `derived_values`=6, `derivation_edges`=6, `sensitive_field_policy`=5 (a seed-only policy table).

---

## 5. RPC allowlist check (`src/lib/supabase-server.ts`)

There is no separately-named "RPC allowlist" gate in this codebase beyond `LISTINGS_RPCS_WITH_OWN_TOTAL_ORDER` (line ~495) — the one Set that decides whether an RPC's own internal `ORDER BY` survives PostgREST pagination or gets silently overridden by an outer `.order()`. This window's only RPC affected by that gate is **`get_workspace_intelligence_slim`** (migration 303): its header explicitly named the required code-side follow-up ("add `get_workspace_intelligence_slim` to `LISTINGS_RPCS_WITH_OWN_TOTAL_ORDER`"), and the live file confirms **that entry is already present**, with a comment citing migration 303. **No gap here** — DB and code sides both landed.

The 7 other new/changed RPCs this window (`get_research_items`, `get_operations_items`, `get_market_intel_items` — 269; `get_workspace_intelligence`/`_slim`/`_dashboard`/`_listings`/`get_technology_items` — 272) are all reached through named wrapper functions in `supabase-server.ts`, not ad-hoc `rpc()` calls — no allowlist gap found for any of them.

---

## 6. One-writer-rule cross-check (`fsi-app/docs/inventories/shared-dataset-ownership.md`)

Note: this file lives at **`fsi-app/docs/inventories/shared-dataset-ownership.md`**, not the repo-root `docs/inventories/` path — flagging in case other lanes look in the wrong place.

This window's tables are already tracked there in detail; cross-checked against this session's own independent grep of writers (§1):

- **`item_forward_events`** (274/275) — **3 legitimate write paths**, explicitly reconciled by the doc (mint-time insert, substantive-update idempotent re-extract, batch/backfill apply), all keyed to the 275 dedupe index, plus a narrow maintenance retext/delete path (2026-09-04). Not a violation — the doc resolves this as intentional multi-writer with a shared dedupe contract, and this session's own grep confirms exactly those 2 `src/` writers plus the `scripts/` batch path.
- **`theme_briefs`** (266) — the doc itself flags **TO-VERIFY**: `src/lib/research/theme-brief.mjs` is confirmed live/current, `scripts/connections/generate-theme-brief.mjs` is "pre-registered" per the doc but **this session's own grep found it does not exist yet** (`grep -rln "generate-theme-brief" scripts/` finds only the doc's own reference and a mention in `scripts/connections/`, — no such file on disk in this checkout). Treat as a single live writer today; the doc's supersession question is unresolved but currently moot.
- **`corpus_turn_requests`** (277) — 2 writers by design (the mechanical trigger + the manual admin-route insert), both confirmed; the doc separately names `scripts/turns/consume-turn-requests.mjs` as the (unrun) consumer — matches §1's WIRED-NOT-RUN verdict independently.
- **`entities`/`entity_identifiers`/`entity_refs`** (282/283) — 2 writers each (`backfill-entities.mjs`, the primary; `seed-derived-values.mjs`, a one-off bootstrap for the propagation-DAG seed) — doc explicitly calls these out as outside its own tracked registry scope but names them "for completeness."
- No table in this window was found written from more than the doc's own reconciled writer set, and no *new* one-writer-rule violation was found in this session's independent cross-check.

---

## 7. Loop-state counts (operator's requested snapshot, all [CONFIRMED] live SQL, 2026-09-04)

| Metric | Value |
|---|---|
| `sources` total | 2,563 |
| `sources` provisional | 911 |
| `sources` with `rss_feed_url` | 189 |
| `portal_link_candidates` total | 1,840 |
| `portal_link_candidates` `status='candidate'` | 1,837 |
| `portal_link_candidates` `status='promoted'` | 3 |
| `census_worklist` `invariant_reject` | 16,717 |
| `census_worklist` `would_mint` | 3,461 |
| `census_worklist` `hold` | 1,425 |
| `census_worklist` `dedup_hit` | 5 |
| `intelligence_items` (non-archived) `record\|verified` | 1,101 |
| `intelligence_items` (non-archived) `brief\|verified` | 334 |
| `intelligence_items` (non-archived) `brief\|quarantined` | 83 |
| `item_forward_events` | 1,149 |
| `item_cross_references` (connection edges) | 20,401 |
| `connection_themes` | 21 |
| `connection_theme_runs` | 48 |
| `theme_briefs` | 9 |
| `monitoring_queue` total | 580 |
| `monitoring_queue` change-detected & unreconciled | 0 |
| `published_price_statistics` | 4 |
| `community_posts` | 0 |
| `community_groups` | 7 |
| `community_topics` | 0 |
| `propagation_events` total / pending | 2,754 / 2,748 |
| `corpus_turn_requests` open / consumed | 1,709 / 0 |

(No dedicated `tags` table exists — tags live as array columns (`operational_scenario_tags`, `compliance_object_tags`, `topic_tags`) on `intelligence_items` itself; `connection_themes`/`theme_briefs` are the nearest "themes" tables.)

---

## 8. Ranked gaps (this lane's scope)

1. **`schema_migrations` ledger drift (§2)** — 6 of 34 applied in-window migrations (270–275) have no tracking row. Mechanical risk: a future clean replay or diff-based tooling will not know these are applied.
2. **`assumption_register` (271) — BUILT-NOT-WIRED, 0 rows, 0 code references.** Spec named 10 constants to catalogue; none were ever inserted, and no reader depends on it yet either. Full round-trip never closed.
3. **Propagation drain backlog — 2,748 of 2,754 events undrained**, and the DAG (`derivation_edges`, 6 rows) was seeded once and never extended to cover anything produced since (market_series, obligations, entities all grew by hundreds/thousands with zero corresponding derivation edges). The trigger (284) is the one fully-automatic link in this chain; everything downstream of it is dispatch-only and under-dispatched.
4. **`corpus_turn_requests` — 1,709 open, 0 consumed**, and the `corpus-turn` harness family has never produced a single run artifact (not even a `PENDING-RUN.md`) despite the workflow existing since 09-01.
5. **`ledger-consume` — 1,837 `portal_link_candidates` waiting behind a source-level constant (`LEDGER_CONSUME_APPLY_ENABLED = false`, `scripts/turns/run-ledger-consume.mjs:95`) that even a `mode: apply` dispatch cannot override**, plus a separate blocking defect: `.github/workflows/ledger-consume.yml` references `secrets.ANTHROPIC_API_KEY`, which is not yet registered in `.discipline/governance/secrets-registry.mjs`'s `WORKFLOW_SECRETS` — the first dispatch cannot succeed until that lands, per the family's own `PENDING-RUN.md`.
6. **8 of 10 spec09 tables (296–298) ship 0 rows by self-documented $0-sourcing gaps**, 6 of them wired into live page reads (`/market`, `/operations`, `/regulations`) that will render empty-state panels indefinitely absent a customer-upload flow or a paid data source; 2 (`carrier_compliance_pools`, `indexation_clauses`) additionally have no UI reader at all.
7. **`statutory_computations`/`estimated_values` (286) — the entire statutory/estimate isolation layer (4-layer guard, `admissibleFor()`, trigger) has zero live rows**; no code writer exists for either table.
8. **`aggregate_query_log`/`publish_aggregate()` (287)** — the RPC is live and correct, has zero callers; its own audit-log table is consequently also empty.
9. **Migration 299 deliberately unapplied** — correctly so, per its own operator-gate reasoning (avoiding a mass-quarantine on live verified items ahead of the coordinated population pass) — flagged here as a live gate, not a defect.

---

## 9. What this lane could not confirm

- **No exhaustive live-schema-vs-migration-files diff was run** — §3's "no additional drift found" claim is scoped to the 36 in-window migration files' own claimed objects, not a full `pg_dump`-vs-replay comparison of the entire `public` schema. Older drift (pre-2026-08-21) is out of this lane's window by design.
- **GitHub Actions run history was not queryable** (`gh` CLI unavailable, no auth in this environment) — all "has this workflow actually run" evidence in this report comes from `scripts/harness-runs/**` artifact files and live DB counts, not the Actions UI/API directly. Where a harness family shows 0 artifacts (e.g. `corpus-turn`, `ledger-consume`) that is strong but not absolute evidence of zero dispatches — a dispatch that errored before writing its `finally`-block artifact would look identical. `ledger-consume`'s and `source-sweep`'s own `PENDING-RUN.md` convention (a first-run acknowledgment marker) suggests the codebase treats "no artifact" as a reliable signal for those families specifically.
- **`generate-theme-brief.mjs`'s existence** — `shared-dataset-ownership.md` calls it "pre-registered," but this session's grep found no such file on disk in this worktree. Could not confirm whether it exists in an un-merged branch this worktree doesn't have, or was simply never built.
- **The exact count N referenced by migration 299's own header** (verified `market_signal`/`initiative`/`research_finding` items with no claim mentioning the 3 new slot keys — the self-check query it instructs be run before applying) was not re-run by this lane; not directly needed to confirm the migration's un-applied status, which was confirmed by direct column check instead.
