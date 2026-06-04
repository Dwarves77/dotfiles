# Supabase Cell Inventory — 2026-06-03 (READ-ONLY)

79 base tables. Every column, type, nullability. Triggers + row count + update cadence per table.

## admin_action_cooldowns  (1 rows)
- action_key `text` NOT NULL
- last_triggered_at `timestamp with time zone` NOT NULL
- triggered_by `uuid`
- metadata `jsonb`

## agent_run_searches  (1155 rows)
- id `uuid` NOT NULL
- agent_run_id `uuid`
- intelligence_item_id `uuid`
- search_query `text`
- result_url `text`
- result_title `text`
- result_index `integer`
- result_content_excerpt `text`
- searched_at `timestamp with time zone`

## agent_runs  (1007 rows)
- id `uuid` NOT NULL
- source_id `uuid`
- source_url `text`
- fetch_method `text`
- started_at `timestamp with time zone` NOT NULL
- ended_at `timestamp with time zone`
- duration_ms `integer`
- status `text` NOT NULL
- cost_usd_estimated `numeric` NOT NULL
- errors `jsonb` NOT NULL
- fetch_status `integer`
- fetch_html_bytes `bigint`
- fetch_text_bytes `bigint`
- fetch_render_ms `integer`
- raw_fetch_id `uuid`
- intelligence_item_id `uuid`
- intelligence_item_version_id `uuid`
- created_at `timestamp with time zone` NOT NULL

## briefings  (0 rows)
- id `integer` NOT NULL
- week_date `date` NOT NULL
- title `text`
- summary `text`
- content `jsonb` NOT NULL
- format `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- source_count `integer`
- item_count `integer`
- domains_covered `ARRAY`
- org_id `uuid`

## bulk_imports  (0 rows)
- id `uuid` NOT NULL
- imported_by `uuid` NOT NULL
- format `text` NOT NULL
- total_rows `integer` NOT NULL
- sources_inserted `integer` NOT NULL
- provisional_inserted `integer` NOT NULL
- rejected `integer` NOT NULL
- raw_input `text` NOT NULL
- preview_summary `jsonb` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## canonical_source_candidates  (370 rows)
- id `uuid` NOT NULL
- intelligence_item_id `uuid` NOT NULL
- current_source_id `uuid`
- current_source_url `text`
- issue_classification `text` NOT NULL
- candidate_url `text` NOT NULL
- candidate_title `text`
- candidate_publisher `text`
- confidence `text` NOT NULL
- rationale `text`
- verified `boolean` NOT NULL
- verified_status_code `integer`
- verified_content_excerpt `text`
- reviewed `boolean` NOT NULL
- decision `text` NOT NULL
- reviewer_id `uuid`
- reviewed_at `timestamp with time zone`
- reviewer_notes `text`
- promoted_to_source_id `uuid`
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL
- recommended_classification `jsonb`

## case_studies  (6 rows, triggers: case_studies_updated_at)
- id `uuid` NOT NULL
- title `text` NOT NULL
- submitter_id `uuid`
- organization `text`
- industry_segment `text`
- challenge `text` NOT NULL
- solution `text` NOT NULL
- measurable_outcome `text`
- timeline `text`
- cost_reference `text`
- source_attribution `text`
- source_tier `integer`
- region_tags `ARRAY`
- topic_tags `ARRAY`
- transport_mode_tags `ARRAY`
- vertical_tags `ARRAY`
- linked_regulation_ids `ARRAY`
- linked_vendor_ids `ARRAY`
- linked_technology_tags `ARRAY`
- linked_thread_id `uuid`
- peer_validation_count `integer`
- validation_status `text`
- created_at `timestamp with time zone`
- updated_at `timestamp with time zone`

## case_study_endorsements  (0 rows, triggers: case_study_validation_count_trigger)
- case_study_id `uuid` NOT NULL
- endorser_id `uuid` NOT NULL
- endorsement_type `text`
- created_at `timestamp with time zone`

## community_group_invitations  (0 rows)
- id `uuid` NOT NULL
- group_id `uuid` NOT NULL
- inviter_user_id `uuid`
- invitee_user_id `uuid` NOT NULL
- status `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## community_group_members  (0 rows, triggers: community_group_members_count_trigger)
- group_id `uuid` NOT NULL
- user_id `uuid` NOT NULL
- role `text` NOT NULL
- joined_at `timestamp with time zone` NOT NULL
- starred `boolean` NOT NULL
- muted `boolean` NOT NULL

## community_groups  (0 rows)
- id `uuid` NOT NULL
- name `text` NOT NULL
- slug `text` NOT NULL
- region `text` NOT NULL
- privacy `text` NOT NULL
- owner_user_id `uuid` NOT NULL
- description `text`
- member_count `integer` NOT NULL
- weekly_post_count `integer` NOT NULL
- last_active_at `timestamp with time zone` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## community_posts  (0 rows, triggers: community_posts_reply_count_trigger)
- id `uuid` NOT NULL
- group_id `uuid` NOT NULL
- parent_post_id `uuid`
- author_user_id `uuid`
- title `text`
- body `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- last_reply_at `timestamp with time zone`
- reply_count `integer` NOT NULL
- promoted_from_post_id `uuid`
- attribution `text`
- promoted_at `timestamp with time zone`
- promoted_to_item_id `uuid`
- referenced_intelligence_item_ids `ARRAY` NOT NULL

## community_topic_groups  (0 rows)
- topic_id `uuid` NOT NULL
- group_id `uuid` NOT NULL

## community_topics  (0 rows)
- id `uuid` NOT NULL
- owner_user_id `uuid` NOT NULL
- label `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## coverage_gaps  (2 rows)
- id `uuid` NOT NULL
- title `text` NOT NULL
- jurisdiction `text`
- sector_affinity `ARRAY` NOT NULL
- severity `text` NOT NULL
- description `text` NOT NULL
- suggested_action_label `text` NOT NULL
- suggested_action_href `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## forum_replies  (0 rows, triggers: forum_replies_updated_at, reply_count_trigger)
- id `uuid` NOT NULL
- thread_id `uuid` NOT NULL
- parent_reply_id `uuid`
- author_id `uuid`
- body `text` NOT NULL
- upvote_count `integer`
- is_accepted_answer `boolean`
- created_at `timestamp with time zone`
- updated_at `timestamp with time zone`

## forum_sections  (17 rows)
- id `uuid` NOT NULL
- name `text` NOT NULL
- slug `text` NOT NULL
- description `text`
- section_type `text`
- primary_region_tag `text`
- primary_topic_tag `text`
- features_enabled `ARRAY`
- is_public `boolean`
- minimum_membership_tier `text`
- sort_order `integer`
- thread_count `integer`
- created_at `timestamp with time zone`

## forum_threads  (0 rows, triggers: forum_threads_updated_at, section_thread_count_trigger)
- id `uuid` NOT NULL
- section_id `uuid`
- title `text` NOT NULL
- body `text`
- author_id `uuid`
- thread_type `text`
- topic_tags `ARRAY`
- region_tags `ARRAY`
- transport_mode_tags `ARRAY`
- vertical_tags `ARRAY`
- linked_intelligence_item_ids `ARRAY`
- linked_vendor_ids `ARRAY`
- linked_case_study_ids `ARRAY`
- linked_regulation_ids `ARRAY`
- is_pinned `boolean`
- is_locked `boolean`
- reply_count `integer`
- view_count `integer`
- upvote_count `integer`
- created_at `timestamp with time zone`
- updated_at `timestamp with time zone`

## ingest_rejections  (131 rows)
- id `uuid` NOT NULL
- raw_value `text` NOT NULL
- rejection_reason `text` NOT NULL
- source_url `text`
- source_id `uuid`
- ingest_attempted_at `timestamp with time zone` NOT NULL
- triaged_by `uuid`
- triaged_at `timestamp with time zone`
- triage_action `text`
- triage_notes `text`

## ingest_rejections_pre_phase5  (0 rows)
- id `uuid`
- raw_value `text`
- rejection_reason `text`
- source_url `text`
- source_id `uuid`
- ingest_attempted_at `timestamp with time zone`
- triaged_by `uuid`
- triaged_at `timestamp with time zone`
- triage_action `text`
- triage_notes `text`

## ingestion_control_log  (709 rows)
- id `uuid` NOT NULL
- source_id `uuid`
- action `text` NOT NULL
- actor `text` NOT NULL
- reason `text`
- created_at `timestamp with time zone` NOT NULL

## ingestion_state  (774 rows)
- source_id `uuid` NOT NULL
- auto_run_enabled `boolean` NOT NULL
- processing_paused `boolean` NOT NULL
- last_state_change_at `timestamp with time zone` NOT NULL
- last_state_change_reason `text`

## integrity_flags  (485 rows)
- id `uuid` NOT NULL
- category `text` NOT NULL
- subject_type `text` NOT NULL
- subject_ref `text` NOT NULL
- description `text` NOT NULL
- recommended_actions `jsonb` NOT NULL
- status `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- created_by `text` NOT NULL
- resolved_at `timestamp with time zone`
- resolved_by `text`
- resolution_note `text`

## intelligence_changes  (0 rows)
- id `uuid` NOT NULL
- item_id `uuid`
- detected_at `timestamp with time zone` NOT NULL
- change_type `text` NOT NULL
- change_severity `text` NOT NULL
- previous_value `jsonb`
- new_value `jsonb`
- change_summary `text`
- raw_diff `text`

## intelligence_item_citations  (750 rows)
- id `uuid` NOT NULL
- intelligence_item_id `uuid` NOT NULL
- source_id `uuid` NOT NULL
- detected_at `timestamp with time zone` NOT NULL
- origin `text` NOT NULL

## intelligence_item_sections  (1005 rows, triggers: set_provenance_status_sections_trg)
- id `uuid` NOT NULL
- item_id `uuid` NOT NULL
- section_key `text` NOT NULL
- section_order `integer` NOT NULL
- content_md `text` NOT NULL
- is_conditional `boolean` NOT NULL
- source_ids `ARRAY` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL

## intelligence_item_versions  (625 rows)
- id `uuid` NOT NULL
- intelligence_item_id `uuid` NOT NULL
- version_number `integer` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- created_by_run_id `uuid`
- previous_version_id `uuid`
- full_brief `text`
- severity `text`
- priority `text`
- urgency_tier `text`
- format_type `text`
- topic_tags `jsonb` NOT NULL
- operational_scenario_tags `jsonb` NOT NULL
- compliance_object_tags `jsonb` NOT NULL
- related_items `jsonb` NOT NULL
- intersection_summary `text`
- sources_used `ARRAY` NOT NULL
- last_regenerated_at `timestamp with time zone`
- regeneration_skill_version `text`

## intelligence_items  (657 rows, triggers: set_provenance_status_trg, intelligence_items_updated_at, trg_intelligence_items_integrity_flag, stamp_prov_origin_trg, guard_provenance_flip_trg, intelligence_items_version_snapshot, trg_intelligence_items_normalize_jurisdictions)
- id `uuid` NOT NULL
- legacy_id `text`
- title `text` NOT NULL
- summary `text` NOT NULL
- what_is_it `text` NOT NULL
- why_matters `text` NOT NULL
- key_data `ARRAY` NOT NULL
- operational_impact `text` NOT NULL
- open_questions `ARRAY` NOT NULL
- tags `ARRAY` NOT NULL
- domain `integer` NOT NULL
- category `text`
- item_type `text` NOT NULL
- source_id `uuid`
- source_url `text` NOT NULL
- jurisdictions `ARRAY` NOT NULL
- transport_modes `ARRAY` NOT NULL
- verticals `ARRAY` NOT NULL
- status `text` NOT NULL
- severity `text`
- confidence `text` NOT NULL
- priority `text` NOT NULL
- reasoning `text` NOT NULL
- entry_into_force `date`
- compliance_deadline `date`
- next_review_date `date`
- added_date `date` NOT NULL
- last_verified `timestamp with time zone`
- is_archived `boolean` NOT NULL
- archive_reason `text`
- archive_note `text`
- archived_date `date`
- replaced_by `uuid`
- version_history `jsonb` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL
- linked_forum_thread_ids `ARRAY`
- linked_vendor_ids `ARRAY`
- linked_case_study_ids `ARRAY`
- linked_regulation_ids `ARRAY`
- region_tags `ARRAY`
- topic_tags `ARRAY`
- vertical_tags `ARRAY`
- full_brief `text`
- urgency_tier `text`
- format_type `text`
- last_regenerated_at `timestamp with time zone`
- regeneration_skill_version `text`
- sources_used `ARRAY`
- operational_scenario_tags `ARRAY`
- compliance_object_tags `ARRAY`
- related_items `ARRAY`
- intersection_summary `text`
- jurisdiction_iso `ARRAY`
- agent_integrity_flag `boolean` NOT NULL
- agent_integrity_phrase `text`
- agent_integrity_flagged_at `timestamp with time zone`
- agent_integrity_resolved_at `timestamp with time zone`
- agent_integrity_resolved_by `uuid`
- pipeline_stage `text`
- hidden_reason `text`
- instrument_type `text`
- instrument_identifier `text`
- signal_band `text`
- theme `text`
- trajectory_points `jsonb`
- what_it_changes `text`
- does_not_resolve `text`
- conversion_trigger `text`
- cross_references `text`
- provenance_status `USER-DEFINED` NOT NULL
- provenance_verified_at `timestamp with time zone`

## intelligence_items_domain_backfill_audit  (212 rows)
- id `uuid` NOT NULL
- old_domain `integer` NOT NULL
- proposed_domain `integer` NOT NULL
- item_type `text` NOT NULL
- source_id `uuid`
- source_category `text`
- source_role `text`
- source_name `text`
- rule_branch `text` NOT NULL
- certainty `text` NOT NULL
- captured_at `timestamp with time zone` NOT NULL

## intelligence_items_pre_phase5  (655 rows)
- id `uuid`
- legacy_id `text`
- title `text`
- summary `text`
- what_is_it `text`
- why_matters `text`
- key_data `ARRAY`
- operational_impact `text`
- open_questions `ARRAY`
- tags `ARRAY`
- domain `integer`
- category `text`
- item_type `text`
- source_id `uuid`
- source_url `text`
- jurisdictions `ARRAY`
- transport_modes `ARRAY`
- verticals `ARRAY`
- status `text`
- severity `text`
- confidence `text`
- priority `text`
- reasoning `text`
- entry_into_force `date`
- compliance_deadline `date`
- next_review_date `date`
- added_date `date`
- last_verified `timestamp with time zone`
- is_archived `boolean`
- archive_reason `text`
- archive_note `text`
- archived_date `date`
- replaced_by `uuid`
- version_history `jsonb`
- created_at `timestamp with time zone`
- updated_at `timestamp with time zone`
- linked_forum_thread_ids `ARRAY`
- linked_vendor_ids `ARRAY`
- linked_case_study_ids `ARRAY`
- linked_regulation_ids `ARRAY`
- region_tags `ARRAY`
- topic_tags `ARRAY`
- vertical_tags `ARRAY`
- full_brief `text`
- urgency_tier `text`
- format_type `text`
- last_regenerated_at `timestamp with time zone`
- regeneration_skill_version `text`
- sources_used `ARRAY`
- operational_scenario_tags `ARRAY`
- compliance_object_tags `ARRAY`
- related_items `ARRAY`
- intersection_summary `text`
- jurisdiction_iso `ARRAY`
- agent_integrity_flag `boolean`
- agent_integrity_phrase `text`
- agent_integrity_flagged_at `timestamp with time zone`
- agent_integrity_resolved_at `timestamp with time zone`
- agent_integrity_resolved_by `uuid`
- pipeline_stage `text`
- hidden_reason `text`
- instrument_type `text`
- instrument_identifier `text`

## intelligence_summaries  (2310 rows)
- id `uuid` NOT NULL
- item_id `uuid`
- sector `text` NOT NULL
- summary `text` NOT NULL
- urgency_score `numeric`
- generated_at `timestamp with time zone` NOT NULL
- model_version `text`

## item_changelog  (9 rows)
- id `uuid` NOT NULL
- item_id `uuid` NOT NULL
- change_date `date` NOT NULL
- change_type `text` NOT NULL
- field `text` NOT NULL
- previous_value `text` NOT NULL
- new_value `text` NOT NULL
- impact `text`
- impact_level `text`
- detected_by `text`
- created_at `timestamp with time zone` NOT NULL

## item_cross_references  (49 rows)
- id `uuid` NOT NULL
- source_item_id `uuid` NOT NULL
- target_item_id `uuid` NOT NULL
- relationship `text` NOT NULL

## item_disputes  (7 rows)
- id `uuid` NOT NULL
- item_id `uuid` NOT NULL
- is_active `boolean` NOT NULL
- note `text` NOT NULL
- disputing_sources `jsonb` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- resolved_at `timestamp with time zone`

## item_supersessions  (11 rows)
- id `uuid` NOT NULL
- old_item_id `uuid` NOT NULL
- new_item_id `uuid` NOT NULL
- supersession_date `date` NOT NULL
- severity `text` NOT NULL
- note `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## item_supersessions_pre_phase5  (5 rows)
- id `uuid`
- old_item_id `uuid`
- new_item_id `uuid`
- supersession_date `date`
- severity `text`
- note `text`
- created_at `timestamp with time zone`

## item_timelines  (107 rows)
- id `uuid` NOT NULL
- item_id `uuid` NOT NULL
- milestone_date `date` NOT NULL
- label `text` NOT NULL
- is_completed `boolean` NOT NULL
- sort_order `integer` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## item_type_required_slots  (20 rows)
- id `uuid` NOT NULL
- item_type `text` NOT NULL
- slot_key `text` NOT NULL
- description `text`
- created_at `timestamp with time zone` NOT NULL

## moderation_reports  (0 rows)
- id `uuid` NOT NULL
- target_kind `text` NOT NULL
- target_id `uuid` NOT NULL
- reporter_user_id `uuid`
- reason `text`
- status `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- resolved_at `timestamp with time zone`
- resolved_by_user_id `uuid`

## monitoring_queue  (507 rows)
- id `uuid` NOT NULL
- source_id `uuid` NOT NULL
- item_id `uuid`
- scheduled_check `timestamp with time zone` NOT NULL
- priority `text` NOT NULL
- last_result `text`
- change_detected `boolean` NOT NULL
- checked_at `timestamp with time zone`
- error_message `text`
- created_at `timestamp with time zone` NOT NULL

## notification_deliveries  (0 rows)
- id `uuid` NOT NULL
- event_id `uuid`
- user_id `uuid`
- channel `text`
- status `text`
- sent_at `timestamp with time zone`
- read_at `timestamp with time zone`

## notification_events  (0 rows)
- id `uuid` NOT NULL
- event_type `text` NOT NULL
- source_table `text` NOT NULL
- source_id `uuid` NOT NULL
- payload `jsonb`
- dispatched_at `timestamp with time zone`
- created_at `timestamp with time zone`

## notification_preferences  (0 rows, triggers: notification_preferences_updated_at)
- user_id `uuid` NOT NULL
- enabled `boolean` NOT NULL
- on_mention `boolean` NOT NULL
- on_reply_in_my_threads `boolean` NOT NULL
- on_new_post_in_joined_groups `boolean` NOT NULL
- on_invite `boolean` NOT NULL
- on_promote `boolean` NOT NULL
- channels `ARRAY` NOT NULL
- updated_at `timestamp with time zone` NOT NULL

## notification_subscriptions  (0 rows)
- id `uuid` NOT NULL
- user_id `uuid`
- subscription_type `text` NOT NULL
- target_id `uuid`
- target_tag `text`
- channels `ARRAY`
- created_at `timestamp with time zone`

## notifications  (0 rows)
- id `uuid` NOT NULL
- user_id `uuid` NOT NULL
- kind `text` NOT NULL
- payload `jsonb` NOT NULL
- read_at `timestamp with time zone`
- created_at `timestamp with time zone` NOT NULL

## org_invitations  (0 rows)
- id `uuid` NOT NULL
- org_id `uuid` NOT NULL
- invited_email `text` NOT NULL
- invited_by_user_id `uuid` NOT NULL
- proposed_role `text` NOT NULL
- token `text` NOT NULL
- status `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- expires_at `timestamp with time zone` NOT NULL
- accepted_at `timestamp with time zone`
- accepted_by_user_id `uuid`
- declined_at `timestamp with time zone`
- revoked_at `timestamp with time zone`
- revoked_by_user_id `uuid`

## org_memberships  (2 rows)
- id `uuid` NOT NULL
- org_id `uuid` NOT NULL
- user_id `uuid` NOT NULL
- role `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## org_watchlist  (0 rows)
- id `uuid` NOT NULL
- org_id `uuid` NOT NULL
- added_by_user_id `uuid`
- item_type `text` NOT NULL
- item_id `text` NOT NULL
- note `text`
- created_at `timestamp with time zone` NOT NULL

## organizations  (1 rows, triggers: organizations_updated_at)
- id `uuid` NOT NULL
- name `text` NOT NULL
- slug `text` NOT NULL
- plan `text` NOT NULL
- settings `jsonb` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL

## pending_first_fetch  (13 rows)
- id `uuid` NOT NULL
- source_id `uuid` NOT NULL
- queued_at `timestamp with time zone` NOT NULL
- status `text` NOT NULL
- attempt_count `integer` NOT NULL
- last_attempt_at `timestamp with time zone`
- last_error_text `text`

## pending_jurisdiction_review  (110 rows)
- id `uuid` NOT NULL
- intelligence_item_id `uuid` NOT NULL
- current_value `text` NOT NULL
- flagged_reason `text` NOT NULL
- source_column `text` NOT NULL
- flagged_at `timestamp with time zone` NOT NULL
- resolved_by `uuid`
- resolved_at `timestamp with time zone`
- resolution_value `text`

## pending_jurisdiction_review_pre_phase5  (107 rows)
- id `uuid`
- intelligence_item_id `uuid`
- current_value `text`
- flagged_reason `text`
- source_column `text`
- flagged_at `timestamp with time zone`
- resolved_by `uuid`
- resolved_at `timestamp with time zone`
- resolution_value `text`

## post_promotions  (0 rows)
- id `uuid` NOT NULL
- post_id `uuid` NOT NULL
- promoted_by `uuid` NOT NULL
- promotion_kind `text` NOT NULL
- staged_update_id `uuid`
- intelligence_item_id `uuid`
- notes `text`
- created_at `timestamp with time zone` NOT NULL

## profiles  (2 rows, triggers: profiles_mirror_to_user_profiles)
- id `uuid` NOT NULL
- email `text`
- display_name `text`
- role `text` NOT NULL
- settings `jsonb` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL
- full_name `text`
- headline `text`
- bio `text`
- avatar_url `text`
- organization `text`
- job_title `text`
- linkedin_url `text`
- linkedin_sub `text`
- linkedin_verified `boolean`
- linkedin_identity_verified `boolean`
- linkedin_workplace_verified `boolean`
- linkedin_verification_checked_at `timestamp with time zone`
- verification_tier `text`
- affiliation_type `text`
- region `ARRAY` NOT NULL
- topic_interests `ARRAY`
- membership_tier `text`
- contribution_score `integer`
- notification_preferences `jsonb`
- last_active_at `timestamp with time zone`
- timezone `text` NOT NULL
- sector_overrides `ARRAY` NOT NULL
- jurisdiction_overrides `ARRAY` NOT NULL
- transport_mode_overrides `ARRAY` NOT NULL
- verifier_status `text` NOT NULL
- verifier_since `timestamp with time zone`
- is_platform_admin `boolean` NOT NULL
- org_id `uuid`
- workspace_role `text`
- sector `ARRAY` NOT NULL

## provisional_sources  (497 rows)
- id `uuid` NOT NULL
- name `text` NOT NULL
- url `text` NOT NULL
- description `text` NOT NULL
- domain `integer`
- discovered_via `text` NOT NULL
- cited_by_source_id `uuid`
- cited_by_source_tier `integer`
- citation_count `integer` NOT NULL
- independent_citers `integer` NOT NULL
- citing_source_ids `ARRAY` NOT NULL
- highest_citing_tier `integer`
- provisional_tier `integer` NOT NULL
- recommended_tier `integer`
- accessibility_verified `boolean` NOT NULL
- publishes_structured_content `boolean` NOT NULL
- entity_identified `boolean` NOT NULL
- status `text` NOT NULL
- reviewer_notes `text` NOT NULL
- promoted_to_source_id `uuid`
- created_at `timestamp with time zone` NOT NULL
- reviewed_at `timestamp with time zone`
- recommended_classification `jsonb`
- discovered_for_jurisdiction `text`

## raw_fetches  (660 rows)
- id `uuid` NOT NULL
- source_id `uuid` NOT NULL
- content_hash `text` NOT NULL
- fetched_at `timestamp with time zone` NOT NULL
- file_path `text` NOT NULL
- http_status `integer`
- html_bytes `bigint` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## region_dimension_coverage  (30 rows)
- id `uuid` NOT NULL
- region_id `uuid` NOT NULL
- dimension `text` NOT NULL
- state `text` NOT NULL
- notes `text`
- fact_count `integer` NOT NULL
- last_reviewed_at `timestamp with time zone`
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL

## regional_data_facts  (75 rows, triggers: rdf_sync_coverage)
- id `uuid` NOT NULL
- region_id `uuid` NOT NULL
- dimension `text` NOT NULL
- fact_label `text` NOT NULL
- value `text` NOT NULL
- status `text`
- trend `text`
- source_id `uuid`
- source_note `text`
- last_updated `timestamp with time zone` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## regions  (5 rows)
- id `uuid` NOT NULL
- code `text` NOT NULL
- label `text` NOT NULL
- severity `text`
- iso_codes `ARRAY` NOT NULL
- operations_decisions `jsonb` NOT NULL
- display_order `integer` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL

## section_claim_provenance  (2476 rows, triggers: set_provenance_status_claims_trg)
- id `uuid` NOT NULL
- section_row_id `uuid`
- intelligence_item_id `uuid`
- claim_text `text` NOT NULL
- claim_kind `text` NOT NULL
- source_span `text`
- source_id `uuid`
- search_result_id `uuid`
- source_tier_at_grounding `integer`
- extracted_at `timestamp with time zone` NOT NULL
- verified_by `uuid`
- verified_at `timestamp with time zone`

## sector_contexts  (15 rows)
- sector `text` NOT NULL
- display_name `text` NOT NULL
- transport_modes `ARRAY` NOT NULL
- cargo_types `ARRAY` NOT NULL
- compliance_roles `ARRAY` NOT NULL
- synopsis_prompt `text` NOT NULL
- urgency_weights `jsonb` NOT NULL

## source_bias_tags  (2895 rows)
- id `uuid` NOT NULL
- source_id `uuid` NOT NULL
- dimension `text` NOT NULL
- tag `text` NOT NULL
- confidence `numeric`
- assignment_source `text` NOT NULL
- assigned_at `timestamp with time zone` NOT NULL

## source_citations  (0 rows)
- id `uuid` NOT NULL
- citing_source_id `uuid` NOT NULL
- cited_source_id `uuid` NOT NULL
- context `text` NOT NULL
- detected_at `timestamp with time zone` NOT NULL

## source_conflicts  (0 rows)
- id `uuid` NOT NULL
- item_id `uuid` NOT NULL
- source_a_id `uuid` NOT NULL
- source_b_id `uuid` NOT NULL
- source_a_tier `integer` NOT NULL
- source_b_tier `integer` NOT NULL
- source_a_claim `text` NOT NULL
- source_b_claim `text` NOT NULL
- field_in_dispute `text` NOT NULL
- status `text` NOT NULL
- resolution `text`
- resolution_note `text`
- resolved_by_source_id `uuid`
- resolved_by_human `text`
- opened_at `timestamp with time zone` NOT NULL
- resolved_at `timestamp with time zone`

## source_tier_opinions  (0 rows)
- id `uuid` NOT NULL
- target_source_id `uuid` NOT NULL
- opining_source_id `uuid`
- intelligence_item_id `uuid`
- opined_tier `integer` NOT NULL
- opinion_source `text` NOT NULL
- opined_at `timestamp with time zone` NOT NULL

## source_trust_events  (828 rows)
- id `uuid` NOT NULL
- source_id `uuid` NOT NULL
- event_type `text` NOT NULL
- details `jsonb` NOT NULL
- created_by `text` NOT NULL
- reviewer_id `text`
- created_at `timestamp with time zone` NOT NULL

## source_verifications  (1414 rows)
- id `uuid` NOT NULL
- candidate_url `text` NOT NULL
- candidate_name `text`
- jurisdiction_iso `ARRAY` NOT NULL
- language `text`
- ai_relevance_score `integer`
- ai_freight_score `integer`
- ai_trust_tier `text`
- verification_tier `text` NOT NULL
- action_taken `text` NOT NULL
- rejection_reason `text`
- verification_log `jsonb` NOT NULL
- resulting_source_id `uuid`
- resulting_provisional_id `uuid`
- created_at `timestamp with time zone` NOT NULL

## sources  (799 rows, triggers: sources_updated_at, sources_recompute_accuracy, sources_sync_tier_columns, trg_sources_enqueue_first_fetch_insert, trg_sources_enqueue_first_fetch_update)
- id `uuid` NOT NULL
- name `text` NOT NULL
- url `text` NOT NULL
- description `text` NOT NULL
- base_tier `integer` NOT NULL
- tier_at_creation `integer` NOT NULL
- intelligence_types `ARRAY` NOT NULL
- domains `ARRAY` NOT NULL
- jurisdictions `ARRAY` NOT NULL
- transport_modes `ARRAY` NOT NULL
- update_frequency `text` NOT NULL
- last_checked `timestamp with time zone`
- last_substantive_change `timestamp with time zone`
- next_scheduled_check `timestamp with time zone`
- status `text` NOT NULL
- paywalled `boolean` NOT NULL
- access_method `text` NOT NULL
- api_endpoint `text`
- rss_feed_url `text`
- confirmation_count `integer` NOT NULL
- conflict_count `integer` NOT NULL
- conflict_total `integer` NOT NULL
- accuracy_rate `numeric` NOT NULL
- avg_lead_time_days `numeric` NOT NULL
- lead_time_samples `integer` NOT NULL
- consecutive_accessible `integer` NOT NULL
- total_checks `integer` NOT NULL
- successful_checks `integer` NOT NULL
- accessibility_rate `numeric` NOT NULL
- last_accessible `timestamp with time zone`
- last_inaccessible `timestamp with time zone`
- independent_citers `integer` NOT NULL
- total_citations `integer` NOT NULL
- highest_citing_tier `integer`
- self_citation_count `integer` NOT NULL
- trust_score_overall `integer` NOT NULL
- trust_score_accuracy `numeric` NOT NULL
- trust_score_timeliness `numeric` NOT NULL
- trust_score_reliability `numeric` NOT NULL
- trust_score_citation `numeric` NOT NULL
- trust_score_computed_at `timestamp with time zone` NOT NULL
- tier_history `jsonb` NOT NULL
- cited_by `text`
- notes `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL
- topic_tags `ARRAY`
- vertical_tags `ARRAY`
- reliability_score `numeric`
- processing_paused `boolean` NOT NULL
- admin_only `boolean` NOT NULL
- jurisdiction_iso `ARRAY`
- spotchecked `boolean` NOT NULL
- spotchecked_by `uuid`
- spotchecked_at `timestamp with time zone`
- last_scanned `timestamp with time zone`
- last_content_hash `text`
- last_content_fetched_at `timestamp with time zone`
- last_intelligence_item_at `timestamp with time zone`
- auto_run_enabled `boolean` NOT NULL
- api_endpoint_url `text`
- api_auth_method `text`
- api_response_format `text`
- source_role `text`
- secondary_roles `ARRAY`
- scope_topics `ARRAY`
- scope_modes `ARRAY`
- scope_verticals `ARRAY`
- expected_output `jsonb`
- classification_assigned_at `timestamp with time zone`
- classification_observed_distribution `jsonb`
- observed_correctness_count `integer` NOT NULL
- last_observed_at `timestamp with time zone`
- classification_confidence `text`
- classification_rationale `text`
- category `text`
- effective_tier `integer`
- tier_override `integer`
- override_reason `text`
- override_date `timestamp with time zone`
- tier `integer`

## staged_updates  (24 rows)
- id `uuid` NOT NULL
- item_id `uuid`
- source_id `uuid`
- update_type `text` NOT NULL
- proposed_changes `jsonb` NOT NULL
- reason `text` NOT NULL
- source_url `text`
- confidence `text` NOT NULL
- status `text` NOT NULL
- reviewed_by `text`
- reviewed_at `timestamp with time zone`
- batch_id `text`
- created_at `timestamp with time zone` NOT NULL
- full_brief `text`
- jurisdiction_iso `ARRAY`
- materialization_error `text`
- materialized_at `timestamp with time zone`
- materialized_item_id `uuid`

## system_state  (1 rows)
- id `boolean` NOT NULL
- global_processing_paused `boolean` NOT NULL
- updated_at `timestamp with time zone` NOT NULL

## taxonomy_nodes  (38 rows)
- id `uuid` NOT NULL
- label `text` NOT NULL
- slug `text` NOT NULL
- node_type `text` NOT NULL
- path `USER-DEFINED` NOT NULL
- description `text`
- parent_id `uuid`
- sort_order `integer`
- created_at `timestamp with time zone`

## user_profiles  (1 rows, triggers: user_profiles_updated_at, user_profiles_mirror_to_profiles)
- user_id `uuid` NOT NULL
- name `text`
- headshot_url `text`
- bio `text`
- timezone `text` NOT NULL
- sectors `ARRAY` NOT NULL
- jurisdictions `ARRAY` NOT NULL
- transport_modes `ARRAY` NOT NULL
- verifier_status `text` NOT NULL
- verifier_since `timestamp with time zone`
- is_platform_admin `boolean` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL

## user_watchlist  (0 rows)
- id `uuid` NOT NULL
- user_id `uuid` NOT NULL
- org_id `uuid`
- item_type `text` NOT NULL
- item_id `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL

## vendor_endorsements  (0 rows, triggers: vendor_endorsement_count_trigger)
- id `uuid` NOT NULL
- vendor_id `uuid`
- endorser_id `uuid`
- endorsement_text `text`
- experience_context `text`
- created_at `timestamp with time zone`

## vendor_regulations  (0 rows)
- vendor_id `uuid` NOT NULL
- regulation_id `uuid` NOT NULL
- compliance_type `text`
- notes `text`

## vendor_technologies  (0 rows)
- vendor_id `uuid` NOT NULL
- taxonomy_node_id `uuid` NOT NULL

## vendors  (0 rows, triggers: vendors_updated_at)
- id `uuid` NOT NULL
- name `text` NOT NULL
- slug `text` NOT NULL
- description `text`
- company_website `text`
- company_size `text`
- hq_region `text`
- service_regions `ARRAY`
- founded_year `integer`
- logo_url `text`
- contact_name `text`
- contact_email `text`
- contact_phone `text`
- verification_status `text`
- peer_endorsement_count `integer`
- listing_tier `text`
- topic_tags `ARRAY`
- region_tags `ARRAY`
- transport_mode_tags `ARRAY`
- vertical_tags `ARRAY`
- created_at `timestamp with time zone`
- updated_at `timestamp with time zone`

## workspace_item_overrides  (3 rows, triggers: workspace_overrides_updated_at)
- id `uuid` NOT NULL
- org_id `uuid` NOT NULL
- item_id `uuid` NOT NULL
- priority_override `text`
- is_archived `boolean` NOT NULL
- archive_reason `text`
- archive_note `text`
- archived_at `timestamp with time zone`
- notes `text` NOT NULL
- workspace_tags `ARRAY` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL
- dismissed_at `timestamp with time zone`

## workspace_settings  (1 rows, triggers: workspace_settings_updated_at)
- id `uuid` NOT NULL
- org_id `uuid` NOT NULL
- sector_profile `ARRAY` NOT NULL
- jurisdiction_weights `jsonb`
- default_filters `jsonb` NOT NULL
- alert_config `jsonb` NOT NULL
- home_sections `jsonb` NOT NULL
- default_export_format `text` NOT NULL
- created_at `timestamp with time zone` NOT NULL
- updated_at `timestamp with time zone` NOT NULL
- notify_on_sector_activation `boolean` NOT NULL
- sectors_activation_signup_at `timestamp with time zone`

