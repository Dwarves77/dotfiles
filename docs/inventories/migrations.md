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
| 135 | 135_source_registration_guard.sql | Migration 135: source-registration invariant DB guard — BEFORE INSERT/UPDATE trigger on intelligence_items refuses archive-as-source (reclassified_to_source/source_not_item/institutional_source/non_regulatory_source/portal_artifact) without a registered active source for the item host. DB twin of rule 019 + db.mjs reclassifyToSource() + orphan-source-audit.mjs. APPLIED 2026-06-06 via apply-135.mjs (fire-tested live: blocks unregistered archive-as-source, allows registered). |
| 136 | 136_theme_candidate_capture.sql | Migration 136: theme_candidate column — minimal capture-not-null (Emergence-Capture INV-1) for out-of-vocabulary theme values. The agent/parser emit topic-tag-form themes; the live theme_check requires the /research grouping vocab (no 1:1 map), so the pipeline writes a DB-valid theme or null and BANKS the agent's proposed value in theme_candidate (with row provenance) instead of dropping it. Nullable, no CHECK, partial index. APPLIED 2026-06-07 (read-back verified column exists). Minimal capture only; residual store + recurrence/promotion is the governed follow-on. |
| 137 | 137_reg_family_slot_gap_satisfiable.sql | Migration 137: penalty_summary + primary_deadline made honestly GAP-satisfiable on the NON-BINDING reg-family types (standard/framework/guidance) via the migration-132 description-rewrite pattern — fixes the redo's verified→quarantined regression where correctly-grounded voluntary standards/strategies/guidance (no deadline, no penalty) false-quarantined on criterion-5 missing_required_slot. regulation/directive stay fully HARD (binding); effective_date + jurisdictional_scope stay HARD on all five types. Carry-condition B: the GAP is authorised only by the source's own voluntary/non-binding characterisation, never the item_type label (a real deadline/penalty in the source still forces a FACT). Jason's approved slot×item_type matrix, 2026-06-08. APPLIED 2026-06-08 (read-back verified via verify-137.mjs: 6 slots loosened, reg/directive + date/scope unchanged). |
| 138 | 138_reg_only_authority_floor.sql | Migration 138: validate_item_provenance criterion-3 authority floor (source_tier_at_grounding IN (1,2)) becomes ITEM_TYPE-SCOPED — bites ONLY on the regulatory family (regulation/directive/standard/guidance/framework); non-reg types are EXEMPT (named exemption, REVISIT — per-type non-reg floor deferred to the research/tech calibration spec). F1 fake-certification fix (Jason 2026-06-11, Option B): the constant source_tier_at_grounding=2 stamp was masking that the floor was regulatory-calibrated but applied uniformly. Criteria 1/2/4/5/6 byte-identical to migration 121. Ships WITH the A6 corpus revalidation (status-is-a-cache rule); 30 reg flagships flipped verified→quarantined (grounded in secondary sources, not primary legal text → Phase 2 re-ground). APPLIED 2026-06-11. |
| 139 | 139_close_quarantine_flags_on_verify.sql | Migration 139 (Stage B / F5): set_provenance_status trigger gains a CLOSE-ON-VERIFY branch — when validate() recommends 'verified', it resolves any OPEN trigger-created data_quality integrity_flags row for that item (status→resolved, resolved_by='set_provenance_status_trigger'). Fixes the flag surface accreting stale open quarantine flags on items that later recovered (every re-ground / the A6 30-flip revalidation flips dozens of statuses). One-time backfill closed the stale ones already open on currently-verified items (301 resolved; 0 stale remain). Function otherwise byte-identical to 115. APPLIED 2026-06-12. |
| 140 | 140_attention_counts_platform_flags.sql | Migration 140 (admin flag a): admin_attention_counts() (migration 036) gains column platform_integrity_flags_open = COUNT of platform integrity_flags (migration 048) rows with status IN ('open','in_review'), added into total, so the admin Issues Queue + sidebar red-dot stop reading blind to the platform quarantine backlog (reported 3 per-brief while 523 platform flags sat open+unsurfaced, 2026-06-15). DROP+CREATE in one txn (RETURNS TABLE column add changes return type; CREATE OR REPLACE cannot). Existing 7 columns byte-identical; route/hook/IssuesQueue updated in the same change (targetTab platform-integrity-flags). STABLE/read-only, no data mutation. APPLIED 2026-06-15. |
| 141 | 141_per_type_authority_floor.sql | Migration 141 (Stage D1): validate_item_provenance criterion-3 authority floor becomes PER-ITEM-TYPE (v_floor_max) — reg family ≤T2 (unchanged from 138), research_finding ≤T4, technology/innovation/tool ≤T5 (forward default, 0 live items, REVISIT); market_signal/initiative/regional_data EXEMPT (named exemptions registered as invariant SC-8 with REVISIT — corroboration-count gate + per-section regional floor are UNBUILT, codifying them now would be the migration-113 pattern). Closes the migration-138 blanket non-reg exemption with calibrated, data-grounded per-type floors (research core sits at T3 per source-credibility-model; ≤T4 preserves it + one margin tier). Criteria 1/2/4/5/6 byte-identical to 138. Ships WITH corpus revalidation (status-is-a-cache): 2 research_finding items flipped verified→quarantined. STABLE/read-only. APPLIED 2026-06-15. |
| 142 | 142_legal_line_guard.sql | Migration 142 (WS1 / tier→label floor-router): validate_item_provenance criterion-4 LEGAL-LINE GUARD — an ANALYSIS claim asserting a present-tense enacted-law REQUIREMENT (c_legal_req_re) that is NOT forward-framed (c_forward_re) fails new reason legal_claim_mislabeled_analysis, so the credible-non-binding relabel path cannot launder a binding legal requirement out of the FACT/Legal lane. Strict-on-ambiguity: ambiguous tense routes to the stricter FACT/Legal path, never the early-signal escape. Criteria 1/2/3/5/6 byte-identical to 141. Verified 5/5 guard cases + blast-radius 0/538 no-flip. APPLIED 2026-06-25. |
| 143 | 143_label_variant_tolerance.sql | Migration 143 (WS1 / tier→label floor-router): criterion-4 ANALYSIS label match becomes VARIANT-TOLERANT yet strict-on-missing — c_label_re matches the four relabel tokens (per the workspace's reading / analytical inference / industry interpretation / operational implication) with OPTIONAL markdown asterisks and an OPTIONAL parenthetical qualifier, fixing analysis_missing_label_syntax false-fails where the model emits "Operational implication:" without bold asterisks (4→0 on the enacted set). STRICT on a genuinely missing label (no base token → no match → legal-line guard 142 holds). Applied in BOTH the ANALYSIS check and the unlabeled_assertion exemption. Verified 7/7 regex cases + 15/15 no-flip. APPLIED 2026-06-25. |
| 144 | 144_scrape_cadence.sql | Migration 144 (global scrape-schedule control): system_state gains scrape_cadence ('off'|'weekly'|'monthly', default 'off' = the hold) + scrape_start_date (anchor = first run + recurrence phase) + CHECK constraint. SINGLE source of truth for WHEN the whole system scrapes — per-source update_frequency/next_scheduled_check cadence RETIRED (Option 1: whole system scrapes as a unit on the cadence day). global_processing_paused (016) KEPT as the independent emergency stop; isGloballyPaused()=cadence 'off' OR emergency; the worker window-gates via scrapeWindowOpen (scrape-schedule.ts). Additive (old code keeps reading the hold), live hold preserved. APPLIED 2026-06-28. |
| 145 | 145_provenance_floor_inline_derive.sql | Migration 145 (D1 floor render-derive): validate_item_provenance criterion-3 authority floor DERIVES the FACT tier INLINE from the claim's resolved source (section_claim_provenance.source_id → sources.COALESCE(tier_override, base_tier)) instead of reading the stored source_tier_at_grounding — base_tier-only + sanctioned override, never effective_tier (moat-pure), read live (drift-proof). Criteria 1/2/4/5 + source_span checks + legal-line guard + label-variant match BYTE-IDENTICAL to 143. Zero blast radius (proven read-only before apply: 0 drift on the source_id basis; 145 output == 143 output for all 658 items — the lone confirm-script "flip" was a stale-stored-status false positive, 143 quarantines it identically). claims-tier audit re-pointed to derivation-consistency (lane green). APPLIED 2026-06-29. |
| 147 | 147_sources_fetch_status.sql | Migration 147 (item 5b — unreadable-source flag): adds `sources.fetch_status` (TEXT, CHECK ok\|cdn_block\|soft_404\|blocked\|error) + `fetch_status_at` (TIMESTAMPTZ). SOURCE-level readability verdict written by the unified transport (fetchPrimaryWithFallback→detectRoadblock reason 'cdn_block'; fetch-quality 'blocked_cloudflare') so customer surfaces never display a source the pipeline could not read (the IEA/Cloudflare case). Dependent code (transport write + render gate) is merge/deploy-gated on this being live (the gate SELECTs the column). APPLIES TOGETHER WITH migration 146 on the operator DDL window (single supabase db push) — NOT independently. Reversible (DROP COLUMN x2). NOT YET APPLIED. |
| 148 | 148_surface_counts.sql | Migration 148 (count-integrity build 2026-07-02): single classification + counting SoT for the customer surface counts. `surface_of(item_type, domain)` maps to regulations/market/operations/research/uncategorized — its CASE is GENERATED from `src/lib/surface-of.mjs` SURFACE_RULES (vocab-drift guard enforces byte-equality, binding 3). `get_surface_counts(org, surface)` = verified-population count bundle for ONE surface (total_items header + by_priority/by_severity/by_band/by_status/by_jurisdiction label instances; superset of 069 shape, drop-in via getScopedWorkspaceAggregates fail-soft). `get_all_surface_counts(org)` = one-scan {verified,total} per surface + grand total for the dashboard rail (customer reads .verified, admin reads both; ruling 1). Override overlay = one LEFT JOIN; uncategorized = defect signal never rendered customer-side (binding 4). Closes 5 count leaks (rail-vs-aggregates verified filter, /research empty-scope 259 degrade, header-vs-cards dual derivation, MARKET vocab split, override JOIN-vs-second-query). Consumers fail soft pre-apply (fall back to prior RPCs). RIDES THE SAME supabase db push as 146+147. Reversible (DROP FUNCTION x3). NOT YET APPLIED. |

## Maintenance trigger

Any commit that adds or removes a migration MUST update this inventory. C3 consistency check (rule 014) enforces drift on push.

## Source files

- Migration files: `fsi-app/supabase/migrations/*.sql`
- Naming: `NNN_descriptive_name.sql` (3-digit zero-padded; F6 fitness function enforces)
