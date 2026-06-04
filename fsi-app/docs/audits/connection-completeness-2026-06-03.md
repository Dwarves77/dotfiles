# Connection Completeness — fsi-app — 2026-06-03 (READ-ONLY)

Mechanical re-derivation of write-side + read-side connection state for **every** public table, from the whole codebase (787 files) AND every Postgres function/trigger body (160 fns) — the RPC/trigger layer a `.from()` grep undercounts. Reverse orphan scan included. Goal: zero unknowns.

**Zone legend:** runtime = src/ (app+lib, incl. RPCs reachable via .rpc) · ops = scripts/ + supabase/seed · trigger = pg trigger fn body · migration = DDL/backfill.

## Verdict tally

| count | verdict |
|---|---|
| 30 | CONNECTED-LIVE |
| 12 | BATCH-WRITE / READ-LIVE |
| 10 | OTHER |
| 8 | ISOLATED (no refs, empty) |
| 7 | READ-ONLY (no writer) |
| 6 | WRITE-ONLY |
| 3 | WRITE-LIVE / READ-OPS-ONLY |
| 2 | SEED/BACKUP (write-only, no reader) |
| 1 | INVESTIGATE (rows, no code ref) |

## Every table

| table | rows | W-zones | R-zones | trig | runtime RPC reader | verdict |
|---|---|---|---|---|---|---|
| `source_verifications` | 1414 | runtime/ops | runtime/ops | 0 | — | **CONNECTED-LIVE** |
| `source_trust_events` | 828 | runtime/ops | runtime | 0 | — | **CONNECTED-LIVE** |
| `sources` | 799 | runtime/ops/migration | runtime/ops/migration | 5 | get_tier_opinion_disagreements,get_research_source_coverage,admin_attention_counts,coverage_matrix | **CONNECTED-LIVE** |
| `intelligence_items` | 657 | runtime/ops/migration/trigger | runtime/ops/migration | 7 | detect_intersections,admin_attention_counts,coverage_matrix | **CONNECTED-LIVE** |
| `provisional_sources` | 497 | runtime/ops/migration | runtime/ops/migration | 0 | admin_attention_counts | **CONNECTED-LIVE** |
| `integrity_flags` | 485 | runtime/ops/migration/trigger | runtime/ops/migration | 0 | — | **CONNECTED-LIVE** |
| `canonical_source_candidates` | 370 | runtime/ops | runtime | 0 | — | **CONNECTED-LIVE** |
| `ingest_rejections` | 131 | runtime/ops/migration/trigger | runtime/ops/migration | 0 | — | **CONNECTED-LIVE** |
| `pending_jurisdiction_review` | 110 | runtime/ops/migration/trigger | runtime/ops | 0 | — | **CONNECTED-LIVE** |
| `region_dimension_coverage` | 30 | migration/trigger | runtime | 0 | — | **CONNECTED-LIVE** |
| `staged_updates` | 24 | runtime/ops | runtime/ops/migration | 0 | admin_attention_counts | **CONNECTED-LIVE** |
| `pending_first_fetch` | 13 | runtime/ops/migration/trigger | runtime/ops | 0 | — | **CONNECTED-LIVE** |
| `workspace_item_overrides` | 3 | runtime | runtime/ops/migration | 1 | — | **CONNECTED-LIVE** |
| `org_memberships` | 2 | runtime/migration | runtime/ops/migration | 0 | revoke_invitation | **CONNECTED-LIVE** |
| `profiles` | 2 | runtime/ops/migration/trigger | runtime/ops/migration | 1 | — | **CONNECTED-LIVE** |
| `admin_action_cooldowns` | 1 | runtime | runtime | 0 | — | **CONNECTED-LIVE** |
| `organizations` | 1 | runtime/ops/migration | runtime/ops/migration | 1 | lookup_invitation | **CONNECTED-LIVE** |
| `system_state` | 1 | runtime/ops/migration | runtime/ops | 0 | — | **CONNECTED-LIVE** |
| `workspace_settings` | 1 | runtime/ops/migration | runtime/ops/migration | 1 | — | **CONNECTED-LIVE** |
| `community_group_invitations` | 0 | runtime | runtime | 0 | — | **CONNECTED-LIVE** |
| `community_group_members` | 0 | runtime/ops | runtime/migration | 1 | — | **CONNECTED-LIVE** |
| `community_groups` | 0 | runtime/ops/migration/trigger | runtime/ops/migration | 0 | community_region_counts | **CONNECTED-LIVE** |
| `community_posts` | 0 | runtime/ops/migration/trigger | runtime/ops/migration | 1 | — | **CONNECTED-LIVE** |
| `moderation_reports` | 0 | runtime/ops | runtime | 0 | — | **CONNECTED-LIVE** |
| `notification_events` | 0 | runtime | runtime/migration | 0 | — | **CONNECTED-LIVE** |
| `notification_preferences` | 0 | runtime | runtime | 1 | — | **CONNECTED-LIVE** |
| `notifications` | 0 | runtime | runtime/migration | 0 | — | **CONNECTED-LIVE** |
| `org_invitations` | 0 | runtime/migration | runtime/migration | 0 | accept_invitation,decline_invitation,lookup_invitation,revoke_invitation | **CONNECTED-LIVE** |
| `post_promotions` | 0 | runtime/ops | runtime | 0 | — | **CONNECTED-LIVE** |
| `source_tier_opinions` | 0 | runtime | runtime/migration | 0 | get_tier_opinion_disagreements | **CONNECTED-LIVE** |
| `source_bias_tags` | 2895 | ops/migration | runtime/ops | 0 | — | **BATCH-WRITE / READ-LIVE** |
| `agent_runs` | 1007 | ops | runtime/ops | 0 | — | **BATCH-WRITE / READ-LIVE** |
| `intelligence_item_sections` | 1005 | ops | runtime/ops/migration | 1 | — | **BATCH-WRITE / READ-LIVE** |
| `intelligence_item_citations` | 750 | ops/migration | ops/migration/runtime | 0 | get_source_citation_stats | **BATCH-WRITE / READ-LIVE** |
| `item_timelines` | 107 | migration | runtime/ops/migration | 0 | — | **BATCH-WRITE / READ-LIVE** |
| `regional_data_facts` | 75 | ops | runtime/ops/migration | 1 | — | **BATCH-WRITE / READ-LIVE** |
| `item_cross_references` | 49 | ops/migration | runtime/ops | 0 | — | **BATCH-WRITE / READ-LIVE** |
| `item_supersessions` | 11 | ops/migration | runtime/ops/migration | 0 | — | **BATCH-WRITE / READ-LIVE** |
| `item_changelog` | 9 | migration | runtime/ops/migration | 0 | — | **BATCH-WRITE / READ-LIVE** |
| `item_disputes` | 7 | migration | runtime/ops/migration | 0 | — | **BATCH-WRITE / READ-LIVE** |
| `regions` | 5 | migration | runtime/ops/migration | 0 | — | **BATCH-WRITE / READ-LIVE** |
| `coverage_gaps` | 2 | migration | runtime | 0 | — | **BATCH-WRITE / READ-LIVE** |
| `intelligence_item_versions` | 625 | migration/trigger | migration | 0 | — | **WRITE-LIVE / READ-OPS-ONLY** |
| `forum_sections` | 17 | ops/migration/trigger | migration | 0 | — | **WRITE-LIVE / READ-OPS-ONLY** |
| `user_profiles` | 1 | migration/trigger | ops/migration | 2 | — | **WRITE-LIVE / READ-OPS-ONLY** |
| `monitoring_queue` | 507 | runtime/ops | — | 0 | — | **WRITE-ONLY** |
| `case_studies` | 6 | ops/migration/trigger | — | 1 | — | **WRITE-ONLY** |
| `bulk_imports` | 0 | runtime/ops | — | 0 | — | **WRITE-ONLY** |
| `forum_threads` | 0 | migration/trigger | — | 2 | — | **WRITE-ONLY** |
| `notification_deliveries` | 0 | runtime | — | 0 | — | **WRITE-ONLY** |
| `vendors` | 0 | migration/trigger | — | 1 | — | **WRITE-ONLY** |
| `sector_contexts` | 15 | — | runtime/ops | 0 | — | **READ-ONLY (no writer)** |
| `community_topics` | 0 | — | runtime/migration | 0 | — | **READ-ONLY (no writer)** |
| `intelligence_changes` | 0 | — | runtime/ops | 0 | — | **READ-ONLY (no writer)** |
| `notification_subscriptions` | 0 | — | runtime | 0 | — | **READ-ONLY (no writer)** |
| `source_citations` | 0 | — | runtime/ops | 0 | — | **READ-ONLY (no writer)** |
| `source_conflicts` | 0 | — | runtime/ops/migration | 0 | — | **READ-ONLY (no writer)** |
| `user_watchlist` | 0 | — | runtime/ops | 0 | — | **READ-ONLY (no writer)** |
| `ingestion_state` | 774 | migration | — | 0 | — | **SEED/BACKUP (write-only, no reader)** |
| `taxonomy_nodes` | 38 | ops | — | 0 | — | **SEED/BACKUP (write-only, no reader)** |
| `item_supersessions_pre_phase5` | 5 | — | — | 0 | — | **INVESTIGATE (rows, no code ref)** |
| `briefings` | 0 | — | — | 0 | — | **ISOLATED (no refs, empty)** |
| `case_study_endorsements` | 0 | — | — | 1 | — | **ISOLATED (no refs, empty)** |
| `community_topic_groups` | 0 | — | — | 0 | — | **ISOLATED (no refs, empty)** |
| `forum_replies` | 0 | — | — | 2 | — | **ISOLATED (no refs, empty)** |
| `org_watchlist` | 0 | — | — | 0 | — | **ISOLATED (no refs, empty)** |
| `vendor_endorsements` | 0 | — | — | 1 | — | **ISOLATED (no refs, empty)** |
| `vendor_regulations` | 0 | — | — | 0 | — | **ISOLATED (no refs, empty)** |
| `vendor_technologies` | 0 | — | — | 0 | — | **ISOLATED (no refs, empty)** |
| `section_claim_provenance` | 2476 | ops | ops/migration | 1 | — | **OTHER** |
| `intelligence_summaries` | 2310 | ops | ops | 0 | — | **OTHER** |
| `agent_run_searches` | 1155 | ops | ops/migration | 0 | — | **OTHER** |
| `ingestion_control_log` | 709 | ops | ops | 0 | — | **OTHER** |
| `raw_fetches` | 660 | ops | ops | 0 | — | **OTHER** |
| `intelligence_items_pre_phase5` | 655 | — | ops | 0 | — | **OTHER** |
| `intelligence_items_domain_backfill_audit` | 212 | migration | migration | 0 | — | **OTHER** |
| `pending_jurisdiction_review_pre_phase5` | 107 | — | ops | 0 | — | **OTHER** |
| `item_type_required_slots` | 20 | migration | ops/migration | 0 | — | **OTHER** |
| `ingest_rejections_pre_phase5` | 0 | — | ops | 0 | — | **OTHER** |

## Disconnected / attention set

Every table not `CONNECTED-LIVE` / `BATCH-WRITE / READ-LIVE` / trigger-maintained:

- **`section_claim_provenance`** (2476 rows) — OTHER. W=ops, R=ops/migration. writers: scripts/block4-retroground-runner.mjs, scripts/lib/block1-reaudit.mjs, scripts/lib/verify-reconstruction.mjs, supabase/seed/apply-114.mjs. readers: scripts/block4-retroground-runner.mjs, scripts/lib/decision-anchors.mjs, scripts/sprint4-hc1-verify.mjs, supabase/seed/apply-121.mjs.
- **`intelligence_summaries`** (2310 rows) — OTHER. W=ops, R=ops. writers: supabase/seed/add-building-standards.mjs. readers: scripts/tmp/phase-2-dedup-introspect.mjs, supabase/seed/add-building-standards.mjs.
- **`agent_run_searches`** (1155 rows) — OTHER. W=ops, R=ops/migration. writers: scripts/block4-retroground-runner.mjs, scripts/lib/block1-reaudit.mjs, scripts/lib/verify-reconstruction.mjs, supabase/seed/apply-114.mjs. readers: scripts/sprint4-hc1-verify.mjs.
- **`ingestion_state`** (774 rows) — SEED/BACKUP (write-only, no reader). W=migration, R=—.
- **`ingestion_control_log`** (709 rows) — OTHER. W=ops, R=ops. writers: scripts/wave1-cold-start.mjs. readers: scripts/tmp/audit-section-A.mjs, scripts/tmp/phase-5-implementation-preflight.mjs.
- **`raw_fetches`** (660 rows) — OTHER. W=ops, R=ops. writers: scripts/wave1-cold-start.mjs. readers: scripts/audit-leadtime-part2.mjs, scripts/audit-leadtime-vertical-mode.mjs, scripts/wave1-cold-start.mjs.
- **`intelligence_items_pre_phase5`** (655 rows) — OTHER. W=—, R=ops. readers: scripts/tmp/critical-1-investigation.mjs, scripts/tmp/phase-5-mid-execute-state.mjs, scripts/tmp/phase-5-rollback.mjs.
- **`intelligence_item_versions`** (625 rows) — WRITE-LIVE / READ-OPS-ONLY. W=migration/trigger, R=migration.
- **`monitoring_queue`** (507 rows) — WRITE-ONLY. W=runtime/ops, R=—. writers: src/app/api/worker/check-sources/route.ts, scripts/tmp/_checksrc-bundle.mjs.
- **`intelligence_items_domain_backfill_audit`** (212 rows) — OTHER. W=migration, R=migration.
- **`pending_jurisdiction_review_pre_phase5`** (107 rows) — OTHER. W=—, R=ops. readers: scripts/tmp/phase-5-mid-execute-state.mjs, scripts/tmp/phase-5-rollback.mjs.
- **`taxonomy_nodes`** (38 rows) — SEED/BACKUP (write-only, no reader). W=ops, R=—. writers: supabase/seed/seed-community.sql.
- **`item_type_required_slots`** (20 rows) — OTHER. W=migration, R=ops/migration. readers: scripts/block4-retroground-runner.mjs, supabase/seed/apply-113.mjs.
- **`forum_sections`** (17 rows) — WRITE-LIVE / READ-OPS-ONLY. W=ops/migration/trigger, R=migration. writers: supabase/seed/seed-community.sql.
- **`sector_contexts`** (15 rows) — READ-ONLY (no writer). W=—, R=runtime/ops. readers: src/lib/supabase-server.ts, scripts/sprint3-e1-payload-measure.mjs, supabase/seed/add-building-standards.mjs.
- **`case_studies`** (6 rows) — WRITE-ONLY. W=ops/migration/trigger, R=—. writers: supabase/seed/seed-community.sql.
- **`item_supersessions_pre_phase5`** (5 rows) — INVESTIGATE (rows, no code ref). W=—, R=—.
- **`user_profiles`** (1 rows) — WRITE-LIVE / READ-OPS-ONLY. W=migration/trigger, R=ops/migration. readers: scripts/tmp/prework-multi-tenant.mjs.
- **`bulk_imports`** (0 rows) — WRITE-ONLY. W=runtime/ops, R=—. writers: src/app/api/admin/sources/bulk-import/route.ts, scripts/tmp/_bulk-bundle.mjs.
- **`forum_threads`** (0 rows) — WRITE-ONLY. W=migration/trigger, R=—.
- **`notification_deliveries`** (0 rows) — WRITE-ONLY. W=runtime, R=—. writers: src/app/api/notifications/trigger/route.ts.
- **`vendors`** (0 rows) — WRITE-ONLY. W=migration/trigger, R=—.
- **`community_topics`** (0 rows) — READ-ONLY (no writer). W=—, R=runtime/migration. readers: src/app/community/browse/page.tsx, src/app/community/moderation/page.tsx, src/app/community/[slug]/page.tsx.
- **`intelligence_changes`** (0 rows) — READ-ONLY (no writer). W=—, R=runtime/ops. readers: src/lib/supabase-server.ts, scripts/sprint3-e1-payload-measure.mjs, scripts/tmp/phase-2-dedup-introspect.mjs.
- **`notification_subscriptions`** (0 rows) — READ-ONLY (no writer). W=—, R=runtime. readers: src/app/api/notifications/trigger/route.ts.
- **`source_citations`** (0 rows) — READ-ONLY (no writer). W=—, R=runtime/ops. readers: src/lib/trust.ts, scripts/cron/q7-daily-recompute.mjs.
- **`source_conflicts`** (0 rows) — READ-ONLY (no writer). W=—, R=runtime/ops/migration. readers: src/lib/supabase-server.ts, scripts/sprint3-e1-payload-measure.mjs.
- **`user_watchlist`** (0 rows) — READ-ONLY (no writer). W=—, R=runtime/ops. readers: src/lib/supabase-server.ts, scripts/audit-leadtime-vertical-mode.mjs.
- **`briefings`** (0 rows) — ISOLATED (no refs, empty). W=—, R=—.
- **`case_study_endorsements`** (0 rows) — ISOLATED (no refs, empty). W=—, R=—.
- **`community_topic_groups`** (0 rows) — ISOLATED (no refs, empty). W=—, R=—.
- **`forum_replies`** (0 rows) — ISOLATED (no refs, empty). W=—, R=—.
- **`org_watchlist`** (0 rows) — ISOLATED (no refs, empty). W=—, R=—.
- **`vendor_endorsements`** (0 rows) — ISOLATED (no refs, empty). W=—, R=—.
- **`vendor_regulations`** (0 rows) — ISOLATED (no refs, empty). W=—, R=—.
- **`vendor_technologies`** (0 rows) — ISOLATED (no refs, empty). W=—, R=—.
- **`ingest_rejections_pre_phase5`** (0 rows) — OTHER. W=—, R=ops. readers: scripts/tmp/phase-5-mid-execute-state.mjs.

## Orphan references

- `.from("d3_runs")` → **no such table** — src/lib/d3/hooks-reconstruction.mjs, src/lib/d3/hooks.mjs, scripts/tmp/_bulk-bundle.mjs, scripts/tmp/_checksrc-bundle.mjs, scripts/tmp/_verif-bundle.mjs
- `.from("discovery_provenance")` → **no such table** — scripts/audit-leadtime-vertical-mode.mjs
- `.from("sector_activation_interest")` → **no such table** — scripts/audit-leadtime-vertical-mode.mjs
- `.from("table_name")` → **no such table** — scripts/tmp/grep-readers-writers.mjs
- `.from("t")` → **no such table** — scripts/tmp/grep-readers-writers2.mjs
- `.rpc("exec_sql_text")` → **no such function** — scripts/audit-data-sufficiency.mjs
- `.rpc("exec_sql")` → **no such function** — scripts/jurisdiction-audit-2026-05-11.mjs
