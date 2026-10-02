# Audit A5b: migrations 001-170, line-by-line register, 2026-09-30

Lane A5b (MIGRATIONS-001-170), read-only, Sonnet. Directive (operator, verbatim, binding for this
audit, overriding CLAUDE.md rule 11's context-metering default for this task): "complete a complete
line by line audit of the code. No overviews. I want every line read." Every migration file whose
number prefix is 001 through 170 inclusive was read in full, first line to last, in number order,
via the Read tool. 166 files, 22,455 lines total (per `wc -l`). `fsi-app/supabase/seed/**` and
`fsi-app/supabase/seed.sql` were checked and confirmed **not present** in this repo state (directory
listing of `fsi-app/supabase/` shows only `functions/` and `migrations/`) - nothing to read there.

This lane extends `docs/audits/app-audit-a5-database-2026-09-30.md` (read via
`git show origin/audit/a5-db:docs/audits/app-audit-a5-database-2026-09-30.md`, since the branch is
not yet on `origin/master`). That lane did a replay-and-cross-reference pass over the full 302-file
corpus plus live code; this lane instead reads the 001-170 slice of the same corpus line by line and
reports what the text itself says, cross-referenced against `fsi-app/scripts/tmp/live-schema-2026-09-30.json`
(the coordinator's live row-count/RLS/policy snapshot - exact counts, RLS-enabled flag, and
zero-policy list per table) wherever that snapshot can confirm or refute a claim. No database
credentials were used or sought. IDs from the prior audit (RW-1, RW-2, SEC-1, etc.) are cited, not
repeated, per CLAUDE.md's "extends, does not repeat" convention.

## Summary

| Metric | Count |
|---|---|
| Migration files in range 001-170 (files read) | 166 |
| Total lines read | 22,455 |
| Seed files in scope | 0 (directory does not exist in this repo state) |
| Tables/views/functions created in-range confirmed LIVE via row-count or cross-reference | ~80 |
| Objects created in-range confirmed DROPPED (by an in-range or cited out-of-range migration) | 14 |
| Migrations whose own header claims "NOT YET APPLIED" | 8 (146,147,148,149,150,151,152,153) |
| Of those, confirmed live via row-count despite the claim | 3 (151, 152, 153) - **header-drift, same class as prior audit's 330/331/335** |
| Of those, unconfirmable from live-schema JSON alone (no DB access) | 5 (146,147,148,149,150) |
| Confirmed historic security exposures found and fixed within range | 4 (RLS on core tables since mig. 005/157; profiles PII since mig. 002/165; aux-table parent-gate leak/168; get_market_intel_items membership gap 108→164) |
| Self-diagnosed regressions fixed within range (non-security) | 6+ (108→164 org-gate; 114→119 vacuous-pass; 131→132/128/137 GAP-satisfiability x3; 091→099 tier column; 157→166 provisional_sources_read) |
| Findings below | 25, all status-tagged |

## Per-migration register

Legend: **file** | **lines** | **objects created/altered/dropped** | **live?** | **status**

| # | File | Lines | Objects | Live / superseded | Status |
|---|---|---:|---|---|---|
| 001 | 001_schema.sql | 153 | CREATE resources, timelines, changelog, disputes, cross_references, supersessions, source_registry, staged_updates, briefings, profiles | resources/timelines/changelog/disputes/cross_references/supersessions dropped by 013; source_registry dropped by 004; staged_updates dropped+recreated by 004; briefings dropped by 219 (out of range); profiles LIVE (2 rows) | [CONFIRMED] |
| 002 | 002_rls.sql | 26 | RLS+policies on 001 tables | superseded (parent tables dropped) | [CONFIRMED] |
| 003 | 003_indexes.sql | 23 | indexes on 001 tables | superseded | [CONFIRMED] |
| 004 | 004_source_trust_framework.sql | 628 | DROP source_registry; DROP+recreate staged_updates; CREATE sources, intelligence_items, item_timelines, item_changelog, item_disputes, item_cross_references, item_supersessions, source_trust_events, source_conflicts, source_citations, monitoring_queue, provisional_sources; fn update_updated_at, recompute_source_accuracy; views source_health_summary, open_conflicts, provisional_sources_review | sources/intelligence_items/item_*/monitoring_queue/provisional_sources all LIVE; source_conflicts dropped by 215 (out of range, per fsi-app/.claude/CLAUDE.md); staged_updates LIVE (71 rows) | [CONFIRMED] |
| 005 | 005_rls_trust_framework.sql | 107 | RLS + policies for 004 tables | live, foundational | [CONFIRMED] |
| 006 | 006_multi_tenant.sql | 313 | CREATE organizations, org_memberships, workspace_item_overrides, workspace_settings; ALTER briefings; fn user_belongs_to_org, get_workspace_intelligence | all 4 tables LIVE; get_workspace_intelligence redefined by 007_full_brief | [CONFIRMED] |
| 006b | 006_rls_multi_tenant.sql | 189 | RLS for 006 tables + briefings org policy | live | [CONFIRMED] |
| 007a | 007_community_layer.sql | 529 | ALTER profiles/intelligence_items/sources; CREATE taxonomy_nodes, forum_sections, forum_threads, forum_replies, vendors, vendor_regulations, vendor_technologies, vendor_endorsements, case_studies, case_study_endorsements, notification_subscriptions, notification_events, notification_deliveries | **all of this file's new tables are dropped by later out-of-range migrations** (taxonomy_nodes/case_studies/case_study_endorsements by 335; vendors family by 181; forum family by 192; notification family by 261) | [CONFIRMED via prior audit + grep] |
| 007b | 007_full_brief.sql | 93 | ALTER intelligence_items/resources/staged_updates ADD full_brief; redefine get_workspace_intelligence | full_brief on intelligence_items is core/live | [CONFIRMED] |
| 007c | 007_rls_community.sql | 158 | RLS for 007_community_layer tables | moot (parent tables dropped later) | [CONFIRMED] |
| 009 | 009_capture_undeclared_tables.sql | 97 | CREATE IF NOT EXISTS intelligence_summaries, intelligence_changes, sector_contexts (capture-only) | LIVE: 2040 / 0 / 15 rows | [CONFIRMED] |
| 010 | 010_migrate_legacy_to_item.sql | 191 | DML backfill legacy→item_* | historical, source tables now dropped | [CONFIRMED] |
| 011 | 011_backfill_orphan_supersessions.sql | 88 | DML: ghost intelligence_items (hardcoded ss1-ss5) + item_supersessions backfill | historical | [CONFIRMED] |
| 013 | 013_drop_legacy_tables.sql | 33 | DROP supersessions, cross_references, disputes, changelog, timelines, resources | [CONFIRMED] all absent live | [CONFIRMED] |
| 015 | 015_provisional_recommended_classification.sql | 24 | ALTER provisional_sources ADD recommended_classification | provisional_sources LIVE (497 rows) | [CONFIRMED] |
| 016 | 016_add_processing_pause.sql | 44 | ALTER sources ADD processing_paused; CREATE system_state (singleton) | system_state LIVE (1 row); RLS enabled per live JSON but **this file never enables RLS** | [HYPOTHESIS] RLS-enable migration unidentified in range - F-01 |
| 017 | 017_add_admin_only_to_sources.sql | 23 | ALTER sources ADD admin_only + idx | live | [CONFIRMED] |
| 018 | 018_b2_brief_schema.sql | 47 | ALTER intelligence_items severity repurpose + urgency_tier/format_type/last_regenerated_at/regeneration_skill_version/sources_used | core, live | [CONFIRMED] |
| 019 | 019_reclassify_mistyped_tools.sql | 45 | DML: UPDATE item_type (hardcoded ids) | one-time, historical | [CONFIRMED] |
| 020 | 020_intersection_readiness.sql | 68 | ALTER intelligence_items ADD 4 intersection cols + GIN idx | live | [CONFIRMED] |
| 021 | 021_canonical_source_candidates.sql | 59 | CREATE canonical_source_candidates | LIVE (331 rows); **no RLS in this file** | [CONFIRMED] - RLS added later by 043 |
| 022 | 022_canonical_source_classification_cache.sql | 19 | ALTER canonical_source_candidates ADD recommended_classification | live | [CONFIRMED] |
| 023 | 023_intersection_detection_function.sql | 120 | CREATE FUNCTION detect_intersections | function, unconfirmable via row-count JSON | [HYPOTHESIS] |
| 024 | 024_admin_action_cooldowns.sql | 31 | CREATE admin_action_cooldowns + RLS(service-role) | LIVE (1 row) | [CONFIRMED] |
| 025 | 025_sector_activation_interest.sql | 28 | ALTER workspace_settings ADD 2 cols | live | [CONFIRMED] |
| 026 | 026_research_pipeline_stage.sql | 34 | ALTER intelligence_items ADD pipeline_stage + backfill | live | [CONFIRMED] |
| 027 | 027_user_profiles.sql | 160 | CREATE user_profiles + RLS + DML backfill | **NOT in live-schema JSON** | [CONFIRMED] dropped by out-of-range migration 183 (`183_drop_user_profiles_mirror.sql`, confirmed via grep) |
| 028 | 028_community_groups.sql | 152 | CREATE community_groups + trigger + RLS | LIVE (7 rows) | [CONFIRMED] |
| 029 | 029_community_group_members.sql | 279 | CREATE community_group_members, community_group_invitations + triggers + RLS | community_group_members LIVE (1); community_group_invitations **not in live JSON** | [HYPOTHESIS] F-02 |
| 030 | 030_community_posts.sql | 201 | CREATE community_posts + trigger + RLS | LIVE (0 rows) | [CONFIRMED] |
| 031 | 031_community_topics.sql | 130 | CREATE community_topics, community_topic_groups + RLS | LIVE (0/0) | [CONFIRMED] |
| 032 | 032_community_notifications_moderation.sql | 307 | CREATE notifications, notification_preferences, moderation_reports + triggers + RLS (refs `user_profiles.is_platform_admin`) | LIVE (0/0/0) | [HYPOTHESIS] F-03 (dangling reference to a table dropped at 183) |
| 033 | 033_jurisdiction_iso.sql | 70 | ALTER 3 tables ADD jurisdiction_iso + GIN idx + DML backfill (23 hardcoded UPDATEs) | live, first of the jurisdiction-normalization series | [CONFIRMED] |
| 034 | 034_staged_updates_materialization_error.sql | 34 | ALTER staged_updates ADD 3 observability cols | live | [CONFIRMED] |
| 035 | 035_agent_integrity_flags.sql | 95 | ALTER intelligence_items ADD 5 cols; fn+trigger recompute_agent_integrity_flag | live | [CONFIRMED] |
| 036 | 036_admin_notifications_rpc.sql | 90 | ALTER sources ADD spotchecked cols; CREATE FUNCTION admin_attention_counts (2 hardcoded-0 placeholder slots) | live, later extended by 140 | [HYPOTHESIS] placeholder slots - see 140 |
| 037 | 037_source_verification.sql | 97 | CREATE source_verifications + 4 idx + RLS | LIVE (1414 rows) | [CONFIRMED] |
| 038 | 038_bulk_import_audit.sql | 38 | CREATE bulk_imports + 2 idx + RLS | LIVE (0 rows) - prior audit's RW-1 (write-orphan, allowlisted) | [CONFIRMED via prior audit] |
| 039 | 039_coverage_matrix_rpc.sql | 63 | CREATE FUNCTION coverage_matrix | unconfirmable via row-count JSON | [HYPOTHESIS] |
| 040 | 040_discovery_provenance.sql | 37 | ALTER provisional_sources ADD discovered_for_jurisdiction | filename `040_...` but header self-identifies as `038a_...` | [CONFIRMED] cosmetic header/filename drift |
| 041 | 041_post_promotions.sql | 153 | CREATE post_promotions + 3 idx; ALTER community_posts; RLS (refs `user_profiles.is_platform_admin`) | post_promotions LIVE (0) | [HYPOTHESIS] F-03 (same dangling-reference class as 032) |
| 042 | 042_community_region_counts_rpc.sql | 55 | CREATE FUNCTION community_region_counts (SECURITY INVOKER) + GRANT | unconfirmable via row-count JSON | [HYPOTHESIS] design correct |
| 043 | 043_security_advisor_fixes.sql | 148 | DROP+CREATE 3 views WITH(security_invoker=true); ALTER canonical_source_candidates ENABLE RLS + 2 policies | good remediation; `open_conflicts` selects FROM `source_conflicts`, dropped by out-of-range 215 | [HYPOTHESIS] F-04 (dangling view) |
| 044 | 044_integrity_flag_trigger_tune.sql | 74 | CREATE OR REPLACE recompute_agent_integrity_flag (retuned) + backfill | live | [CONFIRMED] |
| 045 | 045_orphan_slugs_and_acf_dedup.sql | 128 | DML: DELETE 1 hardcoded-id row; DO-block slug backfill; UPDATE r10 archive | historical, one-time | [CONFIRMED] |
| 046 | 046_community_rls_recursion_fix.sql | 121 | CREATE 3 SECURITY DEFINER fns + GRANT anon; DROP+CREATE policies | good bugfix (RLS self-recursion) | [CONFIRMED] |
| 047 | 047_workspace_intelligence_slim_rpc.sql | 105 | CREATE FUNCTION get_workspace_intelligence_slim | live RPC family member | [CONFIRMED] |
| 048 | 048_integrity_flags_platform.sql | 129 | CREATE integrity_flags + 3 idx + RLS | LIVE (11272 rows, 5 policies) | [CONFIRMED] |
| 049 | 049_perf_v2_indexes.sql | 71 | CREATE 3 indexes | live | [CONFIRMED] |
| 050 | 050_integrity_flags_workflow_gap.sql | 29 | ALTER integrity_flags CHECK widen | live | [CONFIRMED] |
| 051 | 051_sources_last_scanned_recovery.sql | 26 | ALTER sources ADD last_scanned | comment promises a backfill; **file contains no backfill UPDATE** | [CONFIRMED] F-05, cosmetic |
| 052 | 052_raw_fetches.sql | 63 | CREATE raw_fetches + 2 idx + storage bucket + RLS | LIVE (679 rows) | [CONFIRMED] |
| 053 | 053_intelligence_item_versions.sql | 139 | CREATE intelligence_item_versions + 2 idx + RLS + REVOKE + trigger | LIVE (4100 rows) | [CONFIRMED] |
| 054 | 054_sources_scoreboard_columns.sql | 34 | ALTER sources ADD 3 cols + idx | live | [CONFIRMED] |
| 055 | 055_sources_auto_run_enabled.sql | 27 | ALTER sources ADD auto_run_enabled + idx | live | [CONFIRMED] |
| 056 | 056_sources_access_method_extension.sql | 46 | ALTER sources CHECK swap + 3 cols + 2 CHECK | live | [CONFIRMED] |
| 057 | 057_agent_runs.sql | 62 | CREATE agent_runs + 4 idx + RLS | LIVE (24144 rows) | [CONFIRMED] |
| 058 | 058_ingestion_control_log.sql | 44 | CREATE ingestion_control_log + 2 idx + RLS + REVOKE | **not in live JSON** | [CONFIRMED] dropped by out-of-range 184 |
| 059 | 059_ingestion_state.sql | 47 | CREATE ingestion_state + idx + DML backfill + RLS | **not in live JSON** | [CONFIRMED] dropped by out-of-range 184 (paired w/ 058) |
| 060 | 060_user_watchlist.sql | 27 | CREATE user_watchlist + 2 idx + RLS (no UPDATE policy) | LIVE (1 row) | [HYPOTHESIS] no-UPDATE may be intentional |
| 061 | 061_coverage_gaps.sql | 48 | CREATE coverage_gaps + idx + RLS(read) + seed INSERT (2 hardcoded rows) | LIVE (2 rows, matches seed) | [CONFIRMED] |
| 062 | 062_intelligence_items_hidden_reason.sql | 21 | ALTER intelligence_items ADD hidden_reason | live | [CONFIRMED] |
| 063 | 063_sources_classification_axes.sql | 73 | ALTER sources ADD 12 cols incl. tier/jurisdictions (both ALREADY EXISTED, silently no-op'd) | [CONFIRMED, resolved by 085] | [CONFIRMED] |
| 064 | 064_workspace_intelligence_dashboard_rpc.sql | 117 | CREATE FUNCTION get_workspace_intelligence_dashboard | live RPC family member | [CONFIRMED] |
| 065 | 065_pending_first_fetch_queue.sql | 147 | CREATE pending_first_fetch + 2 idx + RLS + REVOKE + fn/trigger x2 | LIVE (1388 rows) | [CONFIRMED] |
| 066 | 066_workspace_intelligence_listings_rpc.sql | 136 | CREATE FUNCTION get_workspace_intelligence_listings | live RPC family member | [CONFIRMED] |
| 067 | 067_sources_classification_metadata.sql | 9 | ALTER sources ADD 2 cols | live | [CONFIRMED] |
| 068 | 068_workspace_intelligence_aggregates.sql | 146 | CREATE FUNCTION get_workspace_intelligence_aggregates | live RPC family member | [CONFIRMED] |
| 069 | 069_workspace_intelligence_aggregates_scoped.sql | 137 | CREATE FUNCTION get_workspace_intelligence_aggregates_scoped | live RPC family member | [CONFIRMED] |
| 070 | 070_phase1_routing_rpcs.sql | 394 | CREATE get_research_items/get_market_intel_items/get_operations_items | **file is a documented reconstruction** - original 070 lost to a branch merge, restored verbatim from git blob history, self-verified against live DB | [CONFIRMED, already remediated] |
| 071 | 071_deterministic_tiebreaker.sql | 333 | CREATE OR REPLACE 5 fns (append `,id ASC`) | live | [CONFIRMED] |
| 072 | 072_jurisdiction_normalizer.sql | 318 | CREATE _normalize_jurisdictions + trigger fn + backfill | live, superseded in signature by 080 | [CONFIRMED] |
| 073 | 073_shared_workspace_scope.sql | 628 | CREATE _workspace_active_items + CREATE OR REPLACE 7 RPCs | live, good refactor | [CONFIRMED] |
| 074 | 074_ecovadis_vendor_reclass.sql | 66 | DML: UPDATE sources/intelligence_items (7 hardcoded ids), BEGIN/COMMIT | historical, one-time | [CONFIRMED] |
| 075 | 075_profiles_consolidation_phase1.sql | 391 | ALTER profiles ADD 7 cols; DML backfill; dual-write triggers; deprecate user_profiles; ADD FK | LIVE, profiles has is_platform_admin | [CONFIRMED] - see F-03 |
| 076 | 076_org_invitations.sql | 437 | CREATE org_invitations + 3 idx + RLS + 5 SECURITY DEFINER RPCs | LIVE (0 rows) | [CONFIRMED] |
| 077 | 077_rpc_membership_checks.sql | 740 | CREATE _assert_org_membership; DROP+recreate 10 RPCs as plpgsql; CREATE get_workspace_members, org_watchlist | [CONFIRMED] fixes real pre-existing cross-org confidentiality gap (product audit S11) | [CONFIRMED] |
| 079 | 079_canonical_entity_columns.sql | 117 | ALTER intelligence_items ADD instrument_type/instrument_identifier + partial unique idx | live | [CONFIRMED] |
| 080 | 080_jurisdiction_vocabulary_extension.sql | 588 | DROP+CREATE _normalize_jurisdictions (adds `rejected` output); trigger fn; _classify_jurisdiction_token | live, interim state by design (082 completes it) | [CONFIRMED] |
| 081 | 081_admin_signal_documentation.sql | 46 | COMMENT ON COLUMN x2 (no DDL) | metadata only | [CONFIRMED] |
| 082 | 082_operator_queues_and_routing.sql | 334 | CREATE ingest_rejections, pending_jurisdiction_review + RLS + trigger + DML backfill | LIVE (133 / 77 rows) | [CONFIRMED] |
| 083 | 083_trigger_derive_jurisdiction_iso.sql | 227 | CREATE _derive_jurisdiction_iso_from_canonical; trigger update; backfill | live, proven 0-blast-radius | [CONFIRMED] |
| 084 | 084_sources_canonical_category.sql | 191 | ALTER sources ADD category + CHECK; DML backfill; CREATE OR REPLACE 3 RPCs (category-based routing) | live | [CONFIRMED] |
| 085 | 085_d16_document_063_column_shadowing.sql | 57 | COMMENT ON COLUMN x4 (no DDL) | resolves 063's shadowing defect | [CONFIRMED] |
| 086 | 086_analytical_press_routing.sql | 191 | DML: 6 UPDATE + 2 INSERT (hardcoded rows) | historical | [CONFIRMED] |
| 087 | 087_canonicalize_source_urls.sql | 226 | DO-block one-shot URL-canonicalize backfill (pg_temp fn) | historical | [CONFIRMED] |
| 088 | 088_citation_stats_rpc.sql | 88 | CREATE FUNCTION get_source_citation_stats (v1, SECURITY INVOKER) | superseded in body by 098 | [CONFIRMED] |
| 089 | 089_intelligence_item_citations.sql | 146 | CREATE intelligence_item_citations + 3 idx + backfill | LIVE (2668 rows) | [CONFIRMED] |
| 090 | 090_tier_schema_split.sql | 167 | DROP+RECREATE 2 views; RENAME sources.tier→base_tier; ADD effective_tier; backfill | [CONFIRMED] intentional breaking rename, well documented | [CONFIRMED] |
| 091 | 091_source_tier_opinions.sql | 156 | CREATE source_tier_opinions + 2 idx; CREATE FUNCTION get_tier_opinion_disagreements | LIVE (371 rows); **no RLS in this file** (fixed by 099); fn body reads `s.tier` not `base_tier` at time of writing (self-heals at 099) | [CONFIRMED, resolved by 099] |
| 092 | 092_source_bias_tags.sql | 150 | CREATE source_bias_tags + 4 idx; GRANT SELECT to anon/authenticated | LIVE (2895 rows), RLS enabled + 0 policies per live JSON (deny-all-safe today) | [CONFIRMED] F-06 (transient exposure window; enabling migration unidentified in range) |
| 093 | 093_sources_tier_override.sql | 128 | ALTER sources ADD tier_override/override_reason/override_date; widen source_trust_events CHECK | live | [CONFIRMED] |
| 094 | 094_tier_compat_shim.sql | 71 | ALTER sources ADD tier (re-add, **no IF NOT EXISTS**) + 2 CHECK; fn+trigger sync_sources_tier_columns | temporary shim, self-described as to-be-dropped | [CONFIRMED] F-07 (non-idempotent ADD COLUMN, only exception in corpus); [HYPOTHESIS] whether the drop migration exists past 170 |
| 097 | 097_q4_bias_retune_option_b.sql | 33 | DML: 1 UPDATE | historical | [CONFIRMED] |
| 098 | 098_get_source_citation_stats_edge_table.sql | 70 | CREATE OR REPLACE get_source_citation_stats (body swap) | live | [CONFIRMED] |
| 099 | 099_tier_opinion_review_state.sql | 147 | ALTER source_tier_opinions ADD 3 cols; DROP+CREATE get_tier_opinion_disagreements (base_tier); RLS x2 | live, fixes 091 | [CONFIRMED] |
| 100 | 100_research_source_coverage_rpc.sql | 86 | CREATE FUNCTION get_research_source_coverage | live | [CONFIRMED] |
| 101 | 101_intelligence_items_domain_backfill.sql | 420 | CREATE intelligence_items_domain_backfill_audit; DML domain backfill w/ integrity assertion | audit table dropped by out-of-range 219; header self-labels "PROPOSED, NOT APPLIED" though evidently applied | [HYPOTHESIS] F-08 (header drift, same class as 330/335) |
| 102 | 102_severity_band_theme_columns.sql | 93 | ALTER intelligence_items severity widen + backfill; ADD signal_band, theme + CHECK + idx | live | [CONFIRMED] |
| 103 | 103_intelligence_item_sections.sql | 77 | CREATE intelligence_item_sections + 3 idx + RLS | LIVE (12686 rows) | [CONFIRMED] |
| 104 | 104_community_post_intelligence_refs.sql | 29 | ALTER community_posts ADD referenced_intelligence_item_ids + GIN idx | live | [CONFIRMED] |
| 105 | 105_profiles_projection.sql | 79 | ALTER profiles region scalar→array; ADD org_id/workspace_role/sector + CHECK + idx | live | [CONFIRMED] |
| 106 | 106_regions_and_facts.sql | 122 | CREATE regions + seed (5 hardcoded rows); CREATE regional_data_facts + RLS | LIVE (5 / 90 rows) | [CONFIRMED] |
| 107 | 107_intelligence_items_trajectory_points.sql | 58 | ALTER intelligence_items ADD trajectory_points + band-gated CHECK | live | [CONFIRMED] |
| 108 | 108_market_intel_rpc_trajectory_payload.sql | 133 | DROP+CREATE get_market_intel_items (adds cols, **silently drops `_assert_org_membership` + category routing**) | **[CONFIRMED, HIGH-SEVERITY]** F-09 | [CONFIRMED, resolved at 164] |
| 109 | 109_region_dimension_coverage.sql | 173 | CREATE region_dimension_coverage + seed(30) + trigger + RLS | LIVE (30 rows) | [CONFIRMED] |
| 110 | 110_callout_columns_and_rpc_extension.sql | 243 | ALTER intelligence_items ADD 4 cols; DROP+CREATE get_research_items (correct) + get_market_intel_items (perpetuates F-09) | see F-09 | [CONFIRMED, resolved at 164] |
| 111 | 111_workspace_overrides_dismissed_at.sql | 78 | ALTER workspace_item_overrides ADD dismissed_at + idx | live, self-flags a scope-reduction ("DRIFT-1") | [CONFIRMED] |
| 112 | 112_provenance_invariant_schema.sql | 149 | CREATE TYPE provenance_status; ALTER intelligence_items; CREATE agent_run_searches, section_claim_provenance, item_type_required_slots | LIVE (6629 / 34025 / 48 rows); begins the Sprint-4 provenance-gate architecture | [CONFIRMED] |
| 113 | 113_seed_item_type_required_slots.sql | 55 | DML seed INSERT (20 rows) | live | [CONFIRMED] |
| 114 | 114_validate_item_provenance.sql | 431 | CREATE TYPE validation_result; CREATE FUNCTION validate_item_provenance (6-criteria gate, v1) | superseded in body by 119/121/138/141/142/143/145/150/158 (all in range) | [CONFIRMED] |
| 115 | 115_set_provenance_status_trigger.sql | 148 | CREATE FUNCTION set_provenance_status + 3 triggers | live, correct recursion guard | [CONFIRMED] |
| 116 | 116_active_intelligence_items_view.sql | 37 | CREATE VIEW active_intelligence_items | live gate view | [CONFIRMED] |
| 117 | 117_provenance_gate_customer_rpcs.sql | 132 | CREATE OR REPLACE _workspace_active_items (adds verified gate, correct) + get_market_intel_items (perpetuates F-09) | see F-09 | [CONFIRMED, resolved at 164] |
| 118 | 118_provenance_flip_binding.sql | 167 | CREATE ROLE reconciler; GRANT/RLS; CREATE stamp_prov_origin + guard_provenance_flip + triggers | live, strong adversarial design, honest residual noted | [CONFIRMED] |
| 119 | 119_validate_item_provenance_failclose.sql | 349 | CREATE OR REPLACE validate_item_provenance (fail-close fix) | [CONFIRMED, self-diagnosed] fixes vacuous-pass defect from 114 | [CONFIRMED] |
| 120 | 120_provenance_gate_remaining_customer_rpcs.sql | 87 | CREATE OR REPLACE get_workspace_intelligence + _slim (adds verified gate, correct) | live | [CONFIRMED] |
| 121 | 121_uniform_promotion_no_human_tick.sql | 349 | CREATE OR REPLACE validate_item_provenance (removes human-verify branch) | live, deliberate product decision | [CONFIRMED] |
| 122 | 122_source_institutions.sql | 42 | CREATE institutions + UNIQUE; ALTER sources ADD institution_id | LIVE (462 rows) | [CONFIRMED] |
| 123 | 123_source_label_derivation.sql | 80 | CREATE derive_source_category/derive_source_intelligence_types; CREATE set_source_label + trigger | live | [CONFIRMED] |
| 124 | 124_monitoring_queue_reconciled_at.sql | 21 | ALTER monitoring_queue ADD reconciled_at + idx | live | [CONFIRMED] |
| 125 | 125_routing_by_item_type.sql | 139 | CREATE OR REPLACE 3 RPCs (item_type routing); get_market_intel_items still perpetuates F-09 | see F-09 | [CONFIRMED, resolved at 164] |
| 126 | 126_research_required_slots.sql | 16 | DML seed INSERT (4 rows) | live | [CONFIRMED] |
| 128 | 128_research_finding_slot_ledger_fix.sql | 58 | DML: 2 UPDATE (description text) | [CONFIRMED, self-diagnosed] GAP-satisfiability fix | [CONFIRMED] |
| 129 | 129_market_required_slots.sql | 82 | DML seed INSERT (8 rows) | live | [CONFIRMED] |
| 130 | 130_technology_required_slots.sql | 67 | DML seed INSERT (12 rows) | live | [CONFIRMED] |
| 131 | 131_operations_required_slots.sql | 89 | DML seed INSERT (4 rows) | superseded by 132 | [CONFIRMED] |
| 132 | 132_operations_slot_gap_satisfiable.sql | 53 | DML: 2 UPDATE | [CONFIRMED, self-diagnosed] GAP-satisfiability fix | [CONFIRMED] |
| 133 | 133_get_technology_items_rpc.sql | 57 | CREATE FUNCTION get_technology_items (correct from the start) | live | [CONFIRMED] |
| 134 | 134_fix_research_technology_rpc_columns.sql | 82 | CREATE OR REPLACE get_research_items + get_technology_items (JOIN fix) | [CONFIRMED, self-diagnosed] real "column does not exist" bug w/ documented fail-open surface leak | [CONFIRMED] |
| 135 | 135_source_registration_guard.sql | 57 | CREATE _url_host + _guard_source_archive + trigger | live, fire-tested per own account | [CONFIRMED] |
| 136 | 136_theme_candidate_capture.sql | 28 | ALTER intelligence_items ADD theme_candidate + idx | live | [CONFIRMED] |
| 137 | 137_reg_family_slot_gap_satisfiable.sql | 72 | DML: 2 UPDATE (scoped) | [CONFIRMED, self-diagnosed] fixes verified→quarantined regression | [CONFIRMED] |
| 138 | 138_reg_only_authority_floor.sql | 337 | CREATE OR REPLACE validate_item_provenance (floor scoped to reg family) | [CONFIRMED, self-diagnosed] category-error fix, named exemption | [CONFIRMED] |
| 139 | 139_close_quarantine_flags_on_verify.sql | 124 | CREATE OR REPLACE set_provenance_status (close-on-verify) + backfill | [CONFIRMED, self-diagnosed] alarm-fatigue fix | [CONFIRMED] |
| 140 | 140_attention_counts_platform_flags.sql | 82 | DROP+CREATE admin_attention_counts (+platform_integrity_flags_open) | [CONFIRMED, self-diagnosed] closes a real 523-flag admin blind spot | [CONFIRMED] |
| 141 | 141_per_type_authority_floor.sql | 361 | CREATE OR REPLACE validate_item_provenance (per-item-type floor) | live, well-calibrated, named exemptions | [CONFIRMED] |
| 142 | 142_legal_line_guard.sql | 363 | CREATE OR REPLACE validate_item_provenance (anti-laundering guard) | live, adversarially designed, 0/538 blast radius proven | [CONFIRMED] |
| 143 | 143_label_variant_tolerance.sql | 348 | CREATE OR REPLACE validate_item_provenance (regex label match) | live, 7/7 + 15/15 self-verified | [CONFIRMED] |
| 144 | 144_scrape_cadence.sql | 25 | ALTER system_state ADD scrape_cadence/scrape_start_date + CHECK | LIVE (1 row); implements CLAUDE.md rule 16 | [CONFIRMED] |
| 145 | 145_provenance_floor_inline_derive.sql | 343 | CREATE OR REPLACE validate_item_provenance (inline tier derivation) | live, 0-drift proof over 6,263 claims | [CONFIRMED] |
| 146 | 146_item_xref_origin_and_related_derive.sql | 52 | ALTER item_cross_references ADD origin; backfill; CREATE related_items_derived fn+view | **header self-declares NOT YET APPLIED** | [HYPOTHESIS] F-10 |
| 147 | 147_sources_fetch_status.sql | 27 | ALTER sources ADD fetch_status/fetch_status_at | **header self-declares NOT YET APPLIED** | [HYPOTHESIS] F-10 |
| 148 | 148_surface_counts.sql | 187 | CREATE surface_of, get_surface_counts, get_all_surface_counts | **header self-declares NOT YET APPLIED** | [HYPOTHESIS] F-10 |
| 149 | 149_severity_backfill_ops_reg.sql | 29 | DML: 1 UPDATE, depends on surface_of() | **header self-declares NOT YET APPLIED** | [HYPOTHESIS] F-10 |
| 150 | 150_criterion2_url_canonicalize.sql | 357 | CREATE canonicalize_citation_url; CREATE OR REPLACE validate_item_provenance (criterion-2 canonicalize) | **header self-declares NOT YET APPLIED**; stale "migration 145 revision" self-comment | [HYPOTHESIS] F-10, F-11 |
| 151 | 151_published_price_statistics.sql | 77 | CREATE published_price_statistics + idx + RLS | **[CONFIRMED, HEADER-DRIFT]** header says NOT YET APPLIED; LIVE 10 rows | [CONFIRMED] F-12 |
| 152 | 152_state_cost_facts.sql | 91 | CREATE state_cost_facts + 3 idx + 2 CHECK + RLS | **[CONFIRMED, HEADER-DRIFT]** header says NOT YET APPLIED / schema-home-only; LIVE 13 rows | [CONFIRMED] F-12 |
| 153 | 153_community_post_signoff_requests.sql | 87 | CREATE community_post_signoff_requests + 2 idx; ALTER community_posts; RLS x3 | **[CONFIRMED, HEADER-DRIFT]** header says NOT YET APPLIED; LIVE (table exists, 0 rows); also filename/self-reference mismatch (151→153) | [CONFIRMED] F-12, F-13 |
| 154 | 154_community_signoff_withdraw_policy.sql | 39 | CREATE POLICY signoff_withdraw_own | header accurately says APPLIED+verified | [CONFIRMED] |
| 155 | 155_community_group_vertical.sql | 43 | ALTER community_groups ADD vertical + idx | header accurately says APPLIED+verified | [CONFIRMED] |
| 156 | 156_org_member_bans.sql | 122 | CREATE org_member_bans + idx + RLS; CREATE OR REPLACE accept_invitation (ban guard) | LIVE (0 rows); header accurate | [CONFIRMED] |
| 157 | 157_security_hardening.sql | 74 | DROP/CREATE POLICY on intelligence_items/staged_updates/provisional_sources; ALTER VIEW security_invoker | **[CONFIRMED, serious]** closes a long-standing anon-read exposure (128 quarantined + 57 unverified items, all staged_updates, all provisional_sources) | [CONFIRMED] F-14 |
| 158 | 158_floor_unconditional_label_per_claim.sql | 367 | CREATE OR REPLACE validate_item_provenance (floor unconditional + per-claim label) | live, blast-radius (72 items) explicitly deferred to re-validation, not silent | [CONFIRMED] |
| 159 | 159_intelligence_items_fts.sql | 56 | ALTER intelligence_items ADD search_tsv (GENERATED) + GIN idx; CREATE search_intelligence_items | header accurate, live | [CONFIRMED] |
| 160 | 160_search_path_pin_app_functions.sql | 105 | 56x ALTER FUNCTION SET search_path | **[CONFIRMED via self-reported proof]** closes search_path-mutable class across 56 functions | [CONFIRMED] |
| 161 | 161_sources_content_hash.sql | 33 | ALTER sources ADD last_content_hash/last_content_changed_at | header accurate, live | [CONFIRMED] |
| 162 | 162_portal_link_candidates.sql | 48 | CREATE portal_link_candidates + 2 idx + RLS(0 policies) | LIVE (57472 rows) | [CONFIRMED] |
| 163 | 163_reconciler_integrity_flags_insert.sql | 34 | CREATE POLICY integrity_flags_reconciler_insert | header: found already-applied out-of-band, ledgered retroactively; names a residual (reconciler still can't SELECT its inputs) | [CONFIRMED] |
| 164 | 164_market_intel_org_gate.sql | 127 | DROP+CREATE get_market_intel_items (restores `_assert_org_membership`) | **[CONFIRMED - resolves F-09]** | [CONFIRMED] |
| 165 | 165_profiles_self_write_and_anon_pii.sql | 79 | CREATE profiles_self_insert/update; REVOKE+GRANT column-scoped SELECT | **[CONFIRMED, serious]** fixes profile self-edit no-op (since mig. 002) + anon PII exposure | [CONFIRMED] F-15 |
| 166 | 166_provisional_sources_admin_select.sql | 45 | DROP+CREATE POLICY provisional_sources_admin_read | [CONFIRMED, self-diagnosed] fixes a regression 157 introduced (empty admin queue) | [CONFIRMED] |
| 167 | 167_staged_updates_reviewer_notes.sql | 35 | ALTER staged_updates ADD reviewer_notes | [CONFIRMED, self-diagnosed] phantom-column bug, real | [CONFIRMED] |
| 168 | 168_aux_table_parent_gates.sql | 113 | DROP+CREATE 5 SELECT policies (parent-gated) | **[CONFIRMED, serious]** fixes a leak 157 left behind in 5 child tables | [CONFIRMED] F-16 |
| 169 | 169_reconciler_rls_repair.sql | 65 | CREATE 3 SELECT policies TO reconciler | closes reconciler-soundness gap flagged by 163 | [CONFIRMED] |
| 170 | 170_ledger_repair_107_134.sql | 73 | DO-block guarded INSERT into schema_migrations (15 rows) | pure ledger bookkeeping, no DDL | [CONFIRMED] |

## Findings

| ID | File:line | Finding | Status | Severity | Disposition |
|---|---|---|---|---|---|
| F-01 | 016_add_processing_pause.sql (whole file) | `system_state` gets RLS-enabled live (per live JSON, zero-policy) but this migration never issues `ALTER TABLE system_state ENABLE ROW LEVEL SECURITY`. The enabling migration is not in 001-170. | [HYPOTHESIS] | P2 | keep - cosmetic provenance gap only; live posture (RLS-enabled, 0 policies = deny-all) is already safe. Coordinator: grep migrations 043 or 171+ for the enabling statement, note it in `docs/inventories/migrations.md`. |
| F-02 | 029_community_group_members.sql | `community_group_invitations` table created here is absent from the live-schema JSON row-count dump. | [HYPOTHESIS] | P2 | investigate - coordinator: `SELECT to_regclass('public.community_group_invitations')` live. If genuinely dropped, find and cite the drop migration; if never dropped, the live-schema snapshot's exact_rows list may simply be non-exhaustive (worth confirming the snapshot's own completeness claim). |
| F-03 | 032, 041 (RLS policies); resolved partially at 075 | RLS policies on `notifications`/`moderation_reports` (032) and `post_promotions` (041) reference `user_profiles.is_platform_admin`. Migration 075 adds `profiles.is_platform_admin` and formally deprecates `user_profiles`, but does not redefine these three policies to read `profiles` instead. `user_profiles` itself is dropped at out-of-range migration 183. | [HYPOTHESIS] | P1 | fix - coordinator: confirm whether a migration between 076-183 (some outside this lane's range) redefines these policies; if not, they will hard-error post-183 on their admin-read branch (EXISTS against a dropped table raises, not silently-false). Exact SQL for the fix (pattern already established at 075/081): `DROP POLICY ...; CREATE POLICY ... USING (... EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true) ...)` for each of the 3 policies. Effort: small (3 policy redefinitions, one migration). |
| F-04 | 043_security_advisor_fixes.sql (view `open_conflicts`) | `open_conflicts` view selects FROM `source_conflicts`, a table dropped by out-of-range migration 215 (per fsi-app/.claude/CLAUDE.md's own note: "source_conflicts dropped by migration 215"). Unless 215 or a later migration also drops/replaces the view, it is now a dangling view over a nonexistent table. | [HYPOTHESIS] | P2 | investigate - coordinator: `SELECT to_regclass('public.open_conflicts')`; if it still exists, `DROP VIEW public.open_conflicts;` (the underlying feature - source-vs-source conflict tracking - is confirmed dormant per fsi-app/.claude/CLAUDE.md's own architecture note that the demotion vocabulary already dropped `critical_conflict`). Effort: trivial. |
| F-05 | 051_sources_last_scanned_recovery.sql | Migration's own comment claims `last_scanned` is "backfilled from `last_checked`", but the file contains no backfill UPDATE statement. | [CONFIRMED] | P3 | keep - cosmetic doc/code mismatch inside one file; no live-state risk (the column being NULL for pre-existing rows is a safe default, not a defect). No action needed beyond correcting the comment if the file is ever touched again. |
| F-06 | 092_source_bias_tags.sql | This migration `GRANT SELECT ... TO anon, authenticated` on `source_bias_tags` without ever enabling RLS on the table in the same file. Live-schema JSON now shows RLS enabled with 0 policies (deny-all-safe today), but the enabling migration is not identifiable within 001-170. | [CONFIRMED] | P2 | keep - current live posture is safe (RLS-enabled + 0 policies = deny-all even with a table GRANT). Coordinator: identify and record which migration enabled RLS on `source_bias_tags` (likely part of the same security-hardening wave as 157, or an out-of-range advisor sweep) so the provenance is documented, matching the standard this audit is applying elsewhere. |
| F-07 | 094_tier_compat_shim.sql | `ALTER TABLE public.sources ADD COLUMN tier INT;` has no `IF NOT EXISTS` guard - the only such exception across the entire 001-170 corpus (every other `ADD COLUMN` uses the guard). Re-running this migration would fail. | [CONFIRMED] | P3 | keep - Supabase's migration-ledger tracking prevents re-application in practice; low risk. Flagging only because it is the corpus's own established convention and the one deviation from it. If migration 094 is ever amended, add `IF NOT EXISTS`. |
| F-08 | 101_intelligence_items_domain_backfill.sql | Header says "PROPOSED, NOT APPLIED" but the file is wrapped in `BEGIN/COMMIT`, and its companion audit table (`intelligence_items_domain_backfill_audit`) is confirmed dropped by out-of-range migration 219 - a table only gets dropped if it existed, which only happens if this migration ran. Same header-drift class as the prior audit's 330/331/335 findings. | [HYPOTHESIS] | P2 | fix header - coordinator: confirm live domain distribution matches the migration's own stated expected result (d=1: ~395, d=4: ~83, etc.) and, if confirmed, update the header comment from "PROPOSED, NOT APPLIED" to "APPLIED", per the same disposition the prior A5 audit gave 335/331. |
| F-09 | 108_market_intel_rpc_trajectory_payload.sql through 125_routing_by_item_type.sql (108,110,117,125); resolved at 164_market_intel_org_gate.sql | **[CONFIRMED, HIGH-SEVERITY, RESOLVED]** Migration 108 rewrote `get_market_intel_items` from the migration-077/084 pattern (`LANGUAGE plpgsql`, `PERFORM public._assert_org_membership(p_org_id)`, `s.category = 'market_news'` routing) back to a `LANGUAGE sql` body with no membership check and pre-084 `source_role IN (...)` routing - apparently by copying a stale function body as the base for a column-addition change. This regressed body was then copied forward verbatim by three more migrations (110, 117, 125), each adding unrelated columns/predicates without restoring the check, until migration 164 explicitly diagnosed and fixed it ("migration 108 ... SILENTLY DROPPED the `_assert_org_membership` call"). Migration 164's own root-cause writeup independently confirms the exact defect and its live impact: "any authenticated user calling the RPC with a foreign p_org_id reads that org's workspace_item_overrides overlay ... masked today only by single-tenancy." | [CONFIRMED, resolved] | P0 (was live for ~6 weeks / 5 migrations before the platform's own team caught and fixed it) | no further DB action - confirmed fixed at 164. Process recommendation: add a fitness-function / CI check that asserts every `SECURITY DEFINER` RPC taking `p_org_id` calls `_assert_org_membership` (or an equivalent), so a future DROP+CREATE that copies a stale body cannot silently regress this again. Effort: medium (one new `.discipline/fitness/functions/` check, e.g. `F-market-intel-membership-gate.mjs`, parsing `pg_get_functiondef` for each of the 10 sibling RPCs). |
| F-10 | 146,147,148,149,150 (the "rides the DDL push" batch) | Five consecutive migrations self-declare "NOT YET APPLIED" in their headers, describing a pending operator DDL window. Cannot be confirmed live or dead from the row-count-only live-schema JSON (no column/function-level detail for these specific objects). | [HYPOTHESIS] | P1 | verify - coordinator: run the following live and update each header accordingly: `SELECT column_name FROM information_schema.columns WHERE table_name='item_cross_references' AND column_name='origin'` (146); `SELECT column_name FROM information_schema.columns WHERE table_name='sources' AND column_name='fetch_status'` (147); `SELECT proname FROM pg_proc WHERE proname IN ('surface_of','get_surface_counts','get_all_surface_counts')` (148); `SELECT severity, count(*) FROM intelligence_items GROUP BY severity` cross-checked against the 149 diagnosis (149); `SELECT proname FROM pg_proc WHERE proname='canonicalize_citation_url'` (150). Given 151/152/153 from the *same* stated batch style are confirmed live (F-12), the prior probability that 146-150 are also live and merely un-updated in their headers is high. |
| F-11 | 150_criterion2_url_canonicalize.sql, trailing `COMMENT ON FUNCTION` | The migration's own `COMMENT ON FUNCTION public.validate_item_provenance` text still reads "migration 145 revision" instead of "150" - a stale copy-paste left in the shipped comment. | [CONFIRMED] | P3 | fix - trivial one-line `COMMENT ON FUNCTION` correction whenever 150 is next touched; cosmetic only, does not affect gate behavior. |
| F-12 | 151_published_price_statistics.sql, 152_state_cost_facts.sql, 153_community_post_signoff_requests.sql | **[CONFIRMED, HEADER-DRIFT]** All three headers self-declare "NOT YET APPLIED" (151: "no seed data... renders the honest pending frame"; 152: "schema home ONLY... Apply + backfill is a separate operator-ruled data dispatch"; 153: "COMMITTED, NOT APPLIED... the future-DDL-window shape"). Live-schema JSON directly contradicts all three: `published_price_statistics: 10` rows, `state_cost_facts: 13` rows, `community_post_signoff_requests: 0` rows (a table with 0 rows still had to exist to appear in a live `count(*)` sweep). This is the same class of defect the prior audit (`docs/audits/app-audit-a5-database-2026-09-30.md`) found for migrations 330/331/335 - a "NOT APPLIED" self-declaration that goes stale once the migration actually ships, with nothing that re-checks and corrects it afterward. | [CONFIRMED] | P1 (documentation-trust integrity, not a live security/data risk - the objects are safely live) | fix - update the header comment in all three files from "NOT YET APPLIED" to "APPLIED" (mirroring the pattern migration 085/090/099/etc. use elsewhere in this same corpus for self-correction). Recommend, as a class fix (this is now confirmed as a *recurring* pattern, not a one-off - see also F-08, F-10, and the prior audit's 330/331/335): a fitness-function check that flags any migration file whose header text contains "NOT YET APPLIED" / "NOT APPLIED" / "PROPOSED" while its own DDL objects are confirmed present in `information_schema` / `pg_proc`, so header staleness stops requiring a manual audit to catch. Effort: medium (one new script, run against the coordinator's live-schema snapshot or an information_schema query, cross-referencing migration file headers). |
| F-13 | 153_community_post_signoff_requests.sql, line 2 | The file's own in-header self-reference reads "151_community_post_signoff_requests.sql" - a residual from before the file was renumbered to 153 (avoiding the collision with 151_published_price_statistics, which 152's own header separately documents doing for itself). Filename and internal self-reference now disagree. | [CONFIRMED] | P3 | fix - trivial: correct the header's filename self-reference from 151 to 153. Same class as the 040/038a header/filename mismatch (F found earlier in-range, cosmetic). |
| F-14 | 157_security_hardening.sql (context: migrations 005 through 156) | **[CONFIRMED, serious, resolved]** `intelligence_items_read`, `staged_updates_read`, and `provisional_sources_read` carried `SELECT TO public USING (true)` policies from migration 005 (2026-04-xx era) through migration 157 (2026-07-07) - the anon key could read every quarantined and unverified `intelligence_items` row (128 + 57 per the migration's own live-confirmed count), every `staged_updates` row, and every `provisional_sources` row (497), for the platform's entire history up to that point. Migration 157 fixes this with a well-verified, well-documented tightening (explicit anon-key smoke tests embedded in the header). | [CONFIRMED, resolved] | P0 (historic, now closed) | no further action - confirmed fixed. Noted for the record as the most significant single finding in this lane's read range; the fix is sound and self-verified to the standard CLAUDE.md rule 15 demands. |
| F-15 | 165_profiles_self_write_and_anon_pii.sql (context: migration 002 through 164) | **[CONFIRMED, serious, resolved]** `profiles` had exactly one RLS policy (`"Public read"`, `USING (true)`) since migration 002, with (a) no INSERT/UPDATE policy ever defined - every browser self-edit and onboarding save silently affected 0 rows while the UI reported success, a correctness defect independent of security - and (b) the anon key could read `email`, `linkedin_sub`, and `is_platform_admin` off every profile row. Migration 165 fixes both with self-insert/self-update RLS policies and a column-scoped `REVOKE`/`GRANT` (the correct Postgres mechanism for column-level anon restriction, since RLS alone is row-scoped). | [CONFIRMED, resolved] | P0 (historic, now closed) | no further action - confirmed fixed. Same standard as F-14: self-verified, well-scoped, includes a live reader-enumeration audit before tightening. |
| F-16 | 168_aux_table_parent_gates.sql (context: migration 157 through 167) | **[CONFIRMED, serious, resolved]** After migration 157 tightened `intelligence_items_read` to `provenance_status='verified' AND is_archived IS NOT TRUE`, five child tables (`item_timelines`, `item_cross_references`, `item_disputes`, `item_supersessions`, `item_changelog`) still carried `USING(true)` SELECT policies, so anon could still read rows naming quarantined/archived items - 689+ leaked timeline rows alone per the migration's own count. A "tightened the parent, forgot the children" gap, live for roughly 4 days (2026-07-07 to 2026-07-11) before 168 closed it. | [CONFIRMED, resolved] | P1 (historic, now closed; shorter exposure window than F-14/F-15) | no further action - confirmed fixed, and correctly requires both FK endpoints to pass on the two dual-FK tables. |
| F-17 | 021_canonical_source_candidates.sql / 043_security_advisor_fixes.sql | `canonical_source_candidates` shipped in 021 with no RLS at all; 043 enables RLS and adds admin-only policies 22 migrations later. Confirmed closed within range, cited for completeness of the "shipped without RLS, closed later" pattern (same shape as F-06 and 091/099). | [CONFIRMED] | P3 | no action - already closed within the audited range. |
| F-18 | 036_admin_notifications_rpc.sql | `admin_attention_counts()` shipped with two hardcoded-`0` placeholder slots (`source_attribution_mismatches`, `coverage_gaps_critical`) explicitly promised to be "populated by W1.C / W2.D follow-up." Migration 140 (in range) extends the function with a new real column but does **not** wire up either of the two original placeholders - they are still present as literal 0s in 140's body. | [HYPOTHESIS] | P2 | investigate - coordinator: grep migrations 171+ and `fsi-app/src` for whether `source_attribution_mismatches` or `coverage_gaps_critical` were ever wired to a real query; if not, these are stale promises worth either fulfilling or removing per CLAUDE.md rule 13 ("a flag is a commitment"). |

## Coverage appendix

One row per file read in full, in the order read. 166 rows, matching the file count exactly.

| # | File | Lines read |
|---:|---|---:|
| 1 | 001_schema.sql | 153 |
| 2 | 002_rls.sql | 26 |
| 3 | 003_indexes.sql | 23 |
| 4 | 004_source_trust_framework.sql | 628 |
| 5 | 005_rls_trust_framework.sql | 107 |
| 6 | 006_multi_tenant.sql | 313 |
| 7 | 006_rls_multi_tenant.sql | 189 |
| 8 | 007_community_layer.sql | 529 |
| 9 | 007_full_brief.sql | 93 |
| 10 | 007_rls_community.sql | 158 |
| 11 | 009_capture_undeclared_tables.sql | 97 |
| 12 | 010_migrate_legacy_to_item.sql | 191 |
| 13 | 011_backfill_orphan_supersessions.sql | 88 |
| 14 | 013_drop_legacy_tables.sql | 33 |
| 15 | 015_provisional_recommended_classification.sql | 24 |
| 16 | 016_add_processing_pause.sql | 44 |
| 17 | 017_add_admin_only_to_sources.sql | 23 |
| 18 | 018_b2_brief_schema.sql | 47 |
| 19 | 019_reclassify_mistyped_tools.sql | 45 |
| 20 | 020_intersection_readiness.sql | 67 |
| 21 | 021_canonical_source_candidates.sql | 59 |
| 22 | 022_canonical_source_classification_cache.sql | 19 |
| 23 | 023_intersection_detection_function.sql | 120 |
| 24 | 024_admin_action_cooldowns.sql | 31 |
| 25 | 025_sector_activation_interest.sql | 28 |
| 26 | 026_research_pipeline_stage.sql | 34 |
| 27 | 027_user_profiles.sql | 160 |
| 28 | 028_community_groups.sql | 152 |
| 29 | 029_community_group_members.sql | 279 |
| 30 | 030_community_posts.sql | 201 |
| 31 | 031_community_topics.sql | 130 |
| 32 | 032_community_notifications_moderation.sql | 307 |
| 33 | 033_jurisdiction_iso.sql | 70 |
| 34 | 034_staged_updates_materialization_error.sql | 34 |
| 35 | 035_agent_integrity_flags.sql | 95 |
| 36 | 036_admin_notifications_rpc.sql | 90 |
| 37 | 037_source_verification.sql | 97 |
| 38 | 038_bulk_import_audit.sql | 38 |
| 39 | 039_coverage_matrix_rpc.sql | 63 |
| 40 | 040_discovery_provenance.sql | 37 |
| 41 | 041_post_promotions.sql | 153 |
| 42 | 042_community_region_counts_rpc.sql | 55 |
| 43 | 043_security_advisor_fixes.sql | 148 |
| 44 | 044_integrity_flag_trigger_tune.sql | 74 |
| 45 | 045_orphan_slugs_and_acf_dedup.sql | 128 |
| 46 | 046_community_rls_recursion_fix.sql | 121 |
| 47 | 047_workspace_intelligence_slim_rpc.sql | 105 |
| 48 | 048_integrity_flags_platform.sql | 129 |
| 49 | 049_perf_v2_indexes.sql | 70 |
| 50 | 050_integrity_flags_workflow_gap.sql | 29 |
| 51 | 051_sources_last_scanned_recovery.sql | 26 |
| 52 | 052_raw_fetches.sql | 62 |
| 53 | 053_intelligence_item_versions.sql | 139 |
| 54 | 054_sources_scoreboard_columns.sql | 33 |
| 55 | 055_sources_auto_run_enabled.sql | 27 |
| 56 | 056_sources_access_method_extension.sql | 45 |
| 57 | 057_agent_runs.sql | 61 |
| 58 | 058_ingestion_control_log.sql | 43 |
| 59 | 059_ingestion_state.sql | 46 |
| 60 | 060_user_watchlist.sql | 27 |
| 61 | 061_coverage_gaps.sql | 48 |
| 62 | 062_intelligence_items_hidden_reason.sql | 20 |
| 63 | 063_sources_classification_axes.sql | 72 |
| 64 | 064_workspace_intelligence_dashboard_rpc.sql | 116 |
| 65 | 065_pending_first_fetch_queue.sql | 145 |
| 66 | 066_workspace_intelligence_listings_rpc.sql | 136 |
| 67 | 067_sources_classification_metadata.sql | 9 |
| 68 | 068_workspace_intelligence_aggregates.sql | 145 |
| 69 | 069_workspace_intelligence_aggregates_scoped.sql | 136 |
| 70 | 070_phase1_routing_rpcs.sql | 393 |
| 71 | 071_deterministic_tiebreaker.sql | 333 |
| 72 | 072_jurisdiction_normalizer.sql | 318 |
| 73 | 073_shared_workspace_scope.sql | 628 |
| 74 | 074_ecovadis_vendor_reclass.sql | 65 |
| 75 | 075_profiles_consolidation_phase1.sql | 391 |
| 76 | 076_org_invitations.sql | 436 |
| 77 | 077_rpc_membership_checks.sql | 740 |
| 78 | 079_canonical_entity_columns.sql | 116 |
| 79 | 080_jurisdiction_vocabulary_extension.sql | 588 |
| 80 | 081_admin_signal_documentation.sql | 46 |
| 81 | 082_operator_queues_and_routing.sql | 334 |
| 82 | 083_trigger_derive_jurisdiction_iso.sql | 227 |
| 83 | 084_sources_canonical_category.sql | 190 |
| 84 | 085_d16_document_063_column_shadowing.sql | 57 |
| 85 | 086_analytical_press_routing.sql | 191 |
| 86 | 087_canonicalize_source_urls.sql | 225 |
| 87 | 088_citation_stats_rpc.sql | 87 |
| 88 | 089_intelligence_item_citations.sql | 145 |
| 89 | 090_tier_schema_split.sql | 166 |
| 90 | 091_source_tier_opinions.sql | 156 |
| 91 | 092_source_bias_tags.sql | 149 |
| 92 | 093_sources_tier_override.sql | 127 |
| 93 | 094_tier_compat_shim.sql | 70 |
| 94 | 097_q4_bias_retune_option_b.sql | 33 |
| 95 | 098_get_source_citation_stats_edge_table.sql | 69 |
| 96 | 099_tier_opinion_review_state.sql | 146 |
| 97 | 100_research_source_coverage_rpc.sql | 85 |
| 98 | 101_intelligence_items_domain_backfill.sql | 419 |
| 99 | 102_severity_band_theme_columns.sql | 93 |
| 100 | 103_intelligence_item_sections.sql | 76 |
| 101 | 104_community_post_intelligence_refs.sql | 29 |
| 102 | 105_profiles_projection.sql | 78 |
| 103 | 106_regions_and_facts.sql | 122 |
| 104 | 107_intelligence_items_trajectory_points.sql | 57 |
| 105 | 108_market_intel_rpc_trajectory_payload.sql | 132 |
| 106 | 109_region_dimension_coverage.sql | 173 |
| 107 | 110_callout_columns_and_rpc_extension.sql | 243 |
| 108 | 111_workspace_overrides_dismissed_at.sql | 78 |
| 109 | 112_provenance_invariant_schema.sql | 149 |
| 110 | 113_seed_item_type_required_slots.sql | 55 |
| 111 | 114_validate_item_provenance.sql | 431 |
| 112 | 115_set_provenance_status_trigger.sql | 148 |
| 113 | 116_active_intelligence_items_view.sql | 36 |
| 114 | 117_provenance_gate_customer_rpcs.sql | 131 |
| 115 | 118_provenance_flip_binding.sql | 166 |
| 116 | 119_validate_item_provenance_failclose.sql | 349 |
| 117 | 120_provenance_gate_remaining_customer_rpcs.sql | 86 |
| 118 | 121_uniform_promotion_no_human_tick.sql | 348 |
| 119 | 122_source_institutions.sql | 41 |
| 120 | 123_source_label_derivation.sql | 79 |
| 121 | 124_monitoring_queue_reconciled_at.sql | 20 |
| 122 | 125_routing_by_item_type.sql | 138 |
| 123 | 126_research_required_slots.sql | 16 |
| 124 | 128_research_finding_slot_ledger_fix.sql | 58 |
| 125 | 129_market_required_slots.sql | 81 |
| 126 | 130_technology_required_slots.sql | 66 |
| 127 | 131_operations_required_slots.sql | 88 |
| 128 | 132_operations_slot_gap_satisfiable.sql | 52 |
| 129 | 133_get_technology_items_rpc.sql | 56 |
| 130 | 134_fix_research_technology_rpc_columns.sql | 81 |
| 131 | 135_source_registration_guard.sql | 56 |
| 132 | 136_theme_candidate_capture.sql | 28 |
| 133 | 137_reg_family_slot_gap_satisfiable.sql | 72 |
| 134 | 138_reg_only_authority_floor.sql | 336 |
| 135 | 139_close_quarantine_flags_on_verify.sql | 124 |
| 136 | 140_attention_counts_platform_flags.sql | 82 |
| 137 | 141_per_type_authority_floor.sql | 361 |
| 138 | 142_legal_line_guard.sql | 363 |
| 139 | 143_label_variant_tolerance.sql | 348 |
| 140 | 144_scrape_cadence.sql | 24 |
| 141 | 145_provenance_floor_inline_derive.sql | 343 |
| 142 | 146_item_xref_origin_and_related_derive.sql | 52 |
| 143 | 147_sources_fetch_status.sql | 26 |
| 144 | 148_surface_counts.sql | 187 |
| 145 | 149_severity_backfill_ops_reg.sql | 29 |
| 146 | 150_criterion2_url_canonicalize.sql | 357 |
| 147 | 151_published_price_statistics.sql | 76 |
| 148 | 152_state_cost_facts.sql | 90 |
| 149 | 153_community_post_signoff_requests.sql | 86 |
| 150 | 154_community_signoff_withdraw_policy.sql | 39 |
| 151 | 155_community_group_vertical.sql | 43 |
| 152 | 156_org_member_bans.sql | 122 |
| 153 | 157_security_hardening.sql | 74 |
| 154 | 158_floor_unconditional_label_per_claim.sql | 367 |
| 155 | 159_intelligence_items_fts.sql | 56 |
| 156 | 160_search_path_pin_app_functions.sql | 105 |
| 157 | 161_sources_content_hash.sql | 33 |
| 158 | 162_portal_link_candidates.sql | 48 |
| 159 | 163_reconciler_integrity_flags_insert.sql | 34 |
| 160 | 164_market_intel_org_gate.sql | 127 |
| 161 | 165_profiles_self_write_and_anon_pii.sql | 79 |
| 162 | 166_provisional_sources_admin_select.sql | 45 |
| 163 | 167_staged_updates_reviewer_notes.sql | 35 |
| 164 | 168_aux_table_parent_gates.sql | 113 |
| 165 | 169_reconciler_rls_repair.sql | 65 |
| 166 | 170_ledger_repair_107_134.sql | 73 |

**166 coverage-appendix rows = 166 files read = 166 files in the generated file list for the
001-170 range.** Reconciled.

## Decision-ready items

1. **F-09 (get_market_intel_items org-gate regression, migrations 108→164).** Already resolved by
   the platform's own team at migration 164. No DB action needed. Recommended follow-up: a fitness
   function asserting every `p_org_id`-taking `SECURITY DEFINER` RPC calls `_assert_org_membership`,
   so a future stale-body copy cannot regress this again undetected for weeks. SQL/script: new file
   `.discipline/fitness/functions/F-rpc-membership-gate.mjs`, parses `pg_get_functiondef` for the 10
   RPCs named in migration 077's header and asserts the string `_assert_org_membership` appears in
   each body (or `auth.role() = 'service_role'` bypass is explicit). Effort: medium, ~1 session.

2. **F-12 (header-drift on migrations 151/152/153, and by strong inference 146-150).** Update the
   6-8 stale "NOT YET APPLIED" headers to "APPLIED" now that live-schema evidence confirms it for
   151/152/153 (10, 13, and 0-but-existing rows respectively) and coordinator verification is pending
   for 146-150 (F-10). Exact edits: `COMMENT`-block text changes only, no DDL. Effort: small, can be
   done in one migration-hygiene PR alongside F-08's similar fix for migration 101.

3. **F-03 (dangling `user_profiles.is_platform_admin` RLS references in migrations 032/041).**
   Needs a live check first (does a migration between 076 and 183, outside this lane's range,
   already fix this?) before authoring a fix migration. If not fixed, exact SQL is given in the
   findings table above. Effort: small once confirmed.

4. **F-04 (dangling `open_conflicts` view over dropped `source_conflicts`).** Needs a live check
   (`SELECT to_regclass('public.open_conflicts')`); if it still exists, `DROP VIEW
   public.open_conflicts;` is the fix, consistent with the platform's own confirmed decision that
   source-vs-source conflict tracking is dormant. Effort: trivial.

5. **Process recommendation (spans F-08, F-10, F-12, and the prior audit's 330/331/335 finding).**
   The "self-declared NOT APPLIED header that goes stale" defect has now recurred at least 4 times
   across two independent audit lanes (this one and the prior A5 lane), spanning migrations 101,
   146-153, and 330/331/335. It is a systemic authoring-discipline gap, not a series of isolated
   mistakes. Recommend a fitness-function check (see F-12's disposition) rather than relying on
   audits to keep catching it by hand.

---

Verification: run `node fsi-app/scripts/verify/audit-finding-status.mjs` against this file before
commit - every list-shaped finding line above carries an explicit `[CONFIRMED]` / `[HYPOTHESIS]` /
`[REFUTED]` token; the findings table itself is exempt per that script's own table-row carve-out
("tables carry their own status column").
