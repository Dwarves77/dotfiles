# Migrations Inventory

**Generated 2026-05-21** (Layer 4 cross-skill consistency dispatch).

## Migrations

| # | File | Subject (from header comment) |
|---|---|---|
| 001 | 001_schema.sql | FSI Phase 2: Database Schema |
| 002 | 002_rls.sql | FSI Phase 2: Row Level Security |
| 003 | 003_indexes.sql | FSI Phase 2: Performance Indexes |
| 004 | 004_source_trust_framework.sql | ══════════════════════════════════════════════════════════════ |
| 005 | 005_rls_trust_framework.sql | ══════════════════════════════════════════════════════════════ |
| 006 | 006_multi_tenant.sql | ══════════════════════════════════════════════════════════════ |
| 006 | 006_rls_multi_tenant.sql | ══════════════════════════════════════════════════════════════ |
| 007 | 007_community_layer.sql | ══════════════════════════════════════════════════════════════ |
| 007 | 007_full_brief.sql | Add full_brief column for skill-standard intelligence briefs |
| 007 | 007_rls_community.sql | ══════════════════════════════════════════════════════════════ |
| 009 | 009_capture_undeclared_tables.sql | ════════════════════════════════════════════════════════════════════ |
| 010 | 010_migrate_legacy_to_item.sql | ════════════════════════════════════════════════════════════════════ |
| 011 | 011_backfill_orphan_supersessions.sql | ════════════════════════════════════════════════════════════════════ |
| 013 | 013_drop_legacy_tables.sql | ════════════════════════════════════════════════════════════════════ |
| 015 | 015_provisional_recommended_classification.sql | ════════════════════════════════════════════════════════════════════ |
| 016 | 016_add_processing_pause.sql | ════════════════════════════════════════════════════════════════════ |
| 017 | 017_add_admin_only_to_sources.sql | ════════════════════════════════════════════════════════════════════ |
| 018 | 018_b2_brief_schema.sql | ════════════════════════════════════════════════════════════════════ |
| 019 | 019_reclassify_mistyped_tools.sql | ════════════════════════════════════════════════════════════════════ |
| 020 | 020_intersection_readiness.sql | ════════════════════════════════════════════════════════════════════ |
| 021 | 021_canonical_source_candidates.sql | ════════════════════════════════════════════════════════════════════ |
| 022 | 022_canonical_source_classification_cache.sql | ════════════════════════════════════════════════════════════════════ |
| 023 | 023_intersection_detection_function.sql | ════════════════════════════════════════════════════════════════════ |
| 024 | 024_admin_action_cooldowns.sql | Migration 024 — Admin action cooldowns |
| 025 | 025_sector_activation_interest.sql | Migration 025 — Sector activation interest tracking |
| 026 | 026_research_pipeline_stage.sql | 026_research_pipeline_stage.sql |
| 027 | 027_user_profiles.sql | Migration 027 — User profiles |
| 028 | 028_community_groups.sql | Migration 028 — Community groups |
| 029 | 029_community_group_members.sql | Migration 029 — Community group members and invitations |
| 030 | 030_community_posts.sql | Migration 030 — Community posts |
| 031 | 031_community_topics.sql | Migration 031 — Community topics |
| 032 | 032_community_notifications_moderation.sql | Migration 032 — Community notifications, preferences, and moderation reports |
| 033 | 033_jurisdiction_iso.sql | 033_jurisdiction_iso.sql |
| 034 | 034_staged_updates_materialization_error.sql | 034_staged_updates_materialization_error.sql |
| 035 | 035_agent_integrity_flags.sql | 035_agent_integrity_flags.sql |
| 036 | 036_admin_notifications_rpc.sql | 036_admin_notifications_rpc.sql |
| 037 | 037_source_verification.sql | 037_source_verification.sql |
| 038 | 038_bulk_import_audit.sql | 038_bulk_import_audit.sql |
| 039 | 039_coverage_matrix_rpc.sql | 039_coverage_matrix_rpc.sql |
| 040 | 040_discovery_provenance.sql | 038a_discovery_provenance.sql |
| 041 | 041_post_promotions.sql | Migration 041 — Community-post promotion audit |
| 042 | 042_community_region_counts_rpc.sql | Migration 042 — Community region count RPC |
| 043 | 043_security_advisor_fixes.sql | 043_security_advisor_fixes.sql |
| 044 | 044_integrity_flag_trigger_tune.sql | 044_integrity_flag_trigger_tune.sql |
| 045 | 045_orphan_slugs_and_acf_dedup.sql | ════════════════════════════════════════════════════════════════════ |
| 046 | 046_community_rls_recursion_fix.sql | 046_community_rls_recursion_fix.sql |
| 047 | 047_workspace_intelligence_slim_rpc.sql | Slim sibling of get_workspace_intelligence for list-view callers. |
| 048 | 048_integrity_flags_platform.sql | 048_integrity_flags_platform.sql |
| 049 | 049_perf_v2_indexes.sql | Migration 049 — perf v2 indexes (2026-05-08) |
| 050 | 050_integrity_flags_workflow_gap.sql | Migration 050: Widen integrity_flags.category CHECK constraint |
| 051 | 051_sources_last_scanned_recovery.sql | 051_sources_last_scanned_recovery.sql |
| 052 | 052_raw_fetches.sql | ════════════════════════════════════════════════════════════════════ |
| 053 | 053_intelligence_item_versions.sql | ════════════════════════════════════════════════════════════════════ |
| 054 | 054_sources_scoreboard_columns.sql | ════════════════════════════════════════════════════════════════════ |
| 055 | 055_sources_auto_run_enabled.sql | ════════════════════════════════════════════════════════════════════ |
| 056 | 056_sources_access_method_extension.sql | ════════════════════════════════════════════════════════════════════ |
| 057 | 057_agent_runs.sql | ════════════════════════════════════════════════════════════════════ |
| 058 | 058_ingestion_control_log.sql | ════════════════════════════════════════════════════════════════════ |
| 059 | 059_ingestion_state.sql | ════════════════════════════════════════════════════════════════════ |
| 060 | 060_user_watchlist.sql | Migration 060: user_watchlist |
| 061 | 061_coverage_gaps.sql | Migration 061: coverage_gaps |
| 062 | 062_intelligence_items_hidden_reason.sql | Migration 062: intelligence_items.hidden_reason |
| 063 | 063_sources_classification_axes.sql | Migration 063: sources classification axes (5-axis framework v1) |
| 064 | 064_workspace_intelligence_dashboard_rpc.sql | Dashboard projection sibling of get_workspace_intelligence. |
| 065 | 065_pending_first_fetch_queue.sql | ════════════════════════════════════════════════════════════════════ |
| 066 | 066_workspace_intelligence_listings_rpc.sql | Listings projection sibling of get_workspace_intelligence. |
| 067 | 067_sources_classification_metadata.sql | sources classification metadata |
| 068 | 068_workspace_intelligence_aggregates.sql | Aggregates RPC for the workspace intelligence dashboard. |
| 069 | 069_workspace_intelligence_aggregates_scoped.sql | Scoped sibling of get_workspace_intelligence_aggregates (068). |
| 070 | 070_phase1_routing_rpcs.sql | ───────────────────────────────────────────────────────────────────────────── |
| 071 | 071_deterministic_tiebreaker.sql | Migration 071: deterministic tiebreaker on LIMIT-bounded RPCs. |
| 072 | 072_jurisdiction_normalizer.sql | 072_jurisdiction_normalizer.sql |
| 073 | 073_shared_workspace_scope.sql | Migration 073: extract shared workspace-scope SQL function. |
| 074 | 074_ecovadis_vendor_reclass.sql | Migration 074: reclassify EcoVadis as vendor_corporate |
| 075 | 075_profiles_consolidation_phase1.sql | Migration 075 — Consolidate user_profiles into profiles (Phase 1) |
| 076 | 076_org_invitations.sql | Migration 076 — Org invitations + onboarding state machine |
| 077 | 077_rpc_membership_checks.sql | Migration 077 — Membership-scoped data access (Workstream C) |
| 079 | 079_canonical_entity_columns.sql | Migration 079 — Canonical-entity columns on intelligence_items |
| 080 | 080_jurisdiction_vocabulary_extension.sql | Migration 080 — Jurisdiction vocabulary extension + RC-7 rejection logic |
| 081 | 081_admin_signal_documentation.sql | Migration 081 — Admin signal documentation (Option C resolution) |
| 082 | 082_operator_queues_and_routing.sql | Migration 082 — Operator queue tables + rejected-token routing |
| 083 | 083_trigger_derive_jurisdiction_iso.sql | Migration 083 — Trigger derive jurisdiction_iso from canonical jurisdictions |
| 084 | 084_sources_canonical_category.sql | Migration 084: Canonical category column on sources; refine 3 category-routing R |
| 085 | 085_d16_document_063_column_shadowing.sql | Migration 085: D16 resolution. Document the migration 063 column shadowing decis |
| 086 | 086_analytical_press_routing.sql | Migration 086: Analytical press routing for the 8 named sources. |
| 087 | 087_canonicalize_source_urls.sql | ───────────────────────────────────────────────────────────────────────────── |
| 088 | 088_citation_stats_rpc.sql | Migration 088: get_source_citation_stats(source_ids UUID[]) RPC |
| 089 | 089_intelligence_item_citations.sql | Migration 089: brief-to-source edge table (Q1). |
| 090 | 090_tier_schema_split.sql | ───────────────────────────────────────────────────────────────────────────── |
| 091 | 091_source_tier_opinions.sql | 091_source_tier_opinions.sql |
| 092 | 092_source_bias_tags.sql | Migration 092: source_bias_tags table (Q4 bias tag vocabulary) |
| 093 | 093_sources_tier_override.sql | Migration 093: tier_override mechanism on sources (Q5 decision) |
| 094 | 094_tier_compat_shim.sql | Migration 094: Compatibility shim for Q2 (migration 090) tier -> base_tier renam |
| 097 | 097_q4_bias_retune_option_b.sql | Migration 097: D1 Option B retroactive retune. |

## Maintenance trigger

Per the 11th binding rule (Inventory-artifact emission): any commit that adds a migration MUST update this inventory + emit `Inventory-emission:` line.

## Source files

- Migration files: `fsi-app/supabase/migrations/*.sql`
- Naming: `NNN_descriptive_name.sql` (3-digit zero-padded; F6 fitness function enforces)
