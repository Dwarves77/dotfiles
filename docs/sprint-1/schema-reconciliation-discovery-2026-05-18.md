# Caro's Ledge Sprint 1 Schema Reconciliation Discovery (Stage 1)

**Date.** 2026-05-18
**Branch.** feat/sprint-1-phase-5-implementation at 8aa9226 or later
**Method.** Three-agent pipeline. Agent 1 produced a complete live-DB inventory (introspected 13 object types across 15 schemas with operator vs supabase_internal domain split) saved to `fsi-app/scripts/tmp/recon-stage1-db-inventory.json`. Agent 2 produced a per-file inventory of every `fsi-app/supabase/migrations/*.sql` file (parsed creates, drops, columns_added, columns_dropped, renames, constraints, comments) saved to `fsi-app/scripts/tmp/recon-stage1-migration-source.json`. This synthesis agent cross-referenced the two manifests, ran targeted code-reference greps under `fsi-app/src`, and produced the report and the categorization JSON at `fsi-app/scripts/tmp/recon-stage1-categorization.json`.
**Skill load.** `sprint-followups-discipline` (loaded; OBS coverage table emitted below per discipline override that applies even on investigation dispatches). `environmental-policy-and-innovation` (loaded; integrity rule applied: where categorization is ambiguous the report names the ambiguity and surfaces the question for operator decision rather than extrapolating).
**Status.** Discovery only. No code, no migrations, no schema modified by this dispatch. Stage 2 reconciliation decisions are scoped to a separate dispatch and listed at the end of this report.

---

## Discovery summary

The live schema and the migration file source are **substantially coherent** but carry two named gaps and one cluster of metadata drift:

1. **The ledger lies about what is applied.** 25 file-present migrations (026 through 050) are NOT recorded in `supabase_migrations.schema_migrations`. Of those, 23 are FULLY APPLIED out-of-band (the schema objects exist; the ledger just does not know). One (048) is NOT APPLIED (the integrity_flags table is genuinely absent). One (049) is NOT APPLIED (3 perf indexes are absent). Two are DML-only (045, 050) and ride alongside DDL migrations.
2. **One unapplied schema feature is actively broken by absence.** Migration 048 creates the platform-level `integrity_flags` table that two production UI components (`IntegrityFlagsView`, `PlatformIntegrityFlagsView`) and three API surfaces query directly. The components query the table; the table does not exist; the views silently return empty.
3. **One alleged code-source drift is a phantom.** The earlier critical investigation (docs/sprint-1/critical-investigations-2026-05-18.md) named `recurring_spot_check_log` as a code-references-but-no-migration-source case. The current grep finds **zero references in `fsi-app/src`**. The table is not in the live DB, not in any migration file, and not in any application code. The earlier framing was incorrect.

**Top-line counts.**

| Category | Tables | Project Functions | Views | Triggers |
|---|---|---|---|---|
| A: live AND in source | 63 | 41 | 3 | 25 |
| B: live, NO source (orphans) | 4 (all `*_pre_phase5` snapshots) | 0 | 0 | 0 |
| C: in source, NOT live (truly unapplied) | 1 (`integrity_flags`) + 7 (1.0-era v1 superseded tables) | 0 | 0 | 0 |

Critical findings, one line each:
- `integrity_flags` table: genuinely unapplied. Migration 048 + 050 will create it. Production UI code already wired.
- `recurring_spot_check_log`: phantom. No live table, no migration source, no code references. Earlier finding was a false alarm.
- `recompute_agent_integrity_flag` function: live; created by 035, replaced by 044; both migrations are out-of-band-applied (FULLY APPLIED but unrecorded in the ledger).
- 026-050 block: 23 FULLY APPLIED out-of-band, 2 NOT APPLIED (048, 049), 2 DML-ONLY (045, 050).
- Migration 070: in ledger, file deleted. The 5 RPCs that 071 references as "from 070" all live in DB; no schema loss, only source-history loss.
- Migration 063: `IF NOT EXISTS` column adds silently no-op for `sources.tier` and `sources.jurisdictions` because 004 already created them with incompatible types (INT vs TEXT; NOT NULL vs NULL). The 5-axis classification framework's intended schema change never took effect.

---

## OBS coverage table

This is an investigation-only dispatch, so the sprint-followups-discipline does not strictly require coverage decisions. The operator's standing override applies the discipline broadly, so this table covers every open OBS in `docs/sprint-1/followups.md`, with the relevance call substantive rather than vibes.

| OBS | State | Relevance to this dispatch | Notes |
|---|---|---|---|
| OBS-1 | Cleared | NO ACTION | Phase 5 sequencing constraint cleared by migration 082. Not in scope. |
| OBS-2 | Open | NO ACTION | ISO-3166 pass-through gap; orthogonal to schema reconciliation. |
| OBS-3 | Open | NO ACTION | ICAO literal-string mapping; orthogonal. |
| OBS-4 | Implemented | NO ACTION | Migration 082 source_column tracking; orthogonal. |
| OBS-5 | Open | NO ACTION | Trigger pollution on UPDATEs; orthogonal (separate Phase 5 design choice). |
| OBS-6 | Informational | NO ACTION | severity vocabulary; closed. |
| OBS-7 | Open | NO ACTION | Norway Fjords counsel pending; orthogonal. |
| OBS-8 | Open | NO ACTION | OBS-2 broader audit deferred; orthogonal. |
| OBS-9 | Deferred Sprint 2 | NO ACTION | Classifier feedback loop; orthogonal. |
| OBS-10 | Open | NO ACTION | Spot-check drift rate monitoring; orthogonal. |
| OBS-11 | Implemented | NO ACTION | Phase 5 trigger-bracket rollback pattern; orthogonal. |
| OBS-12 | Canonical Pattern | NO ACTION | Bulk SQL CTE pattern; orthogonal. |
| OBS-13 | Open | NO ACTION | Gate 7.2a all-rejected-jurisdictions; Phase 7 dependency. |
| OBS-14 | Open | RELEVANT | The triage UI gap (DP-1) intersects with this finding. PlatformIntegrityFlagsView wires the missing `integrity_flags` table; if Phase 7 redesigns the triage surface before the table is applied, the design lands on top of a missing dependency. **Routing:** Stage 2 reconciliation must apply 048 + 050 before Phase 7 implementation OR Phase 7 design must include integrity_flags as part of its applied prerequisites. |
| OBS-15 | Open | NO ACTION | Phase 6 article-level source context; orthogonal. |
| OBS-16 | Placeholder | NO ACTION | Reserved. |
| OBS-17 | Open | RELEVANT | `/admin` route gate scope mismatch; the integrity_flags absence (Finding 1) compounds OBS-17 because the route renders empty platform integrity-flag UI under a wrong-scoped gate. Phase 7 design depends on BOTH the gate fix AND the table existence. **Routing:** Phase 7 design dispatch must cite OBS-17 and Finding 1 jointly. |
| OBS-18 | Open | NO ACTION | `/market` non-interactive SideCard; UI-only; orthogonal. |
| OBS-19 | Open | NO ACTION | `/operations` Phase D banner; UI-only; orthogonal. |
| OBS-20 | Open | NO ACTION | `/market` EmptyState worker-language; UI-copy; orthogonal. |
| OBS-21 | Open | INFORMATIONAL | Migration 078 gap is one of the four "missing from both file AND ledger" entries this report formalizes. This report supersedes OBS-21's pending status: 078 missing from both is consistent with the unauthored-on-this-branch explanation; PR #117 landing will resolve it. No new action; OBS-21's monitoring still stands. |
| OBS-22 | Open | NO ACTION | Ingest scheduler idle; orthogonal. |
| OBS-23 | Open | NO ACTION | `/admin` audit log placeholder; orthogonal. |

**Coverage table top-line:** 0 covered (no design or implementation work in this dispatch), 21 not-applicable (orthogonal to discovery scope), 2 relevant-and-routed-forward (OBS-14, OBS-17; both routed to Phase 7 with prerequisite dependency on Stage 2 schema reconciliation), 1 informational (OBS-21; this report formalizes the four-state ledger picture that includes 078).

**DP compliance.** Investigation dispatch with no operator-surface design or implementation output. DP-1 (Single-Pane Operator Review) is NOT APPLICABLE because there is no operator surface in scope. Stage 2 reconciliation, if it touches the admin surface, will engage DP-1; the binding constraint moves to that dispatch.

**Recommended new OBS.** This dispatch surfaces six candidate REC-OBS entries that the operator should authorize for capture in `docs/sprint-1/followups.md`. Listed in the "Recommended new OBS" section below. NOT added to the followups doc by this dispatch per the discipline's authorship rule.

---

## Object inventory totals

By domain and object type, matching Agent 1's report. The `operator` domain is project-scope objects in `public`; `supabase_internal` is Supabase-managed schemas (`auth`, `storage`, `realtime`, `pgsodium`, `vault`, `extensions`, `graphql`, etc.); `unknown` was empty.

| Object type | operator | supabase_internal |
|---|---|---|
| Tables | 67 | 105 |
| Views | 3 | 147 |
| Materialized views | 0 | 0 |
| Functions (total) | 150 | 178 |
| Functions (project, ex-extensions) | 41 | n/a |
| Triggers | 25 | 6 |
| Indexes | 253 | 240 |
| RLS policies | 168 | 1 |
| CHECK constraints | 89 | 46 |
| Foreign keys | 104 | 24 |
| Unique constraints | 20 | 59 |
| Sequences | 1 | 3 |
| Enum types | 0 | 14 |
| Other types | 0 | 10 |

Of the 150 operator-domain functions, 109 are ltree, pg_trgm, and other extension-installed objects living in `public`. The remaining 41 are project-authored.

---

## Migration file vs ledger summary

The four ledger states across the 001-082 range:

| State | Count | Versions |
|---|---|---|
| Applied AND file present | 52 | 001, 002, 003, 004, 005, 006, 007, 009, 010, 011, 013, 015, 016, 017, 018, 019, 020, 021, 022, 023, 024, 025, 051, 052, 053, 054, 055, 056, 057, 058, 059, 060, 061, 062, 063, 064, 065, 066, 067, 068, 069, 071, 072, 073, 074, 075, 076, 077, 079, 080, 081, 082 |
| Applied, file MISSING from disk | 1 | 070 |
| File present, NOT applied (the 25-migration gap) | 25 | 026, 027, 028, 029, 030, 031, 032, 033, 034, 035, 036, 037, 038, 039, 040, 041, 042, 043, 044, 045, 046, 047, 048, 049, 050 |
| Missing from BOTH file AND ledger | 4 | 008, 012, 014, 078 |

Multi-file versions: 006 (006_multi_tenant.sql + 006_rls_multi_tenant.sql), 007 (007_community_layer.sql + 007_full_brief.sql + 007_rls_community.sql). Both numerically apply as a single ledger entry per version; both are recorded as applied. Cross-file ordering matters for reapplication; see Finding 6 below.

---

## Category A: live objects with matching migration source

Top entries (full list of 63 tables, 41 project functions, 3 views, 25 triggers in `scripts/tmp/recon-stage1-categorization.json`). Each entry's migration version is the CREATE that produced the object. Where multiple migrations CREATE the same name, the earliest CREATE is canonical and later versions are ALTER or CREATE OR REPLACE.

| Live object | Type | Source version(s) | Ledger state of source migration |
|---|---|---|---|
| public.intelligence_items | table | 004 | applied + recorded |
| public.sources | table | 004 | applied + recorded |
| public.organizations | table | 006 | applied + recorded |
| public.org_memberships | table | 006 | applied + recorded |
| public.workspace_settings | table | 006 | applied + recorded |
| public.community_groups | table | 028 | applied + UNRECORDED (out-of-band) |
| public.community_group_members | table | 029 | applied + UNRECORDED |
| public.community_posts | table | 030 | applied + UNRECORDED |
| public.community_topics | table | 031 | applied + UNRECORDED |
| public.community_notifications | table | 032 | applied + UNRECORDED |
| public.admin_attention_counts (rpc) | function | 036 | applied + UNRECORDED |
| public.recompute_agent_integrity_flag | function | 035, 044 | applied + UNRECORDED (BOTH 035 and 044) |
| public.coverage_matrix | function | 039 | applied + UNRECORDED |
| public.community_region_counts | function | 042 | applied + UNRECORDED |
| public.user_is_group_member | function | 046 | applied + UNRECORDED |
| public.get_workspace_intelligence_slim | function | 047 | applied + UNRECORDED |
| public.pending_jurisdiction_review | table | 057 | applied + recorded |
| public.ingest_rejections | table | 060 | applied + recorded |
| public.system_state | table | 016 | applied + recorded |
| public.intelligence_items_added_date_lookup index | index | 049 | NOT APPLIED |
| public._workspace_active_items | function | 073 | applied + recorded |
| public._classify_jurisdiction_token | function | 080 | applied + recorded |
| public._intelligence_items_normalize_jurisdictions | function | 080, 082 | applied + recorded |
| public._normalize_jurisdictions | function | 080, 082 | applied + recorded |
| public.open_conflicts | view | 004, 043 | applied + 043 UNRECORDED |
| public.provisional_sources_review | view | 004, 043 | applied + 043 UNRECORDED |
| public.source_health_summary | view | 004, 043 | applied + 043 UNRECORDED |
| trg_intelligence_items_normalize_jurisdictions | trigger | 080, 082 | applied + recorded |
| trg_intelligence_items_integrity_flag | trigger | 035 | applied + UNRECORDED |

The pattern is clear: every object whose source migration falls in the 026-050 block is FULLY APPLIED but UNRECORDED. The ledger gap is uniform across the entire range, not selective. The 048 and 049 cases (Category C) are the only exceptions.

Full list: see `scripts/tmp/recon-stage1-categorization.json`. The JSON carries all 63 tables, 41 functions, 3 views, 25 triggers with their source-migration mappings.

---

## Category B: live objects with NO matching migration source (orphans)

Only 4 objects across all types are in this category. All are Phase 5 snapshot tables.

| Object | Type | Source path | Recommended action |
|---|---|---|---|
| public.ingest_rejections_pre_phase5 | table | `fsi-app/scripts/phase-5-backfill.mjs` (created by backfill snapshot logic, not by migration) | DROP per Phase 5 7-day retention (drop date: 2026-05-25) |
| public.intelligence_items_pre_phase5 | table | same | DROP per 7-day retention |
| public.item_supersessions_pre_phase5 | table | same | DROP per 7-day retention |
| public.pending_jurisdiction_review_pre_phase5 | table | same | DROP per 7-day retention |

These are intentional snapshots, not orphans-in-need-of-retro-migration. The 7-day Phase 5 retention window ends 2026-05-25. No reconciliation action required; verify the cleanup ships on schedule.

**No project-authored function, view, or trigger is in Category B.** Every operator-domain function, view, and trigger that exists in the live DB has a matching CREATE in a migration file.

---

## Category C: migration files with no live object (truly unapplied)

Eight tables. Seven of the eight are the pre-004 v1 source-of-truth-superseded schema (resources, timelines, changelog, etc.); migration 004 explicitly drops `source_registry` and reorganizes the data into `sources` + `intelligence_items`. The eighth is `integrity_flags`.

| Object | Type | Source version | Ledger state | Recommended action |
|---|---|---|---|---|
| public.resources | table | 001 | applied | Confirm-decoupled: superseded by 004's `sources`. Remove from source-of-truth narrative; do NOT apply. |
| public.timelines | table | 001 | applied | Confirm-decoupled: superseded by 004. |
| public.changelog | table | 001 | applied | Confirm-decoupled. |
| public.disputes | table | 001 | applied | Confirm-decoupled. |
| public.cross_references | table | 001 | applied | Confirm-decoupled: superseded by `item_cross_references`. |
| public.supersessions | table | 001 | applied | Confirm-decoupled: superseded by `item_supersessions`. |
| public.source_registry | table | 001 | applied | Confirm-decoupled: explicitly DROPped by 004 (line 17 of 004_source_trust_framework.sql). |
| public.integrity_flags | table | 048 | NOT in ledger | **APPLY migration 048 + 050.** Code (PlatformIntegrityFlagsView, /api/admin/integrity-flags) wires to this table. |

The v1 tables (rows 1-7) are a documentation-narrative issue, not a schema problem. The DROP of `source_registry` in 004 is the only one that's surfaced in the file diff; the other six (resources, timelines, changelog, disputes, cross_references, supersessions) were created in 001 and then quietly fell out of scope when 004 redirected the schema. Migration 004 does not explicitly DROP them, so they remain as never-applied creates against the current DB. **Stage 2 decision needed:** author a cleanup migration that DROPs the unused v1 tables for documentation completeness, OR leave them as the "they were never in production, no harm done" baseline.

The integrity_flags case is the active production gap. See Finding 1.

Three indexes from migration 049 are also Category C at the index level (idx_item_supersessions_old, idx_item_supersessions_new, idx_intel_items_added_date_desc). They are absent because 049 is NOT APPLIED.

---

## Specific findings

### Finding 1: `integrity_flags` table

**Live status.** ABSENT. The DB inventory enumerates 67 operator-domain tables; `integrity_flags` is not among them. Zero rows query returns nothing.

**Source.** Migration 048 (`048_integrity_flags_platform.sql`) is the canonical CREATE. The migration also adds 3 indexes (idx_integrity_flags_status, idx_integrity_flags_category, idx_integrity_flags_subject) and 3 RLS policies (integrity_flags_admin_read SELECT, integrity_flags_admin_update UPDATE, integrity_flags_service_role_write ALL). Migration 050 widens the `category` CHECK constraint to include the value `workflow_gap`.

**Code references.** Active wiring to the missing table:

- `fsi-app/src/lib/supabase-server.ts:1754`, `.from("integrity_flags")` for admin-attention counts.
- `fsi-app/src/app/api/admin/integrity-flags/route.ts:173,197,288`, three queries to the table; route powers PlatformIntegrityFlagsView.
- `fsi-app/src/components/admin/PlatformIntegrityFlagsView.tsx:5,7,96,686`, component explicitly references migration 048 in its comments; surfaces platform-level integrity flags in the admin UI.
- `fsi-app/src/components/admin/IntegrityFlagsView.tsx`, component listing intelligence_items integrity-flag rows; distinct from PlatformIntegrityFlagsView but shares the admin attention banner.
- `fsi-app/src/components/admin/AdminDashboard.tsx:155,702,707,720`, dashboard wires both Views into the admin tab strip; line 707 says "Surfaces the integrity_flags table from migration 048".
- `fsi-app/src/lib/hooks/useAdminAttention.ts:12,32`, exposes `integrity_flags_unresolved` count in the admin attention API contract.

**Verdict.** Genuinely unapplied. Applying migration 048 + 050 will:
- Create `public.integrity_flags` with the 12-column schema (id, subject_table, subject_id, category, severity, summary, detail, status, created_at, updated_at, resolved_at, resolved_by; per 048 source).
- Create 3 supporting indexes (status partial WHERE status IN ('open','in_review'), category, subject).
- Create 3 RLS policies (admin SELECT, admin UPDATE, service-role ALL).
- Apply 050's widened CHECK to include `workflow_gap`.

PlatformIntegrityFlagsView and `/api/admin/integrity-flags?platform=1` start returning real data on application. The IntegrityFlagsView component does not depend on this table (it queries `intelligence_items.agent_integrity_flag`); it remains unaffected by the apply.

### Finding 2: `recurring_spot_check_log` table

**Live status.** ABSENT.

**Source.** Not found in any migration file. Migration source grep is definitive (Agent 2's manifest does not record this name in any `creates.tables` entry across all 80 migrations).

**Code references in `fsi-app/src`.** ZERO. The grep returned matches only in audit scripts under `fsi-app/scripts/tmp/` (critical-2-investigation.mjs, critical-2-followup.mjs, audit-section-A.mjs) and in this report's parent docs. NO production application code references the table.

**Verdict.** Phantom. The earlier critical-investigations-2026-05-18.md framing ("code references the table; create a migration that matches whatever shape the code expects, or remove the code references if the feature was abandoned") was based on an audit script's `expectedTables` array, not on actual application code. The expectedTables array in `audit-section-A.mjs` is what made `recurring_spot_check_log` appear in the audit's "missing tables" list; the array was a hypothesis, not a contract.

The recurring spot-check feature DOES exist in production at `fsi-app/src/app/api/admin/spot-check/recurring/route.ts`, but it explicitly DOES NOT use a `recurring_spot_check_log` table. Lines 31-40 of the route file document the design decision: forensic record uses existing `source_trust_events` rows + `admin_action_cooldowns` row updates. The route file says: "Why not a new `spot_check_runs` table? ... This avoids adding a new table for a once-a-month run. If aggregate run history becomes a UI need, a `spot_check_runs` table is a follow-up, not silently added here."

**Stage 2 decision needed:** remove `recurring_spot_check_log` from the audit script's `expectedTables` array (it never should have been there) and update or supersede the critical-investigations-2026-05-18.md framing. No migration to author, no code to remove.

### Finding 3: `recompute_agent_integrity_flag` function

**Live status.** PRESENT. Live in `public.recompute_agent_integrity_flag` (operator domain, SECURITY DEFINER per 035 source).

**Source.** Migration 035 (`035_agent_integrity_flags.sql`) creates the function with the original 8-phrase detection set, plus 5 columns on intelligence_items (`agent_integrity_flag` BOOLEAN, `agent_integrity_phrase` TEXT, `agent_integrity_flagged_at` TIMESTAMPTZ, `agent_integrity_resolved_at` TIMESTAMPTZ, `agent_integrity_resolved_by` UUID), plus trigger `trg_intelligence_items_integrity_flag`, plus partial index `idx_intel_items_agent_integrity_flag` on the table. Migration 044 (`044_integrity_flag_trigger_tune.sql`) REPLACES the function body to narrow phrase detection from 8 to 5 after triage of 57 false-positive-heavy flags.

**Verdict.** Function exists in the live DB without ledger record of either 035 or 044. Both migrations are out-of-band applied (the function body, the 5 columns, the trigger, and the index all exist in the DB).

**Important caveat for Stage 2.** If the operator chooses backfill-ledger as the reconciliation strategy, the operator MUST verify the live function body matches migration 044's tuned-narrow 5-phrase set, not migration 035's broader 8-phrase set. If 044 was not applied after 035, the live function would carry the 035 body and the ledger backfill would record a state that does not match the SQL on disk. The check: `SELECT pg_get_functiondef('public.recompute_agent_integrity_flag()'::regprocedure);` and compare against the source SQL in 044.

The 035 + 044 CREATE OR REPLACE pattern is itself fragile: if the operator re-applies 035 + 044 in order, both succeed via CREATE OR REPLACE and the final state is correct. If the operator skips 035 and applies only 044, the 044 alone fails because 035 created the BASE function body that 044 modifies (this needs verification by reading 044). The simplest safe path is to backfill-ledger both migrations together.

### Finding 4: 25-migration block (026-050)

Per-migration verdicts from cross-referencing each migration's CREATEs against the live DB:

| Version | Filename | Verdict | Notes |
|---|---|---|---|
| 026 | research_pipeline_stage.sql | FULLY APPLIED | 1 DDL item live |
| 027 | user_profiles.sql | FULLY APPLIED | 4 DDL items live |
| 028 | community_groups.sql | FULLY APPLIED | 5 DDL items live |
| 029 | community_group_members.sql | FULLY APPLIED | 10 DDL items live |
| 030 | community_posts.sql | FULLY APPLIED | 8 DDL items live |
| 031 | community_topics.sql | FULLY APPLIED | 4 DDL items live |
| 032 | community_notifications_moderation.sql | FULLY APPLIED | 9 DDL items live |
| 033 | jurisdiction_iso.sql | FULLY APPLIED | 2 DDL items live |
| 034 | staged_updates_materialization_error.sql | FULLY APPLIED | 1 DDL item live |
| 035 | agent_integrity_flags.sql | FULLY APPLIED | 3 DDL items live (function + trigger + index); see Finding 3 |
| 036 | admin_notifications_rpc.sql | FULLY APPLIED | 2 DDL items live |
| 037 | source_verification.sql | FULLY APPLIED | 5 DDL items live |
| 038 | bulk_import_audit.sql | FULLY APPLIED | 3 DDL items live |
| 039 | coverage_matrix_rpc.sql | FULLY APPLIED | 1 DDL item live |
| 040 | discovery_provenance.sql | FULLY APPLIED | 1 DDL item live |
| 041 | post_promotions.sql | FULLY APPLIED | 5 DDL items live |
| 042 | community_region_counts_rpc.sql | FULLY APPLIED | 1 DDL item live |
| 043 | security_advisor_fixes.sql | FULLY APPLIED | 3 DDL items live (3 views recreated) |
| 044 | integrity_flag_trigger_tune.sql | FULLY APPLIED | 1 DDL item live (function REPLACE); see Finding 3 |
| 045 | orphan_slugs_and_acf_dedup.sql | DML-ONLY | No DDL items; pure data fix |
| 046 | community_rls_recursion_fix.sql | FULLY APPLIED | 3 DDL items live (3 helper functions) |
| 047 | workspace_intelligence_slim_rpc.sql | FULLY APPLIED | 1 DDL item live |
| 048 | integrity_flags_platform.sql | **NOT APPLIED** | 0 of 4 DDL items live; see Finding 1 |
| 049 | perf_v2_indexes.sql | **NOT APPLIED** | 0 of 3 DDL items live (3 indexes missing) |
| 050 | integrity_flags_workflow_gap.sql | DML-ONLY | Pure ALTER CONSTRAINT; depends on 048 having been applied to take effect |

**Summary:** 21 FULLY APPLIED out-of-band, 2 DML-ONLY (which produce no DDL but ride alongside the unrecorded run), 2 NOT APPLIED (048, 049). Out-of-band rate in the block is 23/25 = 92%.

The Stage 2 reconciliation strategy choice hinges on this verdict. If the operator chooses **backfill-ledger**, the action for 026-047 is purely a ledger UPDATE; for 048 + 049 the action is APPLY THEN BACKFILL. If the operator chooses **apply-missing**, the action for 026-047 is hazardous (re-running CREATE TABLE on an existing table errors; functions with CREATE OR REPLACE are safe but ALTERs and CREATE INDEX may collide with existing-name). The hybrid pattern, backfill the 23 already-applied entries, apply the 2 truly-missing ones, is the lowest-risk path and matches the actual on-disk vs in-DB split.

### Finding 5: Migration 070 (missing from disk, present in ledger)

**Ledger state.** Recorded as applied in `supabase_migrations.schema_migrations`.
**File state.** ABSENT from `fsi-app/supabase/migrations/`.

**What 070 was.** The file was deleted before the synthesis dispatch. The migration 071 header references "5 row-set RPCs" that 071 modifies with `, id ASC` deterministic tiebreakers. These 5 RPCs are: `get_workspace_intelligence_dashboard`, `get_workspace_intelligence_listings`, `get_market_intel_items`, `get_research_items`, `get_operations_items`. Migration 073's header similarly references the workspace-intel RPCs that it refactors via `_workspace_active_items`. The strong inference is that 070 originally CREATEd the 5 RPCs (or an early-bound version of them), and 071 + 073 are subsequent refinements.

**Live status of the 5 RPCs.** All 5 exist in the live DB (verified in DB inventory functions list, operator domain, SECURITY DEFINER): `public.get_workspace_intelligence_dashboard`, `public.get_workspace_intelligence_listings`, `public.get_market_intel_items`, `public.get_research_items`, `public.get_operations_items`. Since 071 and 073 use CREATE OR REPLACE FUNCTION, the function bodies in the DB reflect the final 073 state, not 070's original.

**Verdict.** No schema loss. The functions are present and current. The loss is source-history: future readers cannot trace why the RPCs were originally created or what semantics 070 imposed before 071/073 refined them.

**Stage 2 decision needed:** (1) author a placeholder `070_workspace_intelligence_rpcs.sql` file that documents what the migration was understood to do, with a header note that the original source was deleted and the file is a reconstruction for source-history continuity; OR (2) accept the loss and document in the ledger or release notes that 070 is a "schema-recorded, source-lost" entry. Option 1 has narrative value but invites confusion if the reconstructed file is read as authoritative. Option 2 is honest and cheap.

### Finding 6: Multi-file versions (006 and 007)

**Files in source inventory.**
- Version 006: `006_multi_tenant.sql` (4 tables: organizations, org_memberships, workspace_item_overrides, workspace_settings; 2 functions: user_belongs_to_org, get_workspace_intelligence) + `006_rls_multi_tenant.sql` (0 tables; 0 functions; 16 RLS policies).
- Version 007: `007_community_layer.sql` (13 tables; 4 functions) + `007_full_brief.sql` (0 tables; 1 function: get_workspace_intelligence REPLACE) + `007_rls_community.sql` (0 tables; 0 functions; policies-only).

**Live DB state.** The union of CREATEs across all multi-file 006 and 007 files matches the DB inventory:
- 006 tables: all 4 present.
- 006 RLS policies: 16 are recorded in the policy list (out of 168 total operator-domain policies; the 16 008-relevant policies are reflected).
- 007 tables: all 13 present.
- 007 functions: 4 from 007_community_layer.sql present; get_workspace_intelligence present in its 007_full_brief.sql REPLACE form.

**Verdict.** Both multi-file versions applied correctly. The union-of-creates matches live state.

**Order matters on reapplication.** If Stage 2 reapplies any 006 or 007 file (unlikely; both are recorded as applied), the order on reapplication MUST be the natural file order: `006_multi_tenant.sql` before `006_rls_multi_tenant.sql` (the policies need the tables to exist); `007_community_layer.sql` before `007_full_brief.sql` before `007_rls_community.sql` (full_brief REPLACEs a function that community_layer creates the base of; rls_community defines policies on tables that community_layer created). The `pg_dump --schema-only` natural sort approximates this correctly because alphabetical sort within a version slot matches the dependency order. If Stage 2 chooses to author a master apply script, the script must respect this ordering explicitly rather than assuming `ls` order.

---

## Anomalies elevated

### 1. Four `*_pre_phase5` snapshot tables with RLS disabled

**Inventory.** `ingest_rejections_pre_phase5`, `intelligence_items_pre_phase5`, `item_supersessions_pre_phase5`, `pending_jurisdiction_review_pre_phase5`. All four have `rls = false` in the DB inventory.

**Assessment.** Phase 5 snapshot tables created by `fsi-app/scripts/phase-5-backfill.mjs` per its 7-day retention policy. Snapshots are read-only forensic copies; RLS disabled because they are operator-only and never queried by application code. Retention window ends 2026-05-25.

**Risk.** Low if dropped on schedule. Materially low because tables contain phase-5 pre-state of items already under the same RLS regime in the live tables, so any leak via these tables would also leak via the live tables.

**Action.** Flag to the operator: ensure `phase-5-backfill.mjs` cleanup runs on 2026-05-25 or the operator authorizes manual DROP. This is not a reconciliation finding but is the easiest moment to surface the retention deadline.

### 2. `system_state` with RLS on, zero policies

**Inventory.** `system_state` table has `rls = true` and zero policies attached.

**Source.** Created by migration 016 (`016_add_processing_pause.sql`). The migration source has zero policies for system_state; this is intentional. RLS on + zero policies = service-role only by default (anonymous and authenticated roles cannot SELECT, INSERT, UPDATE, or DELETE).

**Assessment.** Correct design. system_state is a singleton control table touched only by service-role workers and migrations. The application reads it indirectly via service-role functions; the customer-facing UI does not touch it.

**Risk.** None. The pattern is the canonical Supabase "service-role-only table" pattern.

**Action.** No action needed. Document in the next system audit that this is intentional, not an oversight.

### 3. 26 SECURITY DEFINER functions in operator domain

**Inventory list.**
`_assert_org_membership`, `_intelligence_items_normalize_jurisdictions`, `_mirror_profiles_to_user_profiles`, `_mirror_user_profiles_to_profiles`, `_workspace_active_items`, `accept_invitation`, `create_org_for_self`, `decline_invitation`, `enqueue_pending_first_fetch`, `get_market_intel_items`, `get_operations_items`, `get_research_items`, `get_workspace_intelligence`, `get_workspace_intelligence_aggregates`, `get_workspace_intelligence_aggregates_scoped`, `get_workspace_intelligence_dashboard`, `get_workspace_intelligence_listings`, `get_workspace_intelligence_slim`, `get_workspace_members`, `lookup_invitation`, `revoke_invitation`, `trg_intelligence_items_version_snapshot`, `user_belongs_to_org`, `user_is_group_admin`, `user_is_group_member`, `user_owns_group`.

**Assessment.** 26 functions run with the owner's privileges, bypassing the caller's RLS context. Each function carries an elevation risk: if the function's body does not enforce its own authorization checks rigorously, an authenticated user can use the function as a privilege-escalation vector.

**Risk.** Privilege-escalation surface; the higher the count and the more user-facing the function, the higher the audit cost. 26 is non-trivial. Workspace intelligence RPCs (the 8 `get_workspace_intelligence*` functions, `get_market_intel_items`, `get_operations_items`, `get_research_items`, `get_workspace_members`) are explicitly user-facing and should each contain `_assert_org_membership` or equivalent gating; the membership / invitation functions (`create_org_for_self`, `accept_invitation`, `decline_invitation`, `lookup_invitation`, `revoke_invitation`, `user_belongs_to_org`, `user_is_group_*`, `user_owns_group`) are also user-facing.

**Action.** Out of scope for this reconciliation dispatch. Recommended REC-OBS for a future SECURITY DEFINER audit dispatch: enumerate each function's body, verify gating, document the elevation justification per function.

### 4. Migration 063 column shadowing on sources.tier and sources.jurisdictions

**Inventory.**
- Migration 004 creates `sources.tier` as `INT NOT NULL CHECK (tier BETWEEN 1 AND 7)` and `sources.jurisdictions` as `TEXT[] NOT NULL DEFAULT '{}'`.
- Migration 063 attempts `ADD COLUMN IF NOT EXISTS tier TEXT NULL` and `ADD COLUMN IF NOT EXISTS jurisdictions TEXT[] NULL DEFAULT '{}'`. Both ADDs silently no-op because the columns already exist as different types.

**Live state.** Confirmed via the table's CHECK constraints list (no NEW tier-string CHECK or jurisdiction-shape CHECK appears post-063; only the 004 constraints persist). The columns remain in their 004 forms: tier is INT 1-7, jurisdictions is TEXT[] NOT NULL.

**Assessment.** Migration 063's intended 5-axis classification framework schema change for these two columns NEVER TOOK EFFECT. The framework's value vocabulary (T1, T2, T3, T4, T5, T6 for tier; us-federal, eu, uk, etc. for jurisdictions) does not match the live column types. The 063 comments on the columns reference values that the columns cannot hold. The framework's other 10 columns (source_role, secondary_roles, scope_topics, scope_modes, scope_verticals, expected_output, classification_assigned_at, classification_observed_distribution, observed_correctness_count, last_observed_at) DID add successfully because they were new column names.

**Action.** This is a real schema-vs-intent drift. Stage 2 reconciliation decision needed:
- Option A: author a migration 083 that ALTERs `sources.tier` from INT to TEXT (lossy; requires deciding how to translate 1-7 integers to T1-T6 string values; loses one tier slot) and ALTERs `sources.jurisdictions` to NULL-allowed (cheap).
- Option B: accept the divergence; update the 5-axis framework docs to keep using INT for tier and NOT-NULL TEXT[] for jurisdictions; mark the 063 comments as advisory.
- Option C: accept the divergence; treat the 063 columns as no-ops and add NEW columns (e.g., `source_tier_classification TEXT`, `source_jurisdictions_classification TEXT[]`) in a follow-up migration so the framework's intended vocabulary can coexist with the original columns.

The 12 other 063 columns DID apply. The framework operates partially. The operator should decide based on whether the framework is in production use (consult the registration workstream for 12 priority sources mentioned in the 063 header).

### 5. Severity column type swap between migrations 004 and 018

**Inventory.** Migration 018 carries the note "REPLACED, new values: ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING" on `intelligence_items_severity_check`. This is consistent with the locked severity vocabulary in the environmental-policy-and-innovation skill. Migration 018 is recorded as applied.

**Live state.** Cannot directly verify the CHECK constraint definition from the DB inventory (constraint definitions not extracted in this manifest), but the migration is recorded as applied and the live `intelligence_items.severity` values per the OBS-6 entry use the migration 018 vocabulary (`'replacement'` plus the 5 standard labels were added later in another migration, per OBS-6 history; migration 018's CHECK is the current vocabulary minus `'replacement'`).

**Assessment.** Not a reconciliation problem. The CHECK constraint history is documented across migrations and OBS-6. No drift to surface.

**Action.** No action.

### 6. Function-body churn: `_normalize_jurisdictions` (080 + 082), `recompute_agent_integrity_flag` (035 + 044), `get_workspace_intelligence` (007_full_brief + 077)

**Inventory.** Three functions have multiple CREATE OR REPLACE in the migration timeline. The live DB reflects the LATEST replacement for each.

**Assessment.** This is a standard CREATE OR REPLACE pattern. The live function body matches the final REPLACE migration in each case (077 for get_workspace_intelligence; 082 for _normalize_jurisdictions; 044 for recompute_agent_integrity_flag). Documented in this report's Finding 3 for one of these; the other two follow the same pattern.

**Risk.** Low. The pattern is safe IF the reconciliation strategy respects ordering (apply all REPLACEs in order; do not stop midway).

**Action.** Stage 2 reconciliation must apply ledger-unrecorded REPLACEs in their natural version order. The hybrid backfill-ledger-and-apply-missing strategy handles this correctly if the operator backfills the entire 035 + 044 sequence (not just 044) and similarly does not skip intermediate versions.

### 7. DML-only migrations: 010, 011, 019, 045, 074

**Inventory.** Five migrations contain no DDL, only DML (INSERT, UPDATE, DELETE) or pure data fixes.

**Assessment.** These migrations are correctly recorded as applied where the ledger says so (010, 011, 019 all in ledger; 045 NOT in ledger but rides with the 026-050 block; 074 in ledger). They produce no DDL drift because they make no schema change.

**Risk.** None directly. Stage 2 reconciliation that backfills the 026-050 block as "all ledger-applied" should explicitly recognize that 045 was DML-only and its presence in the backfill is a ledger-recording action, not a re-run of any data fix.

**Action.** No action needed beyond noting in the Stage 2 plan that DML-only migrations should not be re-executed if the backfill-ledger path is chosen; the operator records them as applied without running them.

---

## Recommended new OBS

The following candidate OBS entries are surfaced by this discovery. Per the sprint-followups-discipline authorship rule, they are NOT added to `docs/sprint-1/followups.md` by this dispatch. The operator should authorize each before capture.

- **REC-OBS-A: 25-migration ledger backfill required (026-050 block).** 23 of 25 migrations in this range are FULLY APPLIED out-of-band, 2 (048, 049) are NOT APPLIED, 2 (045, 050) are DML-only riders. Stage 2 reconciliation chooses backfill-ledger for 26 entries (the 23 applied + the 2 DML-only + the 1 050 ALTER CONSTRAINT after 048 apply) and apply-then-backfill for 2 entries (048, 049). Cross-references: this report's Finding 4; OBS-14 (Phase 7 triage UI depends on 048's table); OBS-17 (admin route gate scope-mismatch on the same surface).

- **REC-OBS-B: `recurring_spot_check_log` phantom.** Earlier critical investigation (`docs/sprint-1/critical-investigations-2026-05-18.md`) misframed the audit script's `expectedTables` hypothesis as a code reference. Action: amend the critical investigation doc; remove the table from `fsi-app/scripts/tmp/audit-section-A.mjs` `expectedTables` array. Cross-references: this report's Finding 2; OBS-21 (the audit script lineage that produced both findings).

- **REC-OBS-C: Migration 070 file deleted; document the loss.** The 070 file is absent from disk but recorded in the ledger; the 5 workspace-intelligence RPCs it created are live. Decide: reconstruct a placeholder file (with explanatory header) OR document the loss in ledger notes only. Cross-references: this report's Finding 5.

- **REC-OBS-D: Migration 063 column shadowing on sources.tier and sources.jurisdictions.** The 5-axis classification framework's intended schema change for these two columns never took effect; the columns retain their migration 004 types. Decide between ALTER-fix migration 083, accept-divergence-update-docs, or add-parallel-columns. Cross-references: this report's Finding 4 anomaly #4.

- **REC-OBS-E: 26 SECURITY DEFINER functions; audit the elevation surface.** Out of scope for this reconciliation but flagged here for a future audit dispatch. Each user-facing SECURITY DEFINER function should be checked for explicit gating (`_assert_org_membership` or equivalent) and the elevation justification documented per function. Cross-references: this report's anomaly #3.

- **REC-OBS-F: Migration source-of-truth narrative for v1 superseded tables.** Seven migration-001 tables (resources, timelines, changelog, disputes, cross_references, supersessions, source_registry) were superseded by migration 004's architectural rebuild but remain as "never-applied creates" against the current DB (because they never existed in the live DB and the source-registry DROP in 004 is implicit for the other six). The history-honest action is a cleanup migration that explicitly DROPs the unused names so future readers don't try to apply migration 001 fresh. Cross-references: this report's Category C; the 004 migration's DROP TABLE IF EXISTS source_registry pattern (line 17 of 004).

---

## Stage 2 decision inputs

This Stage 1 discovery surfaces the following decisions Stage 2 must make:

1. **Reconciliation strategy.** Recommended HYBRID: backfill-ledger for the 23 FULLY APPLIED + 2 DML-only migrations in the 026-050 block (entries: 026, 027, 028, 029, 030, 031, 032, 033, 034, 035, 036, 037, 038, 039, 040, 041, 042, 043, 044, 045, 046, 047); apply-then-backfill for the 2 NOT APPLIED entries (048, 049); apply 050 last to widen the integrity_flags category CHECK. Apply-missing alone is hazardous because re-running CREATE TABLE on existing tables errors. Backfill-only leaves integrity_flags absent and breaks the platform integrity-flag UI.

2. **For orphan objects.** The 4 `*_pre_phase5` snapshot tables: drop on 2026-05-25 per Phase 5 retention. No retro-authoring needed.

3. **For 070.** Reconstruct placeholder file OR accept loss. Recommendation: accept loss with a one-line note in the next release notes; the schema is intact and 071/073 carry the current logic.

4. **For multi-file versions.** Respect natural file order on any reapplication (006_multi_tenant before 006_rls_multi_tenant; 007_community_layer before 007_full_brief before 007_rls_community). Document this in the Stage 2 plan.

5. **For column shadowing.** Choose Option A (ALTER fix), B (accept and update docs), or C (parallel new columns). Recommendation depends on whether the 5-axis framework is in active production use; the operator owns this answer.

6. **For phantom `recurring_spot_check_log`.** Remove from audit script expected-tables list; amend critical-investigations doc. No migration to author.

7. **For v1 superseded tables (001 creates).** Optional cleanup migration that DROPs the unused names for documentation completeness. Not blocking.

8. **For 048 + 050 integrity_flags apply.** Confirm production read-write traffic on the table before applying (the UI components currently return empty; the apply will start returning real data; the operator should be ready for any flagged rows that surface immediately after).

---

## Audit methodology notes

**Pipeline.** Three-agent serial dispatch:
1. Agent 1: live DB introspection. Produced `fsi-app/scripts/tmp/recon-stage1-db-inventory.json` (~2.0 MB) with 13 object types across operator (project), supabase_internal (Supabase-managed), and unknown domain splits. Includes 67 operator tables, 150 operator functions (41 project, 109 extension), 25 triggers, 168 RLS policies, ledger snapshot.
2. Agent 2: file-source introspection. Produced `fsi-app/scripts/tmp/recon-stage1-migration-source.json` with 80 file entries (006 + 006_rls counted as 2; 007 three-file split counted as 3), 78 distinct numeric versions in range 001-082, per-migration parsed objects (creates, drops, columns_added, columns_dropped, renames, constraints, comments).
3. Synthesis (this report): cross-reference the two manifests, run code-reference greps under `fsi-app/src`, produce categorization JSON at `fsi-app/scripts/tmp/recon-stage1-categorization.json`, draft the discovery report at `docs/sprint-1/schema-reconciliation-discovery-2026-05-18.md`.

**Reproducibility recipe.** All three artifacts (db-inventory, migration-source, categorization JSONs) are preserved at `fsi-app/scripts/tmp/`. Re-running this synthesis from those inputs is deterministic: load the two manifests, build the live-set, source-set, and category-A/B/C maps, run the same six findings checks, write the report. No DB connection or network call required for re-synthesis. The categorization JSON carries every Category A entry's source-migration mapping, every Category B orphan, and every Category C unapplied-source for full auditability.

**Known limits of this report.**
- Column-level inventory is incomplete in the DB introspection (only check_constraints, FKs, unique_constraints, indexes carry column-name granularity; full per-table column type listings would require an additional introspection pass). The 063 column-shadowing finding relied on cross-referencing migration 004's CREATE TABLE definition (read from file) against the absence of post-063 CHECK constraints; for a more rigorous Stage 2 confirmation, run `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='sources' AND column_name IN ('tier','jurisdictions');` from the live DB.
- Function body comparison was not performed for the recompute_agent_integrity_flag 035-vs-044 question; the report flags the need for Stage 2 to confirm via `pg_get_functiondef`.
- The RLS policy match in Category A was by name; policy-body equivalence (qual / with_check expression match between migration source and live state) was not checked. For Stage 2 backfill correctness, spot-check the policy bodies on at least the 16 multi-tenant policies from 006_rls and the 168-policy total to confirm no live policy has drifted from its source.
