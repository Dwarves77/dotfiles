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
| 098 | 098_get_source_citation_stats_edge_table.sql | Migration 098: get_source_citation_stats body swap. |
| 099 | 099_tier_opinion_review_state.sql | Migration 099: tier-opinion review state (dismissed_at/by/reason) + RLS for Phase 7 disagreement review surface. |
| 100 | 100_research_source_coverage_rpc.sql | Migration 100: get_research_source_coverage RPC. |
| 101 | 101_intelligence_items_domain_backfill.sql | Migration 101 (PROPOSED, NOT APPLIED): intelligence_items.domain backfill per docs/plans/classification-backfill-plan-2026-05-22.md. |
| 102 | 102_severity_band_theme_columns.sql | Migration 102: broaden severity enum (Q1), add signal_band (Q2), add theme (Q3) on intelligence_items per design rebuild dispatch v3. Applied 2026-05-24. |
| 103 | 103_intelligence_item_sections.sql | Migration 103: intelligence_item_sections table (Q4) with source_ids UUID[] per section. Powers 14-section reader on /regulations/[slug]. Applied 2026-05-24. |
| 104 | 104_community_post_intelligence_refs.sql | Migration 104: community_posts.referenced_intelligence_item_ids UUID[] (Q5) + GIN index for reverse-lookup powering Peer Discussion panels. Applied 2026-05-24. |
| 105 | 105_profiles_projection.sql | Migration 105: profiles projection columns (Q6) - org_id FK, workspace_role, sector text[], region text[]. region converted in place from scalar text. Applied 2026-05-24. |
| 106 | 106_regions_and_facts.sql | Migration 106: regions table with operations_decisions JSONB + regional_data_facts table (Q7). 5 current regions seeded (EU/US/ASIA/UK/UAE). Applied 2026-05-24. |
| 107 | 107_intelligence_items_trajectory_points.sql | Migration 107: intelligence_items.trajectory_points JSONB column + band-gated CHECK constraint (trajectory_points IS NULL OR signal_band = 'price'). Sprint 3 A4 belt 1 of three. No backfill, NULLs stay NULL per H1 trajectory precedent. |
| 108 | 108_market_intel_rpc_trajectory_payload.sql | Migration 108: extend get_market_intel_items RPC return shape with signal_band + trajectory_points so the page payload carries the data needed for A4-3's component-layer guard. CREATE OR REPLACE FUNCTION; idempotent. |
| 109 | 109_region_dimension_coverage.sql | Migration 109: region_dimension_coverage table (5 regions × 6 dimensions = 30 seeded rows) with 4-state CHECK (populated / partial / pending / missing), trigger-maintained fact_count from regional_data_facts. Sprint 3 A6.1. |
| 110 | 110_callout_columns_and_rpc_extension.sql | Migration 110: 4 new TEXT columns on intelligence_items (what_it_changes / does_not_resolve / conversion_trigger / cross_references) + DROP+CREATE both get_research_items and get_market_intel_items RPCs with extended return shapes. Sprint 3 R-A + M-A. |
| 111 | 111_workspace_overrides_dismissed_at.sql | Migration 111: ADD COLUMN dismissed_at TIMESTAMPTZ on workspace_item_overrides + partial index. Powers the manual priority tagging + dismissed stash dispatch (PRIORITY-TAGGING side-agent commit). |
| 112 | 112_provenance_invariant_schema.sql | Migration 112: source-provenance invariant — schema landing (provenance_status enum + columns + 3 supporting tables). Sprint 4 Block 1, task 1.1. |
| 113 | 113_seed_item_type_required_slots.sql | Migration 113: seed item_type_required_slots for the 5 D1 item_types (the provenance-criteria slot table). Sprint 4 Block 1, task 1.2. |
| 114 | 114_validate_item_provenance.sql | Migration 114: validate_item_provenance(item_id) — six-criteria provenance validation function. Sprint 4 Block 1, task 1.3. |
| 115 | 115_set_provenance_status_trigger.sql | Migration 115: set_provenance_status trigger on intelligence_items + sections + claims (re-derives + stamps the terminal provenance_status on write). Sprint 4 Block 1, task 1.4. |
| 116 | 116_active_intelligence_items_view.sql | Migration 116: active_intelligence_items view (verified-only customer surface). Sprint 4 Block 1, task 1.10. |
| 117 | 117_provenance_gate_customer_rpcs.sql | Migration 117: provenance-gate the RPC-routed customer surfaces — adds AND ii.provenance_status = 'verified' to the two query points (full-gate half). Sprint 4 Block 1, task 1.10. |
| 118 | 118_provenance_flip_binding.sql | Migration 118: #43 provenance-flip credential binding — a pre-existing intelligence_items row may be flipped off provenance_status='unverified' ONLY by the scoped non-owner reconciler role + guard trigger. Sprint 4 Phase 2 precondition. |
| 119 | 119_validate_item_provenance_failclose.sql | Migration 119: validate_item_provenance FAIL-CLOSE — a 0-section item no longer vacuously passes criteria 2-5; records no_section_content → quarantined. Sprint 4 Block 1. |
| 120 | 120_provenance_gate_remaining_customer_rpcs.sql | Migration 120: provenance-gate the remaining customer RPCs (completes the surface gate begun in 117). Sprint 4 Block 1. |
| 121 | 121_uniform_promotion_no_human_tick.sql | Migration 121: uniform promotion — a valid item flips to verified for ALL tiers (human-in-the-loop removed); criteria 1-5 byte-identical to 119. Sprint 4 Block 1. |
| 122 | 122_source_institutions.sql | Migration 122: institutions table (WHO published, keyed by registrable_domain) + sources.institution_id FK. A grouping/identity dimension, never a merge key; orthogonal to source_role/category. Source-layer fix, defect (b). |
| 123 | 123_source_label_derivation.sql | Migration 123: source label is a LIVE derivation — derive_source_category (== migration 084 CASE) + derive_source_intelligence_types + BEFORE INSERT/UPDATE trigger. category + intelligence_types now derive from source_role+name on every write (kills the hardcoded ['GUIDE'] placeholder + drift). See src/lib/sources/classify-source-role.ts. |
| 124 | 124_monitoring_queue_reconciled_at.sql | Migration 124: monitoring_queue.reconciled_at — claim marker for the reconcile worker (/api/worker/reconcile) so it consumes change_detected=true rows idempotently. Reconcile-loop activation. |
| 125 | 125_routing_by_item_type.sql | Migration 125: route customer surfaces by item_type → format → surface (get_market_intel_items / get_research_items / get_operations_items by item_type; supersedes source-attribute routing in 084/117). Applied 2026-06-04. |
| 126 | 126_research_required_slots.sql | Migration 126: seed item_type_required_slots for research_finding (finding, methodology_limits, decision_relevance, does_not_resolve). |
| 128 | 128_research_finding_slot_ledger_fix.sql | Migration 128: research_finding transitive-slot fix — decision_relevance + does_not_resolve descriptions signal GAP-satisfiability so synthesis sections (S3/S5) cover their slots. |
| 129 | 129_market_required_slots.sql | Migration 129: seed item_type_required_slots for market_signal + initiative (signal_event, driving_parties, conversion_trigger, action_now). |
| 130 | 130_technology_required_slots.sql | Migration 130: seed item_type_required_slots for technology/innovation/tool (deployment_reality, supplier_access, operational_fit, procurement_window). |
| 131 | 131_operations_required_slots.sql | Migration 131: seed item_type_required_slots for regional_data (cost_baseline, feasibility_choice, pending_change, region_jurisdiction). |
| 132 | 132_operations_slot_gap_satisfiable.sql | Migration 132: cost_baseline + feasibility_choice slots honestly GAP-satisfiable when the fetched content has no verbatim figure/verdict (the migration-128 pattern for regional_data). |
| 133 | 133_get_technology_items_rpc.sql | Migration 133: get_technology_items RPC — clone of get_research_items, item_type IN ('technology','innovation','tool'). Renamed from 130b to conform to 3-digit (F6) naming. |
| 134 | 134_fix_research_technology_rpc_columns.sql | Migration 134: fix get_research_items + get_technology_items — join intelligence_items for what_it_changes/does_not_resolve (not exposed by _workspace_active_items); the RPC-error → empty → /research fail-open root. |

## Maintenance trigger

Any commit that adds or removes a migration MUST update this inventory. C3 consistency check (rule 014) enforces drift on push.

## Source files

- Migration files: `fsi-app/supabase/migrations/*.sql`
- Naming: `NNN_descriptive_name.sql` (3-digit zero-padded; F6 fitness function enforces)
