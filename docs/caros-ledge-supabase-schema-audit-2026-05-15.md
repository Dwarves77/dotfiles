# Caro's Ledge Supabase schema audit, 2026-05-15

Companion to `caros-ledge-product-audit-2026-05-15.md` (v2). Read-only table-by-table inventory of the live Supabase database, mapped to the data engineering layers specified in v2 Section 6.

Live project queried 2026-05-15: `kwrsbpiseruzbfwjpvsp` via Supabase CLI `db query --linked` (Management API) and the JS client with service role. All counts, column lists, RLS policies, and FK references read directly from the production DB. Code references resolved against `fsi-app/src/`, `fsi-app/src/app/api/`, `fsi-app/supabase/seed/`, `fsi-app/supabase/migrations/`, and `fsi-app/scripts/`.

## Corrections (added 2026-05-15 post-multi-tenant-foundation deploy)

The multi-tenant foundation dispatch (PRs #114, #115, #116; migrations 075, 076, 077, all merged + applied 2026-05-15 21:05 UTC) corrected two facts in this audit:

1. **RPC count was 7 in the audit; live introspection found 10.** This audit names "the seven page DEFINER RPCs" at multiple points (lines 66, 793, 1038, 1145, 1225). The actual count is 10. The three additional `SECURITY DEFINER` RPCs taking `p_org_id` are: `_workspace_active_items` (PR #113 shared scope helper), `get_workspace_intelligence_aggregates_scoped`, `get_workspace_intelligence_slim`. Migration 077 hardened all 10, not 7. Wherever this doc says "seven" or "7", read "ten" or "10".

2. **The `profiles` vs `user_profiles` consolidation direction in this audit is wrong.** Lines 43, 556, 1080 frame `profiles` as superseded by `user_profiles` and recommend consolidating into `user_profiles`. The opposite is correct. All seven community FKs (`forum_threads.author_id`, `forum_replies.author_id`, `case_studies.submitter_id`, `case_study_endorsements.endorser_id`, `vendor_endorsements.endorser_id`, `notification_deliveries.user_id`, `notification_subscriptions.user_id`) target `profiles.id`, not `user_profiles`. Migration 075 went the right direction: kept `profiles` as canonical, set up dual-write triggers, and stages `user_profiles` for drop in Phase 3 (separate PR after one stable deploy cycle of 075). The "FK rewrite is non-trivial" claim at line 556 is wrong by construction; no FK repointing is needed because the FKs already target `profiles.id`. Phase 3 also needs to redistribute the OnboardingWizard's previously-phantom data capture (`pronouns`, `role`, `employer`, `region`, `work_email`) to the correct three-layer destinations (profiles / org_memberships / organizations / workspace_settings).

These corrections do NOT invalidate the rest of the audit. The structural findings (S1-S15 in v2 product audit, the per-table inventory, the migration registry corruption, the dead community layer, the frozen relational tables, the three storage shapes for change tracking) all stand. Only the two specific factual claims above were wrong. Future readers should weigh recommendations in this audit against these corrections, especially anything that derives from "seven RPCs" counting or that prescribes the wrong consolidation direction for `profiles`/`user_profiles`.

---

Document has six sections plus an appendix:

1. Executive summary
2. Per-table inventory (59 tables, two views)
3. Tables grouped by lifecycle
4. Section 6 gap map
5. Specific recommendations (add, remove, rename, columns, RLS, indexes, constraints)
6. Migration consolidation observations

---

## 1. Executive summary

### Inventory shape

- **59 base tables** in the `public` schema of the live DB.
- **2 views**: `provisional_sources_review`, `source_health_summary`.
- **140 functions** in `public` (most are pgcrypto/ltree/trigram extension functions; ~25 are app-level functions, of which 11 are `SECURITY DEFINER` RPCs invoked from page renderers).
- **31 triggers** (the load-bearing ones are jurisdiction normalization, version snapshot, and pending-first-fetch enqueue).
- **156 RLS policies** across 58 tables. RLS is **enabled on every base table** (zero tables with RLS disabled). `system_state` has zero policies but RLS enabled (effectively service-role only).
- **236 indexes** total.
- **76 foreign keys** total.
- **78 CHECK constraints**, **18 UNIQUE constraints**.
- **74 migration files** on disk (`001` through `074`, with `008`, `012`, `014`, `070` missing from the numbering on disk; live `schema_migrations` has gaps for `026-050` even though those tables exist; see Section 6 below).

### Tables by lifecycle

| Lifecycle | Count | Tables |
|---|---|---|
| **ACTIVE production backbone** (current writer + current reader) | 13 | `intelligence_items`, `sources`, `agent_runs`, `raw_fetches`, `ingestion_state`, `ingestion_control_log`, `monitoring_queue`, `pending_first_fetch`, `intelligence_item_versions`, `staged_updates`, `provisional_sources`, `canonical_source_candidates`, `source_verifications` |
| **ACTIVE workspace state** (single-tenant today, but read+written) | 6 | `organizations`, `org_memberships`, `user_profiles`, `workspace_settings`, `workspace_item_overrides`, `system_state` |
| **ACTIVE secondary** (read by current code, low population) | 6 | `coverage_gaps`, `taxonomy_nodes`, `sector_contexts`, `admin_action_cooldowns`, `source_trust_events`, `forum_sections` (seeded but not surfaced) |
| **FROZEN** (populated only by 2026-04 migration 010 backfill, no current writer) | 5 | `item_timelines` (107 rows), `item_changelog` (9), `item_disputes` (7), `item_cross_references` (49), `item_supersessions` (5) |
| **DEAD on the writer side** (table exists, code reads it, no writer ever populated it) | 6 | `briefings`, `intelligence_changes`, `bulk_imports`, `source_citations`, `source_conflicts`, `user_watchlist` |
| **DEAD on both sides** (table exists, no current code path reads or writes it) | 3 | `vendor_endorsements`, `vendor_regulations`, `vendor_technologies` |
| **DEAD/scaffold community layer** (entire community surface is unrendered) | 12 | `community_groups`, `community_group_members`, `community_group_invitations`, `community_topics`, `community_topic_groups`, `community_posts`, `post_promotions`, `forum_threads`, `forum_replies`, `notifications`, `notification_events`, `notification_preferences`, `notification_subscriptions`, `notification_deliveries`, `moderation_reports` (overlapping count; see Section 3) |
| **LEGACY/superseded** (table replaced by a later table, FK-only references, no active code) | 2 | `profiles` (superseded by `user_profiles`), `vendors`/`case_studies` (community-layer scaffold, no UI) |
| **PHANTOM in code, not in DB** | 1 | `integrity_flags` (defined in migrations 048+050 but absent from live DB; read by `src/lib/supabase-server.ts:1743`) |
| **PHANTOM columns referenced by renderer, not in any migration** | 7 | `intelligence_items.penalty_range`, `cost_mechanism`, `enforcement_body`, `legal_instrument`, `last_verified_date`, `action_owner`, `authority_level` |

### Population health

- 655 rows in `intelligence_items` (up from 644 quoted in v2 Section 1; 11 new rows in the gap).
- 794 rows in `sources`. **0/794 ever recorded a lead-time sample**; 0/794 have `avg_lead_time_days > 0`.
- 161/794 sources still classified by bulk default rationale (`tier N default`); 39/794 have null `classification_rationale`. 219/794 are LOW classification confidence, 122 MEDIUM, 414 HIGH, 39 NULL.
- `source_role` populated on 755/794 (95%), but only 11 distinct values used; vendor_corporate has 7 sources (the EcoVadis cluster), industry_data_provider 3.
- `intelligence_items` regenerated under B.2 contract: 162/655 (`last_regenerated_at IS NOT NULL`). `full_brief` non-null on 171/655 (26%). Phantom columns missing entirely; `compliance_deadline` 0/655, `next_review_date` 0/655, `entry_into_force` 23/655.
- Phantom-column verdict confirmed at the schema level: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='intelligence_items' AND column_name IN ('penalty_range','cost_mechanism','enforcement_body','legal_instrument','last_verified_date','action_owner','authority_level','source_publication_date','first_observed_at')` returns **zero rows**.
- Frozen tables confirmed: `item_changelog` last write 2026-04-05, `item_timelines` last write 2026-04-05, `item_disputes` last write 2026-04-05, `item_supersessions` last write 2026-03-02. `intelligence_item_versions` is current (last write 2026-05-11; trigger-driven, working).
- Multi-tenant tables effectively single-tenant: `organizations` 1, `org_memberships` 1, `user_profiles` 1, `workspace_settings` 1, `workspace_item_overrides` 1.

### Headline findings

1. **Two phantom failures**, not one. The product audit identified phantom columns (`penalty_range`, etc.) on `intelligence_items`. This audit additionally identifies a **phantom table**: `integrity_flags`. Defined in migrations 048 and 050, read by `supabase-server.ts:1743` (in the admin attention summary), absent from the live DB. The query silently returns zero rows because the table doesn't exist (PostgREST returns an error which the caller swallows or the count returns null). The admin "404 items need attention" leak the Chrome audit observed cannot reflect integrity flags because they have no place to live.
2. **`schema_migrations` registry is corrupt for migrations 026-050.** Live registry contains 001-007, 009-025, then jumps to 051. Migrations 027 (user_profiles), 028 (community_groups), 029 (community_group_members), 030 (community_posts), 031 (community_topics), 032 (notifications), 033 (jurisdiction_iso), 035 (agent_integrity_flags), 036 (admin_notifications_rpc), 037 (source_verification), 038 (bulk_import_audit), 039 (coverage_matrix_rpc), 040 (discovery_provenance), 041 (post_promotions), 042 (community_region_counts), 043 (security_advisor_fixes), 044 (integrity_flag_trigger), 045 (orphan_slugs), 046 (community_rls_recursion), 047 (workspace_intelligence_slim), 049 (perf_v2_indexes) all have their effects in the live DB (tables, columns, indexes exist) but no registry row. Migration 048 (integrity_flags table) and 050 (workflow_gap CHECK widening) appear NOT to have been applied. This means a future `supabase db push` from a fresh checkout will attempt to re-apply 026-050 against a DB that already has them, will fail on the `CREATE TABLE` statements (most are not idempotent), and will leave the DB in a half-rolled state. This is a deployment-blocking risk that lives upstream of any new schema work.
3. **Three storage shapes for the same change-tracking concern.** `intelligence_item_versions` is current (trigger-driven, 8 rows, 7 unique items, max v2). `item_changelog` is frozen at 2026-04-05 backfill (9 rows). `intelligence_items.version_history JSONB` column exists, NOT NULL, default `[]`, and is populated by zero current code path. The audit trail layer the Section 6.6 spec calls for has three competing implementations, two of which are inert.
4. **Five overlapping link mechanisms collapse to one canonical store needed.** `intelligence_items.related_items uuid[]` (74 items populated, agent-emitted), `item_cross_references` (49 rows, frozen at 2026-04-05), `intelligence_items.linked_regulation_ids/linked_vendor_ids/linked_case_study_ids/linked_forum_thread_ids` (all 0/655 populated, columns added by 007 community layer, written by no current code), `intelligence_items.intersection_summary text` + `related_items` covered by 074 row. Section 6.4 calls for one canonical `item_relationships` table.
5. **Three vocabularies for sources confirmed at the schema level.** `sources.scope_topics` (755/794 populated, framework 063), `sources.topic_tags` (310/794, community 007), `sources.intelligence_types` (783/794 NOT NULL, original 004). `scope_modes` (755) vs `transport_modes` (362). `scope_verticals` (755) vs `vertical_tags` (10). The schema preserves all three vocabularies; the v2 audit's 0% agreement finding is a direct consequence of three writer paths, three column families, no enforcement.
6. **Two competing tier semantics confirmed in the source registry.** Tier distribution: T1=378, T2=164, T3=116, T4=78, T5=37, T6=1, T7=20. Migration 063 framework expects vendor_corporate=T6 (we have only 1 row at T6 vs 7 vendor_corporate sources at T3-T5). Legacy 7-tier definition from `types/source.ts` describes the actual distribution. The schema column `tier` carries one number with two contradictory definitions, exactly as v2 S8 reports.
7. **Authorization gap on the seven page RPCs is in the schema.** `get_workspace_intelligence`, `get_workspace_intelligence_dashboard`, `get_workspace_intelligence_listings`, `get_workspace_intelligence_slim`, `get_workspace_intelligence_aggregates`, `get_workspace_intelligence_aggregates_scoped`, `get_market_intel_items`, `get_research_items`, `get_operations_items` are all `SECURITY DEFINER` and accept `p_org_id uuid` with **no `auth.uid()` membership check**. Anyone with anon-key access can call these RPCs with any UUID and read another tenant's items, workspace_notes, and workspace_tags. Single-tenant prod hides the leak; second tenant exposes it on day one.
8. **The `intelligence_items` table carries 61 columns**, several of which are mutually exclusive vocabularies, several of which are written by no path, several of which the renderer ignores. The table is the system's central artifact and also its largest source of vocabulary drift. Section 6.1 entity tables would split it into a canonical entity (regulation/organization/event) plus per-surface frames.
9. **Six tables exist for vendors/case-studies/forum that the entire UI ignores.** `vendors` (0 rows), `case_studies` (6 rows), `forum_threads` (0), `forum_replies` (0), `vendor_endorsements` (0), `vendor_regulations` (0), `vendor_technologies` (0), `case_study_endorsements` (0). Migration 007's "community layer" was scaffolded, then the four-page architecture was built without it, and the tables remain. They are not load-bearing for any current product surface.
10. **The notification stack (5 tables) is built and unused.** `notifications` (0), `notification_events` (0), `notification_preferences` (0), `notification_subscriptions` (0), `notification_deliveries` (0). The code that would write to them exists in `src/app/api/community/...` paths that the renderer never invokes. RLS policies are correctly scoped to `auth.uid()`; the chain is just not wired.

---

## 2. Per-table inventory

Tables ordered alphabetically. Each entry uses the template from the dispatch brief. "Section 6 mapping" identifies which v2 Section 6 sub-layer the table serves or should serve. Recommendations are KEEP_AS_IS, KEEP_AND_EXTEND, DEPRECATE, MERGE_INTO_OTHER, RENAME.

### public.admin_action_cooldowns

- **Status:** ACTIVE (read+write by admin code, just unpopulated currently)
- **Migration introduced:** `024_admin_action_cooldowns.sql`
- **Row count (live):** 0
- **Columns (4):** `action_key text PK`, `last_triggered_at timestamptz NOT NULL`, `triggered_by text NOT NULL`, `metadata jsonb`
- **Population pattern:** Written by admin throttle paths (e.g. notification dispatch cooldowns) when an admin action fires. Currently unpopulated because no admin actions have run.
- **Read pattern:** `src/app/api/admin/...` reads to gate repeat actions. Two refs in src, two in api.
- **RLS:** 1 policy. Service-role write; admin read.
- **Indexes:** 2 (PK + secondary on `last_triggered_at`).
- **Cross-references:** None (no FKs).
- **Section 6 mapping:** 6.10 (operator-facing data quality affordances; admin throttling).
- **Recommendation:** KEEP_AS_IS. Light, correct, just unused.

### public.agent_runs

- **Status:** ACTIVE (current writer at `/api/agent/run`, 1004 rows, last write 2026-05-11)
- **Migration introduced:** `057_agent_runs.sql`
- **Row count (live):** 1004
- **Columns (18):** `id`, `source_id` (FK→sources), `source_url`, `fetch_method`, `started_at`, `ended_at`, `duration_ms`, `status`, `cost_usd_estimated`, `errors jsonb`, `fetch_status`, `fetch_html_bytes`, `fetch_text_bytes`, `fetch_render_ms`, `raw_fetch_id` (FK→raw_fetches), `intelligence_item_id` (FK→intelligence_items), `intelligence_item_version_id` (FK→intelligence_item_versions), `created_at`
- **Population pattern:** Every `/api/agent/run` execution writes one row with cost, fetch metrics, item produced.
- **Read pattern:** `src/app/admin/runs` reads runs for ops dashboard. Two src refs, one api ref.
- **RLS:** 1 policy. Service-role + admin read.
- **Indexes:** 5 (id PK, source_id, started_at, status, created_at).
- **Cross-references:** Outbound to `intelligence_items`, `intelligence_item_versions`, `raw_fetches`, `sources`. Inbound none.
- **Section 6 mapping:** 6.5 (structured fact extraction provenance; agent run is the writer of structured columns), 6.10 (operator-facing quality: cost/duration tracking).
- **Recommendation:** KEEP_AND_EXTEND. Add columns for classifier path (deterministic vs LLM), confidence per extracted fact, span provenance pointers (Section 6.5).

### public.briefings

- **Status:** DEAD (table created in 001, schema-shaped for weekly briefings, written by zero current code path; 0 rows)
- **Migration introduced:** `001_schema.sql` (altered by 006, 007, 010)
- **Row count (live):** 0
- **Columns (11):** `id`, `week_date`, `title`, `summary`, `content`, `format`, `created_at`, `source_count`, `item_count`, `domains_covered`, `org_id` (FK→organizations)
- **Population pattern:** None. The "weekly briefing" product never shipped.
- **Read pattern:** Zero src refs, zero api refs. Migration-only.
- **RLS:** 2 policies (org-scoped read, service-role write).
- **Indexes:** 2.
- **Cross-references:** Outbound `organizations.id`. Inbound none.
- **Section 6 mapping:** Could serve a future Section 6.9 cross-page framing as a curated weekly digest, but the current product has no weekly-digest surface.
- **Recommendation:** DEPRECATE. No writer, no reader, no UI surface. If the digest concept returns it should be redesigned around the entity layer (6.1) and per-surface frames (6.9), not this 2026-04 schema.

### public.bulk_imports

- **Status:** PARTIAL (1 src ref, 1 api ref, 0 rows; admin import endpoint exists, has not run)
- **Migration introduced:** `038_bulk_import_audit.sql`
- **Row count (live):** 0
- **Columns (10):** `id`, `imported_by` (text, not FK), `format`, `total_rows`, `sources_inserted`, `provisional_inserted`, `rejected`, `raw_input jsonb`, `preview_summary jsonb`, `created_at`
- **Population pattern:** `/api/admin/sources/bulk-import` writes one row per import.
- **Read pattern:** `/admin/sources/bulk-import` audit log surface (1 src, 1 api).
- **RLS:** 1 policy. Service-role write; admin read.
- **Indexes:** 3.
- **Cross-references:** None.
- **Section 6 mapping:** 6.2 (source registry as a curated product; bulk import is one of the registry-onboarding entry points).
- **Recommendation:** KEEP_AS_IS. Audit table for an admin workflow that hasn't fired yet. Will populate when bulk import is used.

### public.canonical_source_candidates

- **Status:** ACTIVE (370 rows; populated by canonical-source discovery scripts; read by admin review queue)
- **Migration introduced:** `021_canonical_source_candidates.sql` (altered by 022, 040, 045)
- **Row count (live):** 370
- **Columns (22):** `id`, `intelligence_item_id` (FK), `current_source_id` (FK→sources), `current_source_url`, `issue_classification`, `candidate_url`, `candidate_title`, `candidate_publisher`, `confidence`, `rationale`, `verified bool`, `verified_status_code int`, `verified_content_excerpt text`, `reviewed bool`, `decision`, `reviewer_id uuid`, `reviewed_at`, `reviewer_notes`, `promoted_to_source_id` (FK→sources), `created_at`, `updated_at`, `recommended_classification jsonb` (added by 022 cache)
- **Population pattern:** `scripts/canonical-source-discover.mjs` + agent runs identify candidate replacement sources for thin/wrong source attributions.
- **Read pattern:** `/admin/source-quality/candidates` reviews. 5 src refs, 5 api refs.
- **RLS:** 2 policies.
- **Indexes:** 4 (PK, intelligence_item_id, status partial, reviewed partial).
- **Cross-references:** Out to `sources` (current + promoted_to), `intelligence_items`. Inbound none.
- **Section 6 mapping:** 6.2 (source registry curation; candidate-discovery is the source-onboarding workflow). 6.10 (operator-facing quality: source-correction queue).
- **Recommendation:** KEEP_AND_EXTEND. This is the closest the schema gets to the Section 6.2 source-onboarding workflow. Extend with: source_role/scope classification on promotion, confidence floor enforcement, observed-correctness tracking after promotion. The `recommended_classification jsonb` column is the right shape.

### public.case_studies

- **Status:** PARTIAL/SCAFFOLD (6 rows seeded; community layer; not surfaced on any of the four operator pages)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 6
- **Columns (24):** id, title, submitter_id (FK→profiles), organization, industry_segment, challenge, solution, measurable_outcome, timeline, cost_reference, source_attribution, source_tier, region_tags[], topic_tags[], transport_mode_tags[], vertical_tags[], linked_regulation_ids[], linked_vendor_ids[], linked_technology_tags[], linked_thread_id (FK→forum_threads), peer_validation_count, validation_status, created_at, updated_at
- **Population pattern:** 6 rows seeded by `supabase/seed/seed-community.sql`.
- **Read pattern:** 1 src ref. No api refs.
- **RLS:** 3 policies.
- **Indexes:** 5.
- **Cross-references:** Out to `profiles`, `forum_threads`. Inbound from `case_study_endorsements`.
- **Section 6 mapping:** Would be a content-typology axis under 6.3 if /research surfaced case studies. Currently no surface reads them.
- **Recommendation:** DEPRECATE or merge into intelligence_items as `item_type='case_study'`. The parallel-table pattern adds complexity without surface payoff.

### public.case_study_endorsements

- **Status:** DEAD (0 rows, no surface, no writer)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 0
- **Columns (4):** id, case_study_id (FK), endorser_id (FK→profiles), created_at (inferred)
- **Read pattern:** Zero refs.
- **RLS:** 2 policies.
- **Recommendation:** DEPRECATE.

### public.community_group_invitations

- **Status:** SCAFFOLD (0 rows; community surface code exists but no users)
- **Migration introduced:** `029_community_group_members.sql`
- **Row count (live):** 0
- **Columns (6):** id, group_id (FK), inviter_user_id, invitee_user_id, status, created_at
- **Population pattern:** None (no users invite anyone).
- **Read pattern:** 9 src refs, 5 api refs (community surface is fully coded, just unused).
- **RLS:** 5 policies.
- **Indexes:** 4.
- **Cross-references:** Out to `community_groups`.
- **Section 6 mapping:** Out of scope for Section 6 (community is a separate concern from the four-page intelligence stack).
- **Recommendation:** KEEP_AS_IS if community ships eventually; otherwise DEPRECATE en bloc with the rest of the community layer.

### public.community_group_members

- **Status:** SCAFFOLD (0 rows, 13 src refs)
- **Migration introduced:** `029_community_group_members.sql`
- **Row count (live):** 0
- **Columns (6):** group_id, user_id, role, joined_at, starred, muted
- **RLS:** 5 policies (recently fixed for recursion in 046).
- **Indexes:** 4.
- **Recommendation:** KEEP_AS_IS or DEPRECATE depending on community decision.

### public.community_groups

- **Status:** SCAFFOLD (0 rows)
- **Migration introduced:** `028_community_groups.sql`
- **Row count (live):** 0
- **Columns (11):** id, name, slug, region, privacy, owner_user_id, description, member_count, weekly_post_count, last_active_at, created_at
- **RLS:** 5 policies.
- **Indexes:** 6.
- **Recommendation:** KEEP_AS_IS or DEPRECATE.

### public.community_posts

- **Status:** SCAFFOLD (0 rows, 6 src refs)
- **Migration introduced:** `030_community_posts.sql`
- **Row count (live):** 0
- **Columns (13):** id, group_id (FK), parent_post_id (FK self), author_user_id, title, body, created_at, last_reply_at, reply_count, promoted_from_post_id (FK self), attribution, promoted_at, promoted_to_item_id (FK→intelligence_items)
- **RLS:** 5 policies.
- **Cross-references:** Out to `community_groups`, `community_posts` (self), `intelligence_items` (promoted_to_item_id).
- **Section 6 mapping:** The promoted_to_item_id link is interesting; it suggests a community-to-intelligence promotion workflow that would, under 6.2, be one path into the source/item registry.
- **Recommendation:** KEEP_AS_IS or DEPRECATE.

### public.community_topic_groups

- **Status:** SCAFFOLD (0 rows, 0 src refs)
- **Migration introduced:** `031_community_topics.sql`
- **Row count (live):** 0
- **Columns (2):** topic_id (FK), group_id (FK)
- **Recommendation:** DEPRECATE if community is shelved.

### public.community_topics

- **Status:** SCAFFOLD (0 rows, 4 src refs)
- **Migration introduced:** `031_community_topics.sql`
- **Row count (live):** 0
- **Columns (4):** id, owner_user_id, label, created_at
- **Recommendation:** DEPRECATE if community is shelved.

### public.coverage_gaps

- **Status:** ACTIVE (2 rows; populated by hand for the operator dashboard)
- **Migration introduced:** `061_coverage_gaps.sql`
- **Row count (live):** 2
- **Columns (9):** id, title, jurisdiction, sector_affinity, severity, description, suggested_action_label, suggested_action_href, created_at
- **Population pattern:** Manually seeded for /admin coverage view.
- **Read pattern:** `supabase-server.ts:1664` reads. 1 src ref.
- **RLS:** 1 policy.
- **Section 6 mapping:** 6.10 (operator-facing data quality; coverage gaps surfaced in admin). Should be auto-populated by the `coverage_matrix()` RPC over time.
- **Recommendation:** KEEP_AND_EXTEND. Add a writer (the source-quality cron) so this is auto-populated rather than hand-seeded.

### public.forum_replies

- **Status:** SCAFFOLD (0 rows, 0 src refs)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 0
- **Columns (9):** id, thread_id (FK), parent_reply_id (FK self), author_id (FK→profiles), body, upvote_count, is_accepted_answer, created_at, updated_at
- **Recommendation:** DEPRECATE.

### public.forum_sections

- **Status:** PARTIAL (17 rows seeded; surface not rendered)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 17
- **Columns (13):** id, name, slug, description, section_type, primary_region_tag, primary_topic_tag, features_enabled, is_public, minimum_membership_tier, sort_order, thread_count, created_at
- **Population pattern:** Seeded by `seed-community.sql`. No subsequent writes.
- **Read pattern:** Zero src refs.
- **RLS:** 2 policies.
- **Recommendation:** DEPRECATE. Seeded data without a surface to render it.

### public.forum_threads

- **Status:** SCAFFOLD (0 rows, 1 src ref)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 0
- **Columns (21):** id, section_id (FK), title, body, author_id (FK→profiles), thread_type, topic_tags[], region_tags[], transport_mode_tags[], vertical_tags[], linked_intelligence_item_ids[], linked_vendor_ids[], linked_case_study_ids[], linked_regulation_ids[], is_pinned, is_locked, reply_count, view_count, upvote_count, created_at, updated_at
- **Recommendation:** DEPRECATE.

### public.ingestion_control_log

- **Status:** ACTIVE (718 rows, current writer)
- **Migration introduced:** `058_ingestion_control_log.sql`
- **Row count (live):** 718
- **Columns (6):** id, source_id (FK), action, actor, reason, created_at
- **Population pattern:** Written every time a source is paused, resumed, auto-run-toggled, throttled.
- **Read pattern:** Zero src refs (admin only via direct DB).
- **RLS:** 1 policy.
- **Indexes:** 3.
- **Section 6 mapping:** 6.10 (operator-facing quality: ingestion change log).
- **Recommendation:** KEEP_AS_IS. Healthy ops audit table.

### public.ingestion_state

- **Status:** ACTIVE (783 rows; one row per source for ingestion enabled/paused state)
- **Migration introduced:** `059_ingestion_state.sql`
- **Row count (live):** 783
- **Columns (5):** source_id (FK PK), auto_run_enabled, processing_paused, last_state_change_at, last_state_change_reason
- **Population pattern:** Mirror of `sources.auto_run_enabled` + `sources.processing_paused` with state-change history. 783/794 sources have an ingestion_state row (11 missing, presumably newly added).
- **Read pattern:** Zero src refs (used by ingestion worker via service role).
- **RLS:** 1 policy.
- **Indexes:** 2.
- **Section 6 mapping:** 6.2 (source registry SLA tracking; this is where the "is the source actively running" signal lives).
- **Recommendation:** KEEP_AND_EXTEND. Add columns for last_run_started, next_run_due, lead-time SLA target (Section 6.7).

### public.intelligence_changes

- **Status:** DEAD on writer (0 rows; 1 src ref)
- **Migration introduced:** `009_capture_undeclared_tables.sql` (no documented purpose; "capture undeclared tables" suggests it was discovered late and standardized)
- **Row count (live):** 0
- **Columns (9):** id, item_id (FK), detected_at, change_type, change_severity, previous_value, new_value, change_summary, raw_diff
- **Population pattern:** None. Intended for change detection, never wired.
- **Read pattern:** `supabase-server.ts:887` reads. Returns 0 rows on every call.
- **RLS:** 2 policies.
- **Section 6 mapping:** 6.6 (versioning and audit trail). The intent of this table overlaps with `item_changelog` (the migration 010 backfill) and `intelligence_item_versions` (the trigger-driven snapshot). Three storage shapes for the same concern.
- **Recommendation:** DEPRECATE or MERGE_INTO_OTHER. Keep `intelligence_item_versions` as the canonical change-tracking store (it's trigger-driven and current). Drop `intelligence_changes` and `item_changelog`.

### public.intelligence_item_versions

- **Status:** ACTIVE (8 rows, 7 unique items, max v=2; trigger-driven, last write 2026-05-11)
- **Migration introduced:** `053_intelligence_item_versions.sql`
- **Row count (live):** 8
- **Columns (19):** id, intelligence_item_id (FK), version_number, created_at, created_by_run_id, previous_version_id (FK self), full_brief, severity, priority, urgency_tier, format_type, topic_tags[], operational_scenario_tags[], compliance_object_tags[], related_items[], intersection_summary, sources_used[], last_regenerated_at, regeneration_skill_version
- **Population pattern:** Trigger `trg_intelligence_items_version_snapshot` fires on UPDATE, snapshots prior state.
- **Read pattern:** Zero src refs (the version history surface isn't built).
- **RLS:** 1 policy.
- **Indexes:** 4.
- **Section 6 mapping:** 6.6 (canonical version table per entity).
- **Recommendation:** KEEP_AND_EXTEND. This is the right table for Section 6.6. Extend reads: build the operator-visible change-log surface; build the diff renderer. Add columns to capture writer identity (Haiku vs Sonnet vs human vs migration) explicitly.

### public.intelligence_items

- **Status:** ACTIVE (655 rows; the central artifact)
- **Migration introduced:** `004_source_trust_framework.sql` (altered 9 times: 010, 015, 018, 020, 033, 034, 035, 053, 062, 063, 067)
- **Row count (live):** 655 (up from 644 in v2 audit). Earliest 2026-04-05, latest 2026-05-11.
- **Columns (61):** see Appendix A. Worth flagging:
  - `summary text NOT NULL`, `what_is_it text NOT NULL`, `why_matters text NOT NULL`, `operational_impact text NOT NULL` are all NOT NULL with empty-string allowed; the empty-string is the default writer fallback.
  - Three vocabulary axes: `verticals[]` (29/655 populated), `vertical_tags[]` (0/655). `transport_modes[]` (186/655). `region_tags[]` (0/655), `topic_tags[]` (607/655), `compliance_object_tags[]` (154), `operational_scenario_tags[]` (152).
  - Four phantom-link columns: `linked_forum_thread_ids[]`, `linked_vendor_ids[]`, `linked_case_study_ids[]`, `linked_regulation_ids[]` (all 0/655).
  - Date columns: `entry_into_force` 23/655, `compliance_deadline` 0/655, `next_review_date` 0/655, `added_date` NOT NULL.
  - B.2 columns: `full_brief` 171/655, `urgency_tier` 614/655, `format_type` non-null on regen, `last_regenerated_at` 162/655, `regeneration_skill_version`, `sources_used[]`.
  - Agent integrity: `agent_integrity_flag bool NOT NULL`, `agent_integrity_phrase`, `agent_integrity_flagged_at`, `agent_integrity_resolved_at`, `agent_integrity_resolved_by uuid`.
  - Pipeline: `pipeline_stage` 196/655, `hidden_reason` 3/655.
  - Self-FK: `replaced_by uuid` 0/655 populated.
  - **Phantom columns NOT IN SCHEMA**, but read by renderer: `penalty_range`, `cost_mechanism`, `enforcement_body`, `legal_instrument`, `last_verified_date`, `action_owner`, `authority_level`. Confirmed via `information_schema.columns` query.
  - **Phantom columns NOT IN SCHEMA**, called for by Section 6.7: `source_publication_date`, `first_observed_at`.
- **Population pattern:** Three writers: Sonnet 4.6 agent (`/api/agent/run` plus B.2 regenerator), Haiku classifier (cold-start, replaces empty fields), seed scripts (`supabase/seed/*.mjs`), staged_updates materializer.
- **Read pattern:** 23 src refs, 18 api refs, plus all DEFINER RPCs. The central artifact.
- **RLS:** 4 policies. Anon read is OPEN (no policy gating); authenticated read OPEN; service-role write. RLS is permissive because the product is single-tenant with read-anywhere semantics.
- **Indexes:** 25 (highest of any table).
- **Cross-references:** Out: `sources.id` via source_id, `intelligence_items.id` via replaced_by (self). Inbound: 21 distinct FKs from `agent_runs`, `canonical_source_candidates`, `community_posts.promoted_to_item_id`, `intelligence_changes`, `intelligence_item_versions`, `item_changelog`, `item_cross_references` (×2: source + target), `item_disputes`, `item_supersessions` (×2), `item_timelines`, `monitoring_queue`, `post_promotions`, `source_conflicts`, `staged_updates` (×2), `vendor_regulations`, `workspace_item_overrides`, `intelligence_summaries`.
- **Section 6 mapping:** This is the table Section 6.1 calls to split. 6.1 entity tables (`regulations`, `organizations`, `jurisdictions`, `transport_modes`, `verticals`, `events`) take over the canonical-entity role. `intelligence_items` becomes the per-surface frame store (Section 6.9) plus the structured-extraction store (Section 6.5). 6.7 (lead time) requires adding `source_publication_date` and `first_observed_at`. 6.5 requires adding `penalty_range`, `cost_mechanism`, `enforcement_body`, `legal_instrument`, `action_owner`, `authority_level`, `last_verified_date` — plus per-fact confidence columns and span-provenance JSONB columns.
- **Recommendation:** KEEP_AND_EXTEND with major surgery. Add the seven phantom columns (with confidence + span-provenance siblings). Deprecate `linked_*_ids[]` quartet (move to 6.4 canonical relationship store). Deprecate one of `verticals[]` / `vertical_tags[]` (pick verticals as canonical). Deprecate one of `region_tags[]` / `jurisdiction_iso[]` (jurisdiction_iso is canonical, region_tags 0/655 is dead). Add `source_publication_date`, `first_observed_at`. Add `quarantine_state` (Section 6.3). Tighten NOT NULL constraints on the empty-string-default columns (or drop NOT NULL and treat NULL as missing).

### public.intelligence_summaries

- **Status:** ACTIVE writer (2310 rows; per-sector summary cache)
- **Migration introduced:** `009_capture_undeclared_tables.sql`
- **Row count (live):** 2310 (this is the highest-row-count table in the DB)
- **Columns (7):** id, item_id (FK), sector text, summary text, urgency_score, generated_at, model_version
- **Population pattern:** Apparently auto-generated per-item per-sector summary (655 items × ~3-4 sectors). One seed-script ref. No current writer code in src.
- **Read pattern:** Zero src refs in `src/lib`. (The `intelligence_summaries` table appears to be a precomputed cache that the page renderers don't consult.)
- **RLS:** 3 policies.
- **Indexes:** 2.
- **Section 6 mapping:** 6.9 (cross-page framing). This is a precursor to per-surface framing: per-item, per-sector summary is a frame. The data exists but nothing reads it.
- **Recommendation:** KEEP_AND_EXTEND or REPLACE. Either wire reads (the per-sector frame becomes the default summary on /market or /operations when the user's sector matches), or replace with the Section 6.9 per-surface frame store. Verify whether this table is the right shape for surface-aware frames; if not, deprecate after 6.9 build.

### public.item_changelog

- **Status:** FROZEN (9 rows, last write 2026-04-05; populated only by migration 010 backfill)
- **Migration introduced:** `004_source_trust_framework.sql` (backfilled by 010)
- **Row count (live):** 9
- **Columns (11):** id, item_id (FK), change_date, change_type, field, previous_value, new_value, impact, impact_level, detected_by, created_at
- **Population pattern:** Migration 010 backfill from legacy data. No current writer.
- **Read pattern:** `supabase-server.ts:69, 1351` reads. 1 src ref.
- **RLS:** 2 policies.
- **Indexes:** 3.
- **Section 6 mapping:** 6.6 (versioning). Conflicts with `intelligence_item_versions` and `intelligence_changes`. Three storage shapes; pick one.
- **Recommendation:** DEPRECATE. Move to `intelligence_item_versions` as canonical. The frozen-backfill data can be migrated forward.

### public.item_cross_references

- **Status:** FROZEN (49 rows, all from migration 010 backfill)
- **Migration introduced:** `004_source_trust_framework.sql`
- **Row count (live):** 49 (all on legacy items)
- **Columns (4):** id, source_item_id (FK), target_item_id (FK), relationship
- **Population pattern:** Migration 010. Zero current writers.
- **Read pattern:** `supabase-server.ts:132, 1362` reads. 1 src ref.
- **RLS:** 3 policies.
- **Indexes:** 4.
- **Section 6 mapping:** 6.4 (knowledge graph). This is the bones of the canonical relationship store, but it has no writer and a flat enum for `relationship`. Section 6.4 calls for a richer typed store with confidence and provenance.
- **Recommendation:** KEEP_AND_EXTEND under a new name (`item_relationships`). Add `confidence numeric`, `provenance jsonb`, expand `relationship` enum to the Section 6.4 set (supersedes, implements, references, conflicts_with, depends_on, amends, related_to, sector_competitor). Add a relationship-extraction writer pass on every full_brief regeneration.

### public.item_disputes

- **Status:** FROZEN (7 rows, last write 2026-04-05)
- **Migration introduced:** `004_source_trust_framework.sql`
- **Row count (live):** 7
- **Columns (7):** id, item_id (FK), is_active, note, disputing_sources jsonb, created_at, resolved_at
- **Population pattern:** Migration 010 backfill.
- **Read pattern:** `supabase-server.ts:99, 1356` reads. 1 src ref.
- **RLS:** 3 policies.
- **Indexes:** 3.
- **Section 6 mapping:** 6.10 (operator-visible source conflicts; this is the data behind a "this fact is contested" badge on the card surface).
- **Recommendation:** KEEP_AND_EXTEND. Wire a writer in the agent pipeline for when two equal-tier sources contradict on a fact (Section 6.5 + 6.10). Expand `disputing_sources` JSONB to typed columns.

### public.item_supersessions

- **Status:** FROZEN (5 rows, last write 2026-03-02; oldest of the frozen set)
- **Migration introduced:** `004_source_trust_framework.sql` (backfilled by 010, 011)
- **Row count (live):** 5
- **Columns (7):** id, old_item_id (FK), new_item_id (FK), supersession_date, severity, note, created_at
- **Population pattern:** Migration 010+011 backfill. No current writer.
- **Read pattern:** `supabase-server.ts:150, 1368` reads. 1 src ref.
- **RLS:** 2 policies.
- **Indexes:** 1 (PK only — performance gap; supersession lookup requires seq scan).
- **Section 6 mapping:** 6.4 (relationship graph) — `supersedes` is one of the canonical relationship types.
- **Recommendation:** MERGE_INTO_OTHER. Deprecate, fold into `item_relationships` (the renamed `item_cross_references`).

### public.item_timelines

- **Status:** FROZEN (107 rows across 30 items, all from 2026-04-05 backfill)
- **Migration introduced:** `004_source_trust_framework.sql` (backfilled by 010)
- **Row count (live):** 107
- **Columns (7):** id, item_id (FK), milestone_date, label, is_completed, sort_order, created_at
- **Population pattern:** Migration 010. Zero current writers. The Norway fjords case study from v2 Section 5.3 exhibits this directly: real, dated, structured content but the Timeline tab returns "No timeline milestones recorded yet" because no current writer populates timelines.
- **Read pattern:** `supabase-server.ts:456, 1346` reads. Renders the Timeline tab on every detail page.
- **RLS:** 3 policies.
- **Indexes:** 3.
- **Section 6 mapping:** 6.5 (structured fact extraction; milestones are dated facts) + 6.4 (event edges from items to events).
- **Recommendation:** KEEP_AND_EXTEND. The schema is right; the writer is missing. Section 6.5's structured-extraction pass should emit timeline rows. Add `confidence numeric`, `provenance jsonb`, `event_type text` (announcement, publication, effective, enforcement, revision, supersession). Once 6.5 lights up, this populates current.

### public.moderation_reports

- **Status:** SCAFFOLD (0 rows, 2 src refs, 2 api refs)
- **Migration introduced:** `032_community_notifications_moderation.sql`
- **Row count (live):** 0
- **Columns (9):** id, target_kind, target_id, reporter_user_id, reason, status, created_at, resolved_at, resolved_by_user_id
- **RLS:** 4 policies.
- **Indexes:** 4.
- **Recommendation:** KEEP_AS_IS or DEPRECATE with the rest of the community layer.

### public.monitoring_queue

- **Status:** ACTIVE (478 rows; written by ingestion scheduler)
- **Migration introduced:** `004_source_trust_framework.sql`
- **Row count (live):** 478
- **Columns (10):** id, source_id (FK), item_id (FK, nullable), scheduled_check, priority, last_result, change_detected, checked_at, error_message, created_at
- **Population pattern:** Ingestion scheduler enqueues source checks.
- **Read pattern:** 1 src ref, 1 api ref (admin queue surface).
- **RLS:** 3 policies.
- **Indexes:** 4.
- **Section 6 mapping:** 6.7 (lead-time SLA: this is the per-source check schedule that drives lead-time computation).
- **Recommendation:** KEEP_AND_EXTEND. Add lead-time SLA target column (Section 6.7).

### public.notification_deliveries

- **Status:** SCAFFOLD (0 rows, 1 src ref, 1 api ref)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 0
- **Columns (7):** id, event_id (FK), user_id (FK→profiles), channel, status, sent_at, read_at
- **RLS:** 3 policies.
- **Indexes:** 3.
- **Recommendation:** KEEP_AS_IS or DEPRECATE.

### public.notification_events

- **Status:** SCAFFOLD (0 rows, 1 src ref, 1 api ref)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 0
- **Columns (7):** id, event_type, source_table, source_id, payload jsonb, dispatched_at, created_at
- **RLS:** 2 policies.
- **Indexes:** 3.
- **Recommendation:** KEEP_AS_IS or DEPRECATE.

### public.notification_preferences

- **Status:** SCAFFOLD (0 rows, 3 src refs)
- **Migration introduced:** `032_community_notifications_moderation.sql`
- **Row count (live):** 0
- **Columns (9):** user_id (PK), enabled, on_mention, on_reply_in_my_threads, on_new_post_in_joined_groups, on_invite, on_promote, channels jsonb, updated_at
- **RLS:** 5 policies.
- **Indexes:** 1.
- **Recommendation:** KEEP_AS_IS for community-related preferences; an intelligence-product equivalent (alert preferences for /regulations updates) would need its own table or a unified user_alert_preferences.

### public.notification_subscriptions

- **Status:** SCAFFOLD (0 rows, 1 src ref, 1 api ref)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 0
- **Columns (7):** id, user_id, subscription_type, target_id, target_tag, channels jsonb, created_at
- **RLS:** 3 policies.
- **Recommendation:** KEEP_AS_IS or DEPRECATE.

### public.notifications

- **Status:** SCAFFOLD (0 rows, 3 src refs, 3 api refs)
- **Migration introduced:** `032_community_notifications_moderation.sql`
- **Row count (live):** 0
- **Columns (6):** id, user_id, kind, payload jsonb, read_at, created_at
- **RLS:** 3 policies.
- **Recommendation:** KEEP_AS_IS or DEPRECATE.

### public.org_memberships

- **Status:** ACTIVE (1 row; the lone Dietl/Rockit owner)
- **Migration introduced:** `006_multi_tenant.sql`
- **Row count (live):** 1
- **Columns (5):** id, org_id (FK), user_id, role, created_at
- **Population pattern:** Hand-created.
- **Read pattern:** 16 src refs (all auth/membership checks).
- **RLS:** 4 policies (correctly scoped to auth.uid()).
- **Indexes:** 4.
- **Section 6 mapping:** 6.8 (multi-tenancy). This is the load-bearing membership table and is correctly shaped.
- **Recommendation:** KEEP_AS_IS. The Section 6.8 work is to make the page RPCs check membership against this table.

### public.organizations

- **Status:** ACTIVE (1 row; Dietl/Rockit)
- **Migration introduced:** `006_multi_tenant.sql`
- **Row count (live):** 1
- **Columns (7):** id, name, slug, plan, settings jsonb, created_at, updated_at
- **Population pattern:** Hand-seeded.
- **Read pattern:** 2 src refs.
- **RLS:** 3 policies.
- **Indexes:** 3.
- **Section 6 mapping:** 6.8 (multi-tenancy). 6.1 (master data — `organizations` should also be the canonical entity table for source-owning organizations like EcoVadis-the-company).
- **Recommendation:** KEEP_AND_EXTEND. Today serves only as the workspace tenant; should also be the entity table for source ownership (Section 6.1). Add `entity_type text` (workspace_tenant | source_owner | regulator | other) and the source-ownership tree the source registry needs.

### public.pending_first_fetch

- **Status:** ACTIVE (11 rows; queue for newly-added sources awaiting first fetch)
- **Migration introduced:** `065_pending_first_fetch_queue.sql`
- **Row count (live):** 11
- **Columns (7):** id, source_id (FK), queued_at, status, attempt_count, last_attempt_at, last_error_text
- **Population pattern:** Trigger `enqueue_pending_first_fetch` (DEFINER) on sources INSERT.
- **Read pattern:** 1 src ref, 1 api ref.
- **RLS:** 1 policy.
- **Indexes:** 3.
- **Section 6 mapping:** 6.2 (source onboarding workflow).
- **Recommendation:** KEEP_AND_EXTEND. Wire into a structured source-onboarding workflow (Section 6.2).

### public.post_promotions

- **Status:** SCAFFOLD (0 rows, 1 src ref, 1 api ref)
- **Migration introduced:** `041_post_promotions.sql`
- **Row count (live):** 0
- **Columns (8):** id, post_id (FK→community_posts), promoted_by, promotion_kind, staged_update_id (FK→staged_updates), intelligence_item_id (FK→intelligence_items), notes, created_at
- **Population pattern:** None (community surface unused).
- **RLS:** 2 policies.
- **Cross-references:** Out to community_posts, staged_updates, intelligence_items.
- **Recommendation:** KEEP_AS_IS or DEPRECATE.

### public.profiles

- **Status:** LEGACY (1 row; superseded by `user_profiles`)
- **Migration introduced:** `001_schema.sql` (altered by 027 LinkedIn columns and 028)
- **Row count (live):** 1
- **Columns (27):** id, email, display_name, role, settings jsonb, created_at, updated_at, full_name, headline, bio, avatar_url, organization, job_title, linkedin_url, linkedin_sub, linkedin_verified, linkedin_identity_verified, linkedin_workplace_verified, linkedin_verification_checked_at, verification_tier, affiliation_type, region, topic_interests[], membership_tier, contribution_score, notification_preferences jsonb, last_active_at
- **Population pattern:** Auth signup writes here; `user_profiles` (introduced 027) is the canonical product-level table.
- **Read pattern:** Zero src refs reading `profiles`. Many FKs reference it (case_studies.submitter_id, forum_*.author_id, vendor_endorsements.endorser_id, notification_*.user_id).
- **RLS:** 1 policy.
- **Indexes:** 3.
- **Section 6 mapping:** 6.8 (user identity). The split between `profiles` and `user_profiles` is a vestige; 027 was supposed to consolidate but only added a parallel table.
- **Recommendation:** RENAME or MERGE_INTO_OTHER. Either consolidate `profiles` + `user_profiles` into one canonical user table (the FK rewrite is non-trivial), or accept the split with `profiles` as the auth identity and `user_profiles` as the product profile (and document the contract).

### public.provisional_sources

- **Status:** ACTIVE (404 rows; discovery candidates awaiting promotion)
- **Migration introduced:** `004_source_trust_framework.sql` (altered by 015, 040, 045)
- **Row count (live):** 404
- **Columns (24):** id, name, url, description, domain, discovered_via, cited_by_source_id (FK→sources), cited_by_source_tier, citation_count, independent_citers, citing_source_ids[], highest_citing_tier, provisional_tier, recommended_tier, accessibility_verified, publishes_structured_content, entity_identified, status, reviewer_notes, promoted_to_source_id (FK→sources), created_at, reviewed_at, recommended_classification jsonb, discovered_for_jurisdiction
- **Population pattern:** Citation-discovery scripts and agent runs.
- **Read pattern:** 8 src refs, 5 api refs (admin review queue + discovery surface).
- **RLS:** 3 policies.
- **Indexes:** 5.
- **Section 6 mapping:** 6.2 (source onboarding workflow). Closest existing schema to a source-onboarding queue.
- **Recommendation:** KEEP_AND_EXTEND. Add structured classification fields on promotion (source_role, scope_topics, scope_modes, scope_verticals, expected_output) so promoted sources arrive in the registry with full classification, not bulk-default.

### public.provisional_sources_review (VIEW)

- **Status:** ACTIVE (24 columns; view over `provisional_sources` with cited_by_name and cited_by_tier_current joined)
- **Migration introduced:** `045_orphan_slugs_and_acf_dedup.sql` (likely)
- **Recommendation:** KEEP_AS_IS. View is a thin admin-side projection.

### public.raw_fetches

- **Status:** ACTIVE (668 rows; raw HTML capture for every fetched URL)
- **Migration introduced:** `052_raw_fetches.sql`
- **Row count (live):** 668
- **Columns (8):** id, source_id (FK), content_hash, fetched_at, file_path text, http_status, html_bytes, created_at
- **Population pattern:** Every fetch creates a raw_fetches row plus stores the HTML at `file_path` (Supabase Storage).
- **Read pattern:** 1 src ref, 1 api ref. Used by agent_runs for traceability.
- **RLS:** 1 policy.
- **Indexes:** 3.
- **Section 6 mapping:** 6.5 (source document is the immutable raw layer).
- **Recommendation:** KEEP_AND_EXTEND. Add `extracted_publication_date` (Section 6.7), `extracted_text text` for span-provenance pointers (Section 6.5).

### public.sector_contexts

- **Status:** ACTIVE (15 rows; per-sector synopsis prompts and config)
- **Migration introduced:** `009_capture_undeclared_tables.sql`
- **Row count (live):** 15
- **Columns (7):** sector PK, display_name, transport_modes[], cargo_types[], compliance_roles[], synopsis_prompt text, urgency_weights jsonb
- **Population pattern:** Seeded; no current writer.
- **Read pattern:** `supabase-server.ts:892` reads. 1 src ref.
- **RLS:** 2 policies.
- **Indexes:** 1.
- **Section 6 mapping:** 6.8 (sector ranking; the urgency_weights are sector-specific) + 6.9 (sector-specific frame templates use these prompts).
- **Recommendation:** KEEP_AND_EXTEND. This is the right shape for sector configuration; the data is seeded; it just isn't wired through to ranking. Expand `urgency_weights` to per-vertical and per-mode weights for Section 6.8 ranking.

### public.source_citations

- **Status:** DEAD (0 rows, 1 src ref, 1 api ref)
- **Migration introduced:** `004_source_trust_framework.sql`
- **Row count (live):** 0
- **Columns (5):** id, citing_source_id (FK), cited_source_id (FK), context, detected_at
- **Population pattern:** None. Intended for citation graph; never wired.
- **Read pattern:** Defined for the trust framework citation count. `sources.total_citations` is read instead.
- **RLS:** 2 policies.
- **Indexes:** 4.
- **Section 6 mapping:** 6.4 (knowledge graph: source-to-source citation edges).
- **Recommendation:** KEEP_AND_EXTEND. Wire a writer at agent ingest time when an extracted document references another source. Foundational for source-quality scoring (Section 6.2).

### public.source_conflicts

- **Status:** DEAD (0 rows, 1 src ref)
- **Migration introduced:** `004_source_trust_framework.sql`
- **Row count (live):** 0
- **Columns (16):** id, item_id (FK), source_a_id (FK), source_b_id (FK), source_a_tier, source_b_tier, source_a_claim, source_b_claim, field_in_dispute, status, resolution, resolution_note, resolved_by_source_id (FK), resolved_by_human, opened_at, resolved_at
- **Population pattern:** None. Intended for two-source contradiction tracking; no writer.
- **Read pattern:** 1 src ref via `supabase-server.ts:334`.
- **RLS:** 3 policies.
- **Indexes:** 5.
- **Section 6 mapping:** 6.10 (operator-visible source conflicts on a fact).
- **Recommendation:** KEEP_AND_EXTEND. Wire a writer when 6.5's structured extraction finds two sources that disagree on the same field for the same item. Right shape; needs the writer.

### public.source_health_summary (VIEW)

- **Status:** ACTIVE view (8 columns: tier, status, source_count, avg_trust_score, active_count, stale_count, inaccessible_count, overdue_count)
- **Recommendation:** KEEP_AS_IS. Materialized as a view; useful for admin dashboards.

### public.source_trust_events

- **Status:** ACTIVE (787 rows; events affecting a source's trust score)
- **Migration introduced:** `004_source_trust_framework.sql`
- **Row count (live):** 787
- **Columns (7):** id, source_id (FK), event_type, details jsonb, created_by, reviewer_id, created_at
- **Population pattern:** Written by source verification, accuracy revisions, conflict resolution.
- **Read pattern:** 5 src refs, 5 api refs.
- **RLS:** 2 policies.
- **Indexes:** 5.
- **Section 6 mapping:** 6.2 (source reliability scoring; this is the event log behind per-source quality).
- **Recommendation:** KEEP_AND_EXTEND. Add structured event types matching Section 6.2 SLA categories (item-reclassified, contradicted-by-higher-tier, scrape-failed-N-times, etc.).

### public.source_verifications

- **Status:** ACTIVE (1414 rows; AI-driven source verification queue)
- **Migration introduced:** `037_source_verification.sql`
- **Row count (live):** 1414 (second-highest row count after intelligence_summaries)
- **Columns (15):** id, candidate_url, candidate_name, jurisdiction_iso, language, ai_relevance_score, ai_freight_score, ai_trust_tier, verification_tier, action_taken, rejection_reason, verification_log jsonb, resulting_source_id (FK→sources), resulting_provisional_id (FK→provisional_sources), created_at
- **Population pattern:** Per-candidate verification runs; high write volume.
- **Read pattern:** 3 src refs, 2 api refs.
- **RLS:** 1 policy.
- **Indexes:** 5.
- **Section 6 mapping:** 6.2 (source onboarding workflow; this is the AI verifier's output log).
- **Recommendation:** KEEP_AND_EXTEND. Already serves Section 6.2 well; extend with the human-confirmation step the workflow needs.

### public.sources

- **Status:** ACTIVE (794 rows; the source registry)
- **Migration introduced:** `004_source_trust_framework.sql` (altered 12 times: 015, 016, 017, 033, 040, 043, 044, 045, 051, 054, 055, 056, 063, 067)
- **Row count (live):** 794
- **Columns (75):** see Appendix B. Worth flagging:
  - **Three vocabularies** for topic: `intelligence_types[] NOT NULL` (783), `topic_tags[]` (310), `scope_topics[]` (755). v2 audit: 0% agreement on dual-populated rows.
  - **Two vocabularies** for mode: `transport_modes[] NOT NULL` (362), `scope_modes[]` (755). 29% agreement.
  - **Two vocabularies** for vertical: `vertical_tags[]` (10), `scope_verticals[]` (755). 0% agreement.
  - **Two competing tier semantics** on `tier int NOT NULL`. T1=378, T2=164, T3=116, T4=78, T5=37, T6=1, T7=20. Migration 063 framework assigns vendor_corporate=T6 but live shows vendor_corporate at T3-T5 (legacy 7-tier semantics).
  - 5-axis classification: `source_role` (755/794), `secondary_roles[]` (0/794), `scope_topics`, `scope_modes`, `scope_verticals`, `expected_output jsonb` (755/794), `classification_confidence` (HIGH=414, MEDIUM=122, LOW=219, NULL=39), `classification_rationale` (161 = "tier N default", 39 = NULL).
  - Lead time: `avg_lead_time_days numeric NOT NULL` (0/794 > 0), `lead_time_samples int NOT NULL` (0/794 > 0).
  - Spotcheck: `spotchecked bool NOT NULL` (0/794 true), `spotchecked_by`, `spotchecked_at`.
  - Trust scoring: `trust_score_overall`, `trust_score_accuracy`, `trust_score_timeliness`, `trust_score_reliability`, `trust_score_citation`.
  - Scoreboard (054): `last_scanned`, `last_content_hash`, `last_content_fetched_at`, `last_intelligence_item_at`.
- **Population pattern:** Bulk-imported, agent-discovered, hand-curated. 161/794 still on bulk-default classification.
- **Read pattern:** 27 src refs, 22 api refs (second only to intelligence_items).
- **RLS:** 4 policies. Anon read OPEN; service-role write.
- **Indexes:** 15.
- **Cross-references:** Inbound from 19 distinct FKs (every source-related table). Outbound: none.
- **Section 6 mapping:** 6.2 (source registry as a curated product). The schema is rich; the curation is uneven. This is the table Section 6.2 calls to overhaul.
- **Recommendation:** KEEP_AND_EXTEND with major surgery. Pick canonical vocabularies (scope_topics/scope_modes/scope_verticals), deprecate the parallel ones (intelligence_types, topic_tags, transport_modes column on sources, vertical_tags). Pick canonical tier system (Section 6.2 calls for migration 063 framework). Add `lead_time_target_hours int` per source (Section 6.7 SLA). Add `content_typology text[]` separating "what kinds of items this source produces" from source_role. Add `owning_organization_id uuid` (FK to organizations entity, Section 6.1). Add `quality_score_observed numeric` derived from source_trust_events.

### public.staged_updates

- **Status:** ACTIVE (24 rows, all materialized; pre-materialization queue for agent updates)
- **Migration introduced:** `001_schema.sql` (altered 5 times: 002, 005, 010, 015, 034)
- **Row count (live):** 24
- **Columns (18):** id, item_id (FK), source_id (FK), update_type, proposed_changes jsonb, reason, source_url, confidence, status, reviewed_by, reviewed_at, batch_id, created_at, full_brief, jurisdiction_iso[], materialization_error, materialized_at, materialized_item_id (FK→intelligence_items)
- **Population pattern:** Agent runs that produce updates land here pre-materialization. All 24 currently materialized; 0 pending; 0 errored.
- **Read pattern:** 7 src refs, 3 api refs.
- **RLS:** 3 policies.
- **Indexes:** 5.
- **Section 6 mapping:** 6.3 (LLM classifier with structured confidence; staged_updates is the human-review queue precursor) + 6.5 (structured extraction queue).
- **Recommendation:** KEEP_AND_EXTEND. Add per-fact confidence breakdown in `proposed_changes`. Add `quarantine` status (Section 6.3) for low-confidence updates that should not auto-materialize.

### public.system_state

- **Status:** ACTIVE (1 row, singleton; global processing pause flag)
- **Migration introduced:** `016_add_processing_pause.sql`
- **Row count (live):** 1
- **Columns (3):** id (PK), global_processing_paused bool, updated_at
- **Population pattern:** Updated by admin to pause all ingestion globally.
- **Read pattern:** 2 src refs.
- **RLS:** 0 policies (RLS enabled, service-role only — no policy means no access for non-service callers).
- **Indexes:** 1.
- **Section 6 mapping:** Operational; not directly Section 6 but supports the ingestion control plane.
- **Recommendation:** KEEP_AS_IS.

### public.taxonomy_nodes

- **Status:** ACTIVE-seeded (38 rows; ltree-based taxonomy of topics)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 38
- **Columns (9):** id, label, slug, node_type, path ltree, description, parent_id (FK self), sort_order, created_at
- **Population pattern:** Seeded via seed-community.sql. No current writer.
- **Read pattern:** Zero src refs (no surface uses it). Used as FK target by `vendor_technologies.taxonomy_node_id`.
- **RLS:** 3 policies.
- **Indexes:** 5.
- **Section 6 mapping:** 6.1 (master data: this is the closest existing thing to a `verticals` or `topics` entity table).
- **Recommendation:** KEEP_AND_EXTEND. Could become the canonical entity table for the verticals/topics axes Section 6.1 calls for. Currently underutilized.

### public.user_profiles

- **Status:** ACTIVE (1 row; the lone user, Jason)
- **Migration introduced:** `027_user_profiles.sql`
- **Row count (live):** 1
- **Columns (13):** user_id (PK, FK to auth.users), name, headshot_url, bio, timezone, sectors text[], jurisdictions text[], transport_modes text[], verifier_status, verifier_since, is_platform_admin bool, created_at, updated_at
- **Population pattern:** Onboarding writes; profile editor writes.
- **Read pattern:** 12 src refs, 4 api refs.
- **RLS:** 4 policies.
- **Indexes:** 3.
- **Section 6 mapping:** 6.8 (multi-tenancy with sector ranking; this is the per-user sector override).
- **Recommendation:** KEEP_AND_EXTEND. The Section 6.8 work is to merge configuration UIs and wire server-side ranking; the table itself is fine. May need to be merged or aligned with `profiles` (see profiles entry).

### public.user_watchlist

- **Status:** DEAD (0 rows, 1 src ref; admin-side feature unimplemented)
- **Migration introduced:** `060_user_watchlist.sql`
- **Row count (live):** 0
- **Columns (6):** id, user_id, org_id (FK), item_type, item_id, created_at
- **Population pattern:** None.
- **Read pattern:** `supabase-server.ts:1549` reads. 1 src ref.
- **RLS:** 3 policies.
- **Indexes:** 4.
- **Section 6 mapping:** 6.10 (operator-facing tracking).
- **Recommendation:** KEEP_AS_IS for forward-looking surface (the "watchlist" feature has UI scaffold but no writer).

### public.vendor_endorsements

- **Status:** DEAD (0 rows, 0 src refs)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 0
- **Columns (6):** id, endorser_id, vendor_id, ... (4 more)
- **Recommendation:** DEPRECATE.

### public.vendor_regulations

- **Status:** DEAD (0 rows, 0 src refs)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 0
- **Columns (4):** id, vendor_id (FK), regulation_id (FK→intelligence_items), ... (1 more)
- **Cross-references:** This is interesting because it's the only table with a typed link from a "vendor" entity to an "intelligence_items" row pretending to be a regulation, which fits the Section 6.4 graph pattern.
- **Recommendation:** DEPRECATE in current form, BUT replicate the pattern in the future `item_relationships` table (Section 6.4) with `relationship='vendor_addresses_regulation'`.

### public.vendor_technologies

- **Status:** DEAD (0 rows, 0 src refs)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 0
- **Columns (2):** vendor_id (FK), taxonomy_node_id (FK→taxonomy_nodes)
- **Recommendation:** DEPRECATE.

### public.vendors

- **Status:** DEAD/SCAFFOLD (0 rows, 1 src ref)
- **Migration introduced:** `007_community_layer.sql`
- **Row count (live):** 0
- **Columns (22):** id, name, slug, description, company_website, company_size, hq_region, service_regions[], founded_year, logo_url, contact_name, contact_email, contact_phone, verification_status, peer_endorsement_count, listing_tier, topic_tags[], region_tags[], transport_mode_tags[], vertical_tags[], created_at, updated_at
- **Population pattern:** None.
- **Read pattern:** 1 src ref (legacy import path, not rendered).
- **RLS:** 3 policies.
- **Indexes:** 8.
- **Section 6 mapping:** 6.1 (organizations entity table). Could become the canonical organization entity for vendor-class organizations. EcoVadis-the-company would live here.
- **Recommendation:** RENAME to `organizations` extension or MERGE into a canonical `organizations` entity. The schema is right for vendor-organizations; either repurpose or deprecate.

### public.workspace_item_overrides

- **Status:** ACTIVE (1 row; one archived item override)
- **Migration introduced:** `006_multi_tenant.sql`
- **Row count (live):** 1
- **Columns (12):** id, org_id (FK), item_id (FK), priority_override, is_archived, archive_reason, archive_note, archived_at, notes, workspace_tags[], created_at, updated_at
- **Population pattern:** Per-workspace overrides for items.
- **Read pattern:** 2 src refs, 1 api ref. Read by every page RPC via the LEFT JOIN in `_workspace_active_items` and the seven page RPCs.
- **RLS:** 4 policies.
- **Indexes:** 5.
- **Section 6 mapping:** 6.8 (multi-tenancy: per-workspace overrides) + 6.9 (per-surface frames could live as overrides per workspace).
- **Recommendation:** KEEP_AND_EXTEND. This is a healthy pattern; extend with per-fact overrides (workspace-level corrections of bad classifications), per-frame overrides (Section 6.9).

### public.workspace_settings

- **Status:** ACTIVE (1 row; the lone Dietl/Rockit workspace)
- **Migration introduced:** `006_multi_tenant.sql`
- **Row count (live):** 1
- **Columns (12):** id, org_id (FK), sector_profile jsonb, jurisdiction_weights jsonb, default_filters jsonb, alert_config jsonb, home_sections jsonb, default_export_format, created_at, updated_at, notify_on_sector_activation bool, sectors_activation_signup_at timestamptz
- **Population pattern:** Onboarding + admin writes.
- **Read pattern:** 5 src refs, 1 api ref.
- **RLS:** 3 policies.
- **Indexes:** 3.
- **Section 6 mapping:** 6.8 (per-workspace sector profile).
- **Recommendation:** KEEP_AND_EXTEND. Server-side sector ranking (Section 6.8) reads from here; the wiring is the missing piece.

### Phantom: integrity_flags (NOT IN DB)

- **Status:** PHANTOM (in code at `src/lib/supabase-server.ts:1743`; defined in migrations 048+050; absent from live DB)
- **Migration introduced:** `048_integrity_flags_platform.sql` (then widened in `050_integrity_flags_workflow_gap.sql`); neither in `schema_migrations`.
- **Row count (live):** N/A (table does not exist)
- **Columns (intended, 11):** id, category (CHECK constraint with 7 enum values), subject_type, subject_ref, description, recommended_actions jsonb, status, created_at, created_by, resolved_at, resolved_by, resolution_note
- **Read pattern:** `getAdminAttentionCounts()` in `supabase-server.ts:1743` reads `from('integrity_flags').select('*', {count, head}).eq('status','open')`. This silently returns null/error and the count drops out. The "404 admin items need attention" leak observed in the Chrome audit cannot include integrity flags because they don't exist.
- **Section 6 mapping:** 6.10 (operator-facing data quality affordances).
- **Recommendation:** RECREATE. Apply migrations 048 + 050. Without it the agent contract documented in `.claude/CLAUDE.md` for design_drift / data_quality / source_issue / coverage_gap / data_integrity / surface_concern / workflow_gap flags has no place to land. The agent has been emitting flags for weeks with nowhere to write them.

---

## 3. Tables grouped by lifecycle

### 3.1 Active production tables (current writer + current reader)

| Table | Rows | Migration | Purpose |
|---|---|---|---|
| `intelligence_items` | 655 | 004 | Central artifact: brief, structured columns, classification |
| `sources` | 794 | 004 | Source registry with 5-axis classification |
| `agent_runs` | 1004 | 057 | Per-run cost, fetch, classification log |
| `raw_fetches` | 668 | 052 | Immutable HTML capture per fetch |
| `ingestion_state` | 783 | 059 | Per-source pause/auto-run flags |
| `ingestion_control_log` | 718 | 058 | State-change history |
| `monitoring_queue` | 478 | 004 | Per-source check schedule |
| `pending_first_fetch` | 11 | 065 | New-source first-fetch queue |
| `intelligence_item_versions` | 8 | 053 | Version snapshot trigger output |
| `staged_updates` | 24 | 001 | Pre-materialization queue (all materialized) |
| `provisional_sources` | 404 | 004 | Discovery candidates awaiting promotion |
| `canonical_source_candidates` | 370 | 021 | Source-correction proposals for items |
| `source_verifications` | 1414 | 037 | AI verifier output log |
| `intelligence_summaries` | 2310 | 009 | Per-sector summary cache (writer active, no reader) |
| `source_trust_events` | 787 | 004 | Trust-score event log |

### 3.2 Active workspace state (single-tenant today)

| Table | Rows | Purpose |
|---|---|---|
| `organizations` | 1 | Workspace tenant (Dietl/Rockit) |
| `org_memberships` | 1 | Membership |
| `user_profiles` | 1 | Per-user product profile (sectors, jurisdictions) |
| `workspace_settings` | 1 | Per-workspace sector profile |
| `workspace_item_overrides` | 1 | Per-workspace item overrides |
| `system_state` | 1 | Global processing pause flag |

### 3.3 Active secondary (read by current code, low population)

| Table | Rows | Purpose |
|---|---|---|
| `coverage_gaps` | 2 | Hand-seeded coverage holes |
| `taxonomy_nodes` | 38 | ltree taxonomy seed; not consumed |
| `sector_contexts` | 15 | Per-sector synopsis prompts and weights |
| `admin_action_cooldowns` | 0 | Throttle table; just unused |
| `forum_sections` | 17 | Seeded community structure; not rendered |

### 3.4 Frozen tables (only populated by 2026-04 migration 010 backfill)

| Table | Rows | Last write | Reads from |
|---|---|---|---|
| `item_timelines` | 107 | 2026-04-05 | Detail page Timeline tab |
| `item_changelog` | 9 | 2026-04-05 | Detail page changes |
| `item_disputes` | 7 | 2026-04-05 | Detail page disputes |
| `item_cross_references` | 49 | (backfill only) | Detail page related items |
| `item_supersessions` | 5 | 2026-03-02 | Detail page supersedes |

These are the tables Section 6.4 (knowledge graph) and 6.5 (structured extraction) and 6.6 (versioning) consolidate. v2 audit Section 3 S10 names this directly.

### 3.5 Phantom-only tables (referenced in code, not in DB)

| Phantom | Where read |
|---|---|
| `integrity_flags` | `src/lib/supabase-server.ts:1743` |

### 3.6 Dead tables (no current writer, no current reader, or both)

| Table | Rows | Why dead |
|---|---|---|
| `briefings` | 0 | Weekly digest product never shipped |
| `intelligence_changes` | 0 | Three-way conflict with `intelligence_item_versions` and `item_changelog`; intelligence_changes is the most-empty of the three |
| `source_citations` | 0 | Citation graph never wired |
| `source_conflicts` | 0 | Two-source contradiction tracking never wired |
| `user_watchlist` | 0 | Watchlist UI scaffold not wired |
| `vendor_endorsements` | 0 | Community vendor layer scaffold |
| `vendor_regulations` | 0 | Community vendor layer scaffold (interesting pattern; replicate in graph) |
| `vendor_technologies` | 0 | Community vendor layer scaffold |
| `vendors` | 0 | Community vendor layer scaffold |
| `case_study_endorsements` | 0 | Community layer scaffold |

### 3.7 Community layer (12 tables, mostly scaffold)

| Table | Rows |
|---|---|
| `community_groups` | 0 |
| `community_group_members` | 0 |
| `community_group_invitations` | 0 |
| `community_topics` | 0 |
| `community_topic_groups` | 0 |
| `community_posts` | 0 |
| `post_promotions` | 0 |
| `forum_threads` | 0 |
| `forum_replies` | 0 |
| `forum_sections` | 17 (seeded) |
| `case_studies` | 6 (seeded) |
| `moderation_reports` | 0 |
| `notifications` | 0 |
| `notification_events` | 0 |
| `notification_preferences` | 0 |
| `notification_subscriptions` | 0 |
| `notification_deliveries` | 0 |

(Seventeen tables under the community umbrella when notifications are included; only `forum_sections` and `case_studies` have any data.)

### 3.8 Sources-domain tables

| Table | Rows |
|---|---|
| `sources` | 794 |
| `provisional_sources` | 404 |
| `provisional_sources_review` (VIEW) | 404 |
| `canonical_source_candidates` | 370 |
| `source_verifications` | 1414 |
| `source_trust_events` | 787 |
| `source_health_summary` (VIEW) | n |
| `source_citations` | 0 (dead) |
| `source_conflicts` | 0 (dead) |
| `monitoring_queue` | 478 |
| `pending_first_fetch` | 11 |
| `ingestion_state` | 783 |
| `ingestion_control_log` | 718 |
| `raw_fetches` | 668 |
| `agent_runs` | 1004 |

### 3.9 Items-domain tables

| Table | Rows |
|---|---|
| `intelligence_items` | 655 |
| `intelligence_summaries` | 2310 |
| `intelligence_item_versions` | 8 |
| `intelligence_changes` | 0 (dead) |
| `staged_updates` | 24 |
| `item_timelines` | 107 (frozen) |
| `item_changelog` | 9 (frozen) |
| `item_disputes` | 7 (frozen) |
| `item_cross_references` | 49 (frozen) |
| `item_supersessions` | 5 (frozen) |
| `workspace_item_overrides` | 1 |

### 3.10 Auth + user tables

| Table | Rows |
|---|---|
| `profiles` | 1 (legacy, FK target only) |
| `user_profiles` | 1 (canonical product profile) |
| `organizations` | 1 |
| `org_memberships` | 1 |
| `workspace_settings` | 1 |

### 3.11 Operations tables

| Table | Rows |
|---|---|
| `agent_runs` | 1004 |
| `raw_fetches` | 668 |
| `ingestion_control_log` | 718 |
| `ingestion_state` | 783 |
| `staged_updates` | 24 |
| `system_state` | 1 |
| `admin_action_cooldowns` | 0 |
| `bulk_imports` | 0 |
| `monitoring_queue` | 478 |
| `pending_first_fetch` | 11 |
| `coverage_gaps` | 2 |

---

## 4. Section 6 gap map

For each Section 6 sub-layer in the v2 audit, the tables that serve it today, the additions needed, and the removals.

### 6.1 Master data and entity resolution

| Today | Needed | Remove/merge | Notes |
|---|---|---|---|
| `intelligence_items` (61 cols, single canonical artifact for everything) | New: `regulations` entity table; `organizations` entity table (extend the existing 1-row table); `jurisdictions` entity table (replace `jurisdiction_iso[]` everywhere); `transport_modes` entity table (canonical, with disallowed sentinel "GLOBAL"); `verticals` entity table; `events` entity table | None initially. Phase 2: drop `region_tags[]` (0/655), drop `linked_*_ids[]` quartet (0/655), pick one of `verticals[]` vs `vertical_tags[]` | The biggest schema work. `taxonomy_nodes` (38 rows, ltree) is the closest existing prototype for an entity table; could expand or stay separate. |

### 6.2 Source registry as a curated product

| Today | Needed | Remove/merge | Notes |
|---|---|---|---|
| `sources` (75 cols, partially classified), `provisional_sources` (404), `canonical_source_candidates` (370), `source_verifications` (1414), `source_trust_events` (787), `pending_first_fetch` (11), `ingestion_state` (783), `ingestion_control_log` (718), `monitoring_queue` (478), `coverage_gaps` (2) | New columns on `sources`: `lead_time_target_hours int`, `content_typology text[]` separating produced types from source_role, `owning_organization_id uuid` (FK to organizations entity), `quality_score_observed numeric` (derived from source_trust_events). New write path: structured source-onboarding workflow that requires classification at promotion (provisional → source). | `sources.intelligence_types[]` (deprecate, was original 004 vocabulary), `sources.topic_tags[]` (deprecate, was 007 vocabulary), `sources.transport_modes[]` (column on sources; deprecate in favor of `scope_modes`), `sources.vertical_tags[]` (deprecate). Drop `tier_at_creation` if no longer informative under canonical tier system. | Pick one canonical tier system (Section 6.2 calls for migration 063 framework; live data follows legacy 7-tier). Migrate 794 sources to chosen system. |

### 6.3 Content typology with deterministic + LLM hybrid classification

| Today | Needed | Remove/merge | Notes |
|---|---|---|---|
| `intelligence_items.item_type` (LLM-set, no confidence), `intelligence_items.classification_*` columns (none — confidence lives only on sources), `staged_updates.confidence text` | New: `intelligence_items.item_type_confidence numeric`, `item_type_classifier text` (deterministic|llm_high|llm_low|human), `quarantine_state text` (active|quarantined|review_pending). New table or columns for deterministic-rule audit log (which rules fired, what won). | None | Quarantine state + admin queue is the structural change; without it, low-confidence classifications keep reaching operators. |

### 6.4 Knowledge graph layer

| Today | Needed | Remove/merge | Notes |
|---|---|---|---|
| `item_cross_references` (49 rows, frozen, 4 cols), `item_supersessions` (5, frozen), `intelligence_items.related_items[]` (74), `intelligence_items.intersection_summary text` (74), `intelligence_items.linked_*_ids[]` (0,0,0,0) | Rename `item_cross_references` to `item_relationships`, add `relationship_type text` enum (supersedes, implements, references, conflicts_with, depends_on, amends, related_to, sector_competitor), `confidence numeric`, `provenance jsonb`. Wire a writer in agent regeneration. | Drop `item_supersessions` (fold into `item_relationships`). Drop the four `linked_*_ids[]` columns on `intelligence_items`. Drop `related_items[]` and `intersection_summary` on `intelligence_items`. | Five overlapping mechanisms collapse to one. |

### 6.5 Structured fact extraction

| Today | Needed | Remove/merge | Notes |
|---|---|---|---|
| `intelligence_items.compliance_deadline date` (0/655), `entry_into_force date` (23/655), `next_review_date date` (0/655), `urgency_tier text` (614/655), `severity text`, `confidence text`, `priority text`, `key_data text[]`, `operational_impact text`, `full_brief text` (171/655), `pipeline_stage text` (196/655) | **Add the seven phantom columns**: `penalty_range text`, `cost_mechanism text`, `enforcement_body text`, `legal_instrument text`, `last_verified_date timestamptz`, `action_owner text`, `authority_level text`. Add `*_confidence numeric` for each extracted fact. Add `*_provenance jsonb` (source_document_id, paragraph_index, character_range) for each fact. Wire a structured-extraction pass after every full_brief regeneration. | None initially. | The seven phantom columns are the single highest-impact schema change. v2 Section 3 S3 makes this explicit. |

### 6.6 Versioning and audit trail

| Today | Needed | Remove/merge | Notes |
|---|---|---|---|
| `intelligence_item_versions` (8 rows, trigger-driven, current), `item_changelog` (9 rows, frozen 2026-04), `intelligence_items.version_history jsonb` (NOT NULL default `[]`, populated by zero writer), `intelligence_changes` (0 rows, dead) | Make `intelligence_item_versions` canonical. Add operator-visible diff renderer. Add `writer_identity text` enum (haiku|sonnet|human|migration|trigger). Add per-fact `superseded_at` to keep prior values. | Drop `item_changelog`. Drop `intelligence_changes`. Drop `intelligence_items.version_history` JSONB. | Three storage shapes for the same concern. |

### 6.7 Lead time as a first-class column

| Today | Needed | Remove/merge | Notes |
|---|---|---|---|
| `sources.avg_lead_time_days numeric NOT NULL` (0/794 > 0), `sources.lead_time_samples int NOT NULL` (0/794 > 0) | Add `intelligence_items.source_publication_date timestamptz` (extracted at ingest from source page when possible). Add `intelligence_items.first_observed_at timestamptz NOT NULL DEFAULT now()` (immutable). Derived columns or view: `lead_time_vs_effective_date`, `lead_time_vs_publication`. Index both. Per-source SLA on `sources.lead_time_target_hours int`. | None | Section 6.7 is a feature-add; no removals. The phantom columns block this work today (no source publication date is captured at ingest because the schema doesn't have a place for it). |

### 6.8 Multi-tenancy with sector ranking

| Today | Needed | Remove/merge | Notes |
|---|---|---|---|
| `organizations` (1), `org_memberships` (1, RLS-correct), `user_profiles.sectors[]`, `workspace_settings.sector_profile jsonb`, `workspace_item_overrides`, `sector_contexts.urgency_weights jsonb`, the seven page DEFINER RPCs | Server-side sector ranking. New columns or RPC params: `p_sector_profile jsonb` on every page RPC. Every page RPC checks `auth.uid()` ∈ `org_memberships` for `p_org_id`. New: derived `sector_relevance_score numeric` on result rows, computed from `intelligence_items.verticals[]` × workspace.sector_profile. | Decide on `verticals[]` vs `vertical_tags[]`; pick `verticals[]` as canonical, drop `vertical_tags[]` from both `intelligence_items` and `sources`. | This is the Section 6.8 work. The schema is mostly ready; the wiring is the gap. The auth gap on the seven RPCs (no auth.uid() check) is a deployment-blocker for second tenant. |

### 6.9 Cross-page framing as a derived view

| Today | Needed | Remove/merge | Notes |
|---|---|---|---|
| `intelligence_items` (single shared body), `intelligence_summaries` (2310 rows of per-sector summaries — closest to a frame store, currently no reader), single `/regulations/[slug]` route | New: per-surface frame store (could repurpose `intelligence_summaries` or new `item_surface_frames` table) with (item_id, surface ∈ {regulations, market, research, operations}, frame_summary, frame_what_is_it, frame_why_matters, frame_action_recommendation, generated_at, model_version, confidence). Plus per-surface detail-page routes. Plus a writer pass that emits all four frames (when applicable) per regeneration. | Decide whether `intelligence_summaries` can be repurposed (per-sector vs per-surface is a different axis). | If `intelligence_summaries` repurposes, the 2310 rows become legacy per-sector frames; new frame writer takes over. |

### 6.10 Operator-facing data quality affordances

| Today | Needed | Remove/merge | Notes |
|---|---|---|---|
| `sources.tier`, `sources.classification_confidence`, `sources.classification_rationale`, `sources.spotchecked`, `intelligence_items.agent_integrity_*`, `item_disputes` (7 frozen), `source_conflicts` (0 dead), missing `integrity_flags` | Recreate `integrity_flags` (apply 048 + 050). Wire `source_conflicts` and `item_disputes` writers. Surface `classification_confidence` and `classification_rationale` on the operator's view. Surface `sources.tier` next to every source URL. Surface `sources_used uuid[]` on intelligence_items as clickable per-claim pointers (currently stored, never rendered). | None | This is the visible expression of all the above layers. The data exists for some of it; the read paths and rendering are the gap. |

---

## 5. Specific recommendations

### 5.1 Tables to add

| Table | Purpose | Section |
|---|---|---|
| `regulations` | Canonical regulatory entity (separate from intelligence_items rows). Columns: `id uuid PK`, `canonical_title text NOT NULL`, `issuing_authority_id uuid` (FK→organizations), `legal_instrument_citation text`, `current_version_id uuid` (FK→intelligence_items version row), `effective_date date`, `created_at`. Index on (issuing_authority_id, legal_instrument_citation) UNIQUE. | 6.1 |
| `organizations_canonical` (or extend the existing `organizations` table with `entity_type text`) | Canonical organization entity for source-owning organizations, regulators, vendors. Columns add: `entity_type text NOT NULL CHECK (entity_type IN ('workspace_tenant','source_owner','regulator','vendor','academic','industry_association','intergovernmental','other'))`, `canonical_url text`, `aliases text[]`. EcoVadis-the-company would be one row here; the 5 EcoVadis source rows would all FK to it. | 6.1 |
| `jurisdictions` | Canonical jurisdiction entity. Columns: `id uuid PK`, `iso_code text NOT NULL UNIQUE`, `display_name text NOT NULL`, `parent_id uuid` (FK self for hierarchy), `aliases text[]`. Replaces `jurisdiction_iso text[]` and `jurisdictions text[]` columns across schema with FKs. | 6.1 |
| `transport_modes` | Canonical mode entity. Small static table. Columns: `id uuid PK`, `slug text UNIQUE`, `display_name text`, `disallowed_sentinels text[]` (so "GLOBAL" cannot be used as a mode). Replaces array columns with FKs (or a new `item_transport_modes` join table). | 6.1 |
| `verticals` | Canonical vertical entity matching the brief's HIGH/MEDIUM taxonomy. | 6.1 |
| `events` | Per-item dated facts (announcement, publication, effective, enforcement, revision, supersession). Columns: `id`, `item_id` (FK), `event_type text NOT NULL CHECK`, `event_date timestamptz`, `confidence numeric`, `provenance jsonb`, `created_at`. Could replace `item_timelines` after migrating frozen rows forward. | 6.1, 6.4, 6.7 |
| `item_relationships` (rename of `item_cross_references` or new) | One canonical relationship store. Columns: `source_item_id`, `target_item_id`, `relationship_type text CHECK`, `confidence numeric`, `provenance jsonb`, `created_at`, `superseded_at`. Index both directions. | 6.4 |
| `item_surface_frames` (or repurpose `intelligence_summaries`) | Per-surface framing store. Columns: `item_id` (FK), `surface text CHECK`, `frame_summary text`, `frame_what_is_it text`, `frame_why_matters text`, `frame_action_recommendation text`, `generated_at`, `model_version`, `confidence`. UNIQUE (item_id, surface). | 6.9 |
| `extraction_facts` (optional alternative to per-fact columns) | Per-fact store with span provenance. Columns: `item_id`, `fact_field text` (penalty_range | compliance_deadline | etc.), `fact_value text`, `confidence numeric`, `source_document_id uuid` (FK→raw_fetches), `paragraph_index int`, `character_range int4range`, `extracted_by text`, `confirmed_by uuid`, `confirmed_at`. This is the alternative to widening `intelligence_items` with seven phantom columns + seven `_confidence` + seven `_provenance`. Each approach has tradeoffs. | 6.5 |
| **Recreate `integrity_flags`** | Apply migrations 048 + 050. Already specified, just needs to land. | 6.10 |

### 5.2 Tables to remove or merge

| Table | Action | Why |
|---|---|---|
| `intelligence_changes` | DROP | 0 rows, never written. Conflicts with `intelligence_item_versions` and `item_changelog`. Pick the trigger-driven `intelligence_item_versions`. |
| `item_changelog` | DROP after migrating 9 frozen rows into `intelligence_item_versions` | Same conflict. |
| `item_supersessions` | DROP after migrating 5 frozen rows into `item_relationships` with `relationship_type='supersedes'` | One canonical relationship store. |
| `briefings` | DROP | 0 rows, no writer, no UI. |
| `vendor_endorsements`, `vendor_regulations`, `vendor_technologies`, `vendors`, `case_studies`, `case_study_endorsements`, `forum_threads`, `forum_replies`, `forum_sections`, `community_*` (12 tables), `notification_*` (5 tables), `moderation_reports`, `post_promotions` | Decide en bloc. Either ship community or DROP. | The community layer is a parallel product surface that has not shipped. Holding it adds RLS complexity and audit noise. |
| `profiles` (after FK migration) | Consolidate into `user_profiles` | Two user tables; one row each; FK churn is non-trivial but worth it. |
| `intelligence_summaries` (2310 rows) | EVALUATE. Either repurpose as `item_surface_frames` or DROP. | Per-sector axis vs per-surface axis is a deliberate choice. |

### 5.3 Columns to add to existing tables

**On `intelligence_items`:**
- `penalty_range text` (PHANTOM in current renderer; required by Section 6.5)
- `penalty_range_confidence numeric`
- `penalty_range_provenance jsonb`
- `cost_mechanism text` + `_confidence` + `_provenance`
- `enforcement_body text` + `_confidence` + `_provenance`
- `legal_instrument text` + `_confidence` + `_provenance`
- `last_verified_date timestamptz`
- `action_owner text`
- `authority_level text`
- `source_publication_date timestamptz` (Section 6.7)
- `first_observed_at timestamptz NOT NULL DEFAULT now()` (Section 6.7, immutable)
- `item_type_confidence numeric`
- `item_type_classifier text CHECK (IN ('deterministic','llm_high','llm_low','human','migration'))`
- `quarantine_state text DEFAULT 'active' CHECK (IN ('active','quarantined','review_pending'))`
- `sector_relevance_score numeric` (derived; Section 6.8)
- `last_brief_writer text` (haiku|sonnet|human|migration; for Section 5 S5 disambiguation)

**On `sources`:**
- `lead_time_target_hours int`
- `content_typology text[]` (the kinds of items this source produces, separate from source_role)
- `owning_organization_id uuid` (FK to organizations entity)
- `quality_score_observed numeric` (derived from source_trust_events)
- `onboarding_completed_at timestamptz` (separates "in registry" from "fully onboarded")

**On `staged_updates`:**
- `quarantine_reason text` (when status='quarantined')
- `confidence_per_field jsonb` (replaces flat `confidence text` with structured)

**On `item_relationships` / `item_cross_references`:**
- `confidence numeric`
- `provenance jsonb`
- Expand `relationship` enum to Section 6.4 set

**On `intelligence_item_versions`:**
- `writer_identity text CHECK` (haiku|sonnet|human|migration|trigger)

### 5.4 Columns to remove from existing tables

**On `intelligence_items`:**
- `linked_forum_thread_ids[]` (0/655 populated)
- `linked_vendor_ids[]` (0/655)
- `linked_case_study_ids[]` (0/655)
- `linked_regulation_ids[]` (0/655)
- `region_tags[]` (0/655; redundant with `jurisdictions[]`/`jurisdiction_iso[]`)
- `vertical_tags[]` (0/655; pick `verticals[]` as canonical)
- `version_history jsonb` (populated by no writer; superseded by `intelligence_item_versions`)
- `intersection_summary text` (74/655; fold into `item_relationships.provenance` or drop)
- `related_items uuid[]` (74/655; fold into `item_relationships`)
- After entity-resolution work: `jurisdictions text[]`, `jurisdiction_iso text[]`, `transport_modes text[]`, `verticals text[]` get replaced with FKs

**On `sources`:**
- `intelligence_types[]` (deprecate after picking `scope_topics[]` canonical)
- `topic_tags[]` (deprecate)
- `transport_modes[]` column on sources (deprecate in favor of `scope_modes[]`)
- `vertical_tags[]` (deprecate in favor of `scope_verticals[]`)
- After tier consolidation: `tier_at_creation int NOT NULL` may become redundant

### 5.5 RLS / authorization gaps

1. **The seven page DEFINER RPCs do not check membership.** `get_workspace_intelligence(p_org_id uuid)`, `get_workspace_intelligence_dashboard`, `get_workspace_intelligence_listings`, `get_workspace_intelligence_slim`, `get_workspace_intelligence_aggregates`, `get_workspace_intelligence_aggregates_scoped`, `get_market_intel_items`, `get_research_items`, `get_operations_items` — every one accepts `p_org_id` and returns rows including `workspace_item_overrides.notes` and `workspace_tags`. Add an `EXISTS (SELECT 1 FROM org_memberships WHERE user_id=auth.uid() AND org_id=p_org_id)` guard at the top of each. Without it, any anon-key holder can call these RPCs against any UUID. v2 audit Section 3 S11 names this; the schema audit confirms it at the function-definition level.
2. **`intelligence_items` RLS allows anon SELECT.** Acceptable for the marketing-style read-anywhere model, but should be documented and confirmed against the brief.
3. **`workspace_item_overrides` RLS** is correctly scoped to `org_memberships`. The leak is that the RPCs bypass RLS via DEFINER and don't replicate the membership check.
4. **`integrity_flags`** (when recreated) needs the policies migration 048 specifies (admin-only read; service-role write).
5. **`profiles` vs `user_profiles`** RLS divergence: 1 policy on `profiles`, 4 on `user_profiles`. Consolidate.

### 5.6 Index gaps

Forward-looking, for the new structured-extraction queries and per-surface framing queries:

- On `intelligence_items`: index on `(item_type, jurisdiction_iso[])` for /regulations and /operations filtering. Index on `(source_publication_date)` and `(first_observed_at)` once added (Section 6.7 sort/filter axes).
- On `intelligence_items`: GIN index on `verticals[]` (the Section 6.8 ranking JOIN).
- On `item_relationships` (when created): index on `(target_item_id, relationship_type)` and `(source_item_id, relationship_type)` for both-direction graph traversal.
- On `extraction_facts` (when created): index on `(item_id, fact_field)` UNIQUE for upsert; index on `(fact_field, confidence DESC)` for review queue.
- On `item_surface_frames` (when created): UNIQUE (item_id, surface).
- On `staged_updates`: partial index `WHERE status='pending'` already exists as part of 5; verify it covers `materialized_at IS NULL` for materializer queries.
- On `sources`: partial index `WHERE classification_confidence='LOW'` for the review queue (Section 6.10).
- On `agent_runs`: index on `(intelligence_item_id, started_at DESC)` for "show last classification run for this item."

### 5.7 Constraint gaps

- **CHECK on `intelligence_items.item_type`**: the 13 values in use are not enforced by a CHECK constraint. Add one.
- **CHECK on `intelligence_items.priority`**: the four CRITICAL/HIGH/MODERATE/LOW values are not constrained. Add CHECK.
- **CHECK on `intelligence_items.severity`**: enum not constrained. Add CHECK.
- **CHECK on `sources.source_role`**: enum has 11 values used; not constrained. Add CHECK.
- **CHECK on `sources.tier`**: 1-7 not constrained. Add CHECK once tier system is canonicalized.
- **NOT NULL on `intelligence_items.source_id`**: currently NULLABLE; 41/655 have NULL source_id, which means the source-tier and source-role lookups silently degrade. Add NOT NULL after backfilling the orphans.
- **CHECK preventing "GLOBAL" sentinel in `intelligence_items.transport_modes[]`**: the Norway fjords case has Mode = "GLOBAL". Add CHECK or move to entity-FK approach (Section 6.1).
- **FK on `intelligence_items.replaced_by`** to `intelligence_items.id` exists; check ON DELETE CASCADE/SET NULL semantics.
- **UNIQUE on `sources.url`**: is there one? If not, add it (the EcoVadis 5-row case suggests not).
- **UNIQUE on `intelligence_items.legacy_id WHERE legacy_id IS NOT NULL`**: the 195 legacy rows shouldn't have collisions; partial UNIQUE index would catch.

---

## 6. Migration consolidation observations

74 migrations on disk (001-074, with gaps at 008/012/014/070). The `schema_migrations` registry on the live DB is corrupt for the band 026-050: only 001-025 and 051-074 are recorded. Tables introduced by the missing migrations DO exist in production (so the migrations were run), which means an out-of-band registry-update happened at some point and a few migrations may have silently failed.

Confirmed missing: **migration 048 (`integrity_flags` table)** and **migration 050 (workflow_gap CHECK widening)** were never applied. Every other 026-050 migration's effect is visible in the live DB (tables exist, columns exist, indexes exist).

### 6.1 Migration drift risk

A future `supabase db push` or `supabase db reset` from a fresh checkout will:
1. Skip 001-025 and 051-074 (they're in registry).
2. Attempt to re-apply 026-050 (they're not in registry).
3. Most of those `CREATE TABLE` statements use `IF NOT EXISTS`, so they'll succeed as no-ops.
4. The ones that don't (some `CREATE INDEX` without IF NOT EXISTS, some `ALTER TABLE ADD COLUMN`) will error.
5. The push will halt mid-band, leaving the registry in an even more confused state.

This is a deployment-blocking risk that lives upstream of any new schema work. **Recommendation: before any new migrations are written, reconcile the `schema_migrations` registry to reflect ground truth.** Either insert the missing 026-050 rows by hand (if their effects are confirmed present) or roll the band into a single new migration that's idempotent.

### 6.2 Stacked / superseded migrations

- **Source classification framework**: 063 introduces 5-axis columns; 067 adds metadata (rationale, confidence, observed-correctness). 074 reclassifies EcoVadis specifically. **All three are necessary**; 067 extends 063, 074 is a one-off data fix.
- **Routing RPCs**: 064 introduces `get_workspace_intelligence_dashboard`, 066 introduces `get_workspace_intelligence_listings`, 047 introduces `get_workspace_intelligence_slim`, 068+069 introduce aggregates and scoped aggregates, 070 (file present, unclear if applied) introduces `phase1_routing_rpcs`, 071 adds deterministic tiebreaker, 073 adds shared workspace scope (`_workspace_active_items`). **Five RPCs do mostly-overlapping work** with different column projections. The Section 6.9 per-surface framing layer would consolidate to one parameterized RPC per surface.
- **Jurisdiction normalization**: 033 adds `jurisdiction_iso[]`, 045 fixes orphan slugs, 072 adds normalizer trigger. **Three steps for one concept**; 072's trigger is the canonical normalizer. Sources of jurisdiction text that bypass the trigger (direct admin SQL, seed scripts) can drift; verify 072 catches all paths.
- **Source classification cache**: 022 adds `recommended_classification` cache; 040 adds discovery_provenance (writer for the cache). Both load-bearing.
- **Integrity flags**: 035 adds per-item flag columns on intelligence_items; 048 adds platform-level `integrity_flags` table; 050 widens its CHECK. **048 + 050 not applied**. 044 tunes the trigger but the trigger may target the not-yet-existing table.
- **Performance indexes**: 003 (initial), 049 (perf_v2). 049 may not be in the registry; verify indexes from 049 actually exist in `pg_indexes`.

### 6.3 Migrations that introduced columns no writer ever touched

- 020 `intersection_readiness`: introduced `intelligence_items.intersection_summary` (74/655 populated by 023's `detect_intersections()` function — partial wiring).
- 062 `intelligence_items_hidden_reason`: introduced `hidden_reason` (3/655 populated).
- 015 `provisional_recommended_classification`: extended `provisional_sources` with `recommended_classification`.
- 018 `b2_brief_schema`: introduced `full_brief`, `urgency_tier`, `format_type`, `last_regenerated_at`, `regeneration_skill_version`, `sources_used[]`. Active (171/655 full_brief, 162/655 regenerated).
- 060 `user_watchlist`: 0 rows. Reader exists; writer doesn't.

### 6.4 Migrations that introduced relations backfilled once and never written to since

- 010 `migrate_legacy_to_item`: backfilled `item_timelines`, `item_changelog`, `item_disputes`, `item_cross_references`. None have current writers (S10 in v2).
- 011 `backfill_orphan_supersessions`: backfilled `item_supersessions`. No current writer.

### 6.5 Migration consolidation candidates

A "clean schema baseline" workstream would:
1. **Reconcile the schema_migrations registry** (most urgent).
2. **Apply 048 + 050** to create `integrity_flags`.
3. **Drop the dead tables** identified in Section 5.2.
4. **Drop the deprecated columns** identified in Section 5.4 (after writer migrations).
5. **Add the entity tables and the seven phantom columns** identified in Section 5.3.
6. **Migrate the frozen 010 backfill data** into the new canonical stores (`intelligence_item_versions` for changelog, `item_relationships` for cross_references and supersessions, `events` for timelines).
7. **Squash 074 migrations** into a clean baseline migration `001_baseline_post_consolidation.sql` that represents the desired end-state schema. Future migrations start from there.

---

## Appendix A: `intelligence_items` columns

61 columns, by category.

**Identity and metadata (10):** `id uuid PK NOT NULL`, `legacy_id text`, `title text NOT NULL`, `category text`, `item_type text NOT NULL`, `domain int NOT NULL`, `created_at`, `updated_at`, `added_date date NOT NULL`, `last_verified timestamptz`.

**Brief content (8 NOT NULL with empty-string fallback):** `summary text`, `what_is_it text`, `why_matters text`, `key_data text[]`, `operational_impact text`, `open_questions text[]`, `tags text[]`, `reasoning text`.

**B.2 brief content (added 018, 6 cols):** `full_brief text`, `urgency_tier text`, `format_type text`, `last_regenerated_at timestamptz`, `regeneration_skill_version text`, `sources_used uuid[]`.

**Source pointer (2):** `source_id uuid` (FK→sources, nullable), `source_url text NOT NULL`.

**Classification axes (3):** `jurisdictions text[] NOT NULL`, `transport_modes text[] NOT NULL`, `verticals text[] NOT NULL`.

**Status/severity (4):** `status text NOT NULL`, `severity text`, `confidence text NOT NULL`, `priority text NOT NULL`.

**Dates the renderer reads (3):** `entry_into_force date` (23/655), `compliance_deadline date` (0/655), `next_review_date date` (0/655).

**Archive (4):** `is_archived bool NOT NULL`, `archive_reason text`, `archive_note text`, `archived_date date`.

**Self-supersession (1):** `replaced_by uuid` (FK self).

**Version (1):** `version_history jsonb NOT NULL DEFAULT '[]'` (populated by zero writer).

**Linked-IDs quartet (4, all 0/655):** `linked_forum_thread_ids uuid[]`, `linked_vendor_ids uuid[]`, `linked_case_study_ids uuid[]`, `linked_regulation_ids uuid[]`.

**Tag arrays (5):** `region_tags text[]` (0/655), `topic_tags text[]` (607/655), `vertical_tags text[]` (0/655), `compliance_object_tags text[]` (154/655), `operational_scenario_tags text[]` (152/655).

**Relationships (2):** `related_items uuid[]` (74/655), `intersection_summary text` (74/655).

**Jurisdiction ISO (1):** `jurisdiction_iso text[]` (195/655).

**Agent integrity (5, added 035):** `agent_integrity_flag bool NOT NULL`, `agent_integrity_phrase text`, `agent_integrity_flagged_at timestamptz`, `agent_integrity_resolved_at timestamptz`, `agent_integrity_resolved_by uuid`.

**Pipeline / hidden (added 062, 026):** `pipeline_stage text` (196/655), `hidden_reason text` (3/655).

**Phantom (NOT IN SCHEMA, read by renderer):** `penalty_range`, `cost_mechanism`, `enforcement_body`, `legal_instrument`, `last_verified_date`, `action_owner`, `authority_level`.

## Appendix B: `sources` columns

75 columns, by category.

**Identity (4):** `id uuid PK`, `name text NOT NULL`, `url text NOT NULL`, `description text NOT NULL`.

**Tier (2):** `tier int NOT NULL`, `tier_at_creation int NOT NULL`. Conflict: two semantics on `tier` (legacy 7-tier, framework 5-axis).

**Original 004 vocabularies (4):** `intelligence_types text[] NOT NULL` (783/794), `domains int[] NOT NULL`, `jurisdictions text[] NOT NULL`, `transport_modes text[] NOT NULL` (362/794).

**Update / access (5):** `update_frequency text NOT NULL`, `last_checked timestamptz`, `last_substantive_change timestamptz`, `next_scheduled_check timestamptz`, `status text NOT NULL`.

**Access method (4, added 056):** `paywalled bool NOT NULL`, `access_method text NOT NULL`, `api_endpoint text`, `rss_feed_url text`.

**Conflict (3):** `confirmation_count int NOT NULL`, `conflict_count int NOT NULL`, `conflict_total int NOT NULL`.

**Accuracy (1):** `accuracy_rate numeric NOT NULL`.

**Lead time (2, populated 0/794):** `avg_lead_time_days numeric NOT NULL`, `lead_time_samples int NOT NULL`.

**Accessibility (5):** `consecutive_accessible int`, `total_checks int`, `successful_checks int`, `accessibility_rate numeric`, `last_accessible timestamptz`, `last_inaccessible timestamptz`.

**Citation (4):** `independent_citers int`, `total_citations int`, `highest_citing_tier int`, `self_citation_count int`, `cited_by text`.

**Trust scores (5):** `trust_score_overall int`, `trust_score_accuracy numeric`, `trust_score_timeliness numeric`, `trust_score_reliability numeric`, `trust_score_citation numeric`.

**Tier history (1):** `tier_history jsonb NOT NULL`.

**Computed-at (2):** `trust_score_computed_at timestamptz NOT NULL`, `notes text NOT NULL`.

**Additional vocabularies (2):** `topic_tags text[]` (310/794, added 007), `vertical_tags text[]` (10/794).

**Misc (2):** `reliability_score numeric`, `processing_paused bool NOT NULL`.

**Admin (1):** `admin_only bool NOT NULL` (added 017).

**Jurisdiction ISO (1):** `jurisdiction_iso text[]` (726/794, added 033).

**Spotcheck (3):** `spotchecked bool NOT NULL` (0/794 true), `spotchecked_by uuid`, `spotchecked_at timestamptz`.

**Scoreboard (4, added 054):** `last_scanned timestamptz`, `last_content_hash text`, `last_content_fetched_at timestamptz`, `last_intelligence_item_at timestamptz`.

**Auto-run (1, added 055):** `auto_run_enabled bool NOT NULL`.

**API extension (3, added 056):** `api_endpoint_url text`, `api_auth_method text`, `api_response_format text`.

**5-axis classification (8, added 063 + 067):** `source_role text` (755/794), `secondary_roles text[]` (0/794), `scope_topics text[]` (755), `scope_modes text[]` (755), `scope_verticals text[]` (755), `expected_output jsonb` (755), `classification_assigned_at timestamptz`, `classification_observed_distribution jsonb`, `observed_correctness_count int NOT NULL`, `last_observed_at timestamptz`, `classification_confidence text` (HIGH=414, MEDIUM=122, LOW=219, NULL=39), `classification_rationale text` (161 = "tier N default", 39 = NULL).

**Created/updated (2):** `created_at`, `updated_at`.

---

## Appendix C: Foreign-key map (selected)

Inbound to `sources.id` (19 distinct sources of FK):
`agent_runs.source_id`, `canonical_source_candidates.current_source_id`, `canonical_source_candidates.promoted_to_source_id`, `ingestion_control_log.source_id`, `ingestion_state.source_id`, `intelligence_items.source_id`, `monitoring_queue.source_id`, `pending_first_fetch.source_id`, `provisional_sources.cited_by_source_id`, `provisional_sources.promoted_to_source_id`, `raw_fetches.source_id`, `source_citations.cited_source_id`, `source_citations.citing_source_id`, `source_conflicts.resolved_by_source_id`, `source_conflicts.source_a_id`, `source_conflicts.source_b_id`, `source_trust_events.source_id`, `source_verifications.resulting_source_id`, `staged_updates.source_id`.

Inbound to `intelligence_items.id` (21 distinct sources of FK):
`agent_runs.intelligence_item_id`, `canonical_source_candidates.intelligence_item_id`, `community_posts.promoted_to_item_id`, `intelligence_changes.item_id`, `intelligence_item_versions.intelligence_item_id`, `intelligence_items.replaced_by` (self), `intelligence_summaries.item_id`, `item_changelog.item_id`, `item_cross_references.source_item_id`, `item_cross_references.target_item_id`, `item_disputes.item_id`, `item_supersessions.new_item_id`, `item_supersessions.old_item_id`, `item_timelines.item_id`, `monitoring_queue.item_id`, `post_promotions.intelligence_item_id`, `source_conflicts.item_id`, `staged_updates.item_id`, `staged_updates.materialized_item_id`, `vendor_regulations.regulation_id`, `workspace_item_overrides.item_id`.

Inbound to `organizations.id` (5 distinct sources of FK):
`briefings.org_id`, `org_memberships.org_id`, `user_watchlist.org_id`, `workspace_item_overrides.org_id`, `workspace_settings.org_id`.

Inbound to `profiles.id` (7 distinct sources of FK):
`case_studies.submitter_id`, `case_study_endorsements.endorser_id`, `forum_replies.author_id`, `forum_threads.author_id`, `notification_deliveries.user_id`, `notification_subscriptions.user_id`, `vendor_endorsements.endorser_id`. (No FK from `user_profiles` to `profiles`; the two tables coexist independently.)

---

## Appendix D: methodology

- Live DB queries via Supabase CLI `db query --linked --output json` against project `kwrsbpiseruzbfwjpvsp` on 2026-05-15.
- Information_schema tables: `tables`, `columns`, `key_column_usage`, `constraint_column_usage`, `triggers`. Plus `pg_class`, `pg_namespace` for RLS state, `pg_indexes`, `pg_constraint`, `pg_proc`, `pg_policies`.
- Code references collected by recursive walk of `fsi-app/src`, `fsi-app/src/app/api`, `fsi-app/supabase/seed`, `fsi-app/supabase/migrations`, `fsi-app/scripts` with regex `\.from\(['"`]TABLE['"`]\)` for code references and SQL keyword regex for migration references.
- Migration-introduction lookup by scanning each migration file for `CREATE TABLE [IF NOT EXISTS] [public.]TABLE` and `ALTER TABLE`.
- Population stats from per-column `count(*) FILTER (WHERE col IS NOT NULL)` queries against the live DB.
- Phantom-column verification by direct `information_schema.columns` query: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='intelligence_items' AND column_name IN (phantom list)` returned zero rows.
- Phantom-table verification: `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='integrity_flags')` returned `false`.
- Authorization audit: `pg_get_functiondef()` on each DEFINER RPC; visual inspection for `auth.uid()` membership checks.
- Audit data files retained at `fsi-app/scripts/tmp/schema-audit-2026-05-15.json`, `migration-introductions-2026-05-15.json`, `readers-writers-2026-05-15.json`, `audit-summary-2026-05-15.json` for re-derivation.

---

This document plus `caros-ledge-product-audit-2026-05-15.md` (v2) is the spec for the next three dispatches. After reading both, the operator can answer for every table: does it work, does it serve a purpose, what does it need, what should we do with it, and in what order.
