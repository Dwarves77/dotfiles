-- subject: Migration 384 (lane SEC-9, 2026-10-10): anon SELECT grants follow policy; the 49 public relations (44 tables and 5 views) where anon holds SELECT and no policy applies to anon or public lose it (REVOKE from PUBLIC, anon, GRANT back to authenticated and service_role), the 43 where a policy that applies to anon or public exists keep it and are listed here with that policy; the self-check attacks every one as anon, as authenticated and as the service role in a block that always rolls back.
-- 384 -- dead anon SELECT grants (lane SEC-9, 2026-10-10).
--
-- NOT APPLIED. Authored by lane SEC-9 with no database access; the coordinator's executor applies it after CI is green (two-track
-- policy, CLAUDE.md standing rule 3: schema DDL applies via the Supabase CLI before any dependent code commits). No code in src or
-- scripts changes. Sibling of 382 (SEC-8: the 18 literal-true SELECT policies and the identity tables), 381 (SEC-7: write
-- policies name their role) and 369 (SEC-3a: grant hygiene, which left anon SELECT untouched and asserted the count identical).
--
-- THE FINDING. After 382 anon holds a table-level SELECT grant on 92 public relations (information_schema.role_table_grants,
-- grantee anon, privilege_type SELECT, table_schema public; the count the coordinator read live after 382). AUD-AT-1's P1 matrix
-- returned rows on none of them once SEC-8 closed the 18 that did. [CONFIRMED by the tree derivation in this migration's test,
-- 384_dead_anon_select_grants.test.mjs: replaying every CREATE, DROP, RENAME, GRANT and REVOKE of the migration tree below 384
-- leaves exactly 92 public relations (87 tables, 5 views) with an anon SELECT grant; the set is derived on every test run.]
-- Supabase's default privileges give anon every privilege on every new public table, so a grant that no policy ever asked for
-- is the norm, not a decision; row level security is the only thing between anon and the rows, and a zero-row answer is a policy
-- accident (ADR-046: grant follows policy, constructive over detective; 382 did this for the reference tables).
--
-- THE RULE. A relation keeps anon SELECT only where pg_policies holds a SELECT or ALL policy whose roles include anon or the
-- implicit {public} (the policy admits anon by name or by default). Where none exists, the grant is dead (RLS admits nothing)
-- and goes. The 92 split three ways, each table named below with the policy that decides it:
--   1. BY DESIGN, 13 tables: a policy an unauthenticated request can satisfy (the predicate needs no authenticated identity, or
--      names a public branch). Published intelligence items and the child tables whose policy is EXISTS over a published item, and
--      public-by-privacy community groups with their posts and thread entities. KEPT.
--   2. KEPT, authenticated-only predicate, 30 tables: a policy with roles {public} whose predicate needs an authenticated
--      identity (auth.uid(), user_belongs_to_org, is_platform_admin, an org or group role helper), so anon is answered with zero
--      rows or, where the predicate subqueries a table anon cannot read, 42501. These tables satisfy the brief's rule (an anon
--      policy exists) and are not narrowed here: narrowing them is a policy rewrite (ALTER POLICY ... TO authenticated, service_role,
--      SEC-7's convention) and one of them, community_group_members, is subqueried by the kept community_posts and
--      community_thread_entities policies, so its grant must stay for the by-design reads to resolve. The follow-on is recorded in
--      the lane's session log with this list. The self-check below asserts anon reads zero rows or is refused on each.
--   3. DEAD, 49 relations: no policy applies to anon or public. REVOKE SELECT FROM PUBLIC, anon; GRANT SELECT back TO
--      authenticated, service_role (382's form: the revoke can never take a privilege the real principals rely on; a table-level
--      revoke also revokes any column-level SELECT anon held). The 5 views carry no policy; each reads only relations in this
--      list (census_rollup_by_surface: census_worklist and coverage_gap_census_findings; derived_values_admissible:
--      derived_values; emission_factor_candidates: emission_factors and licence_clear_sources; licence_clear_sources:
--      data_sources; propagation_queue_depth: propagation_events), so anon is refused through the base and the view grants are
--      dead too.
--
-- TWO LIVE-ONLY POLICIES, AND ONE STALE PROBE CELL. sector_contexts and intelligence_summaries carry out-of-band SELECT policies
-- (sector_contexts_read_authenticated, summaries_read_authenticated; docs/inventories/out-of-band-objects.md, in no migration
-- file). AUD-AT-1 probed both live (lines 195 and 152): anon S=R0/pp1, a policy applies to anon or public and answers zero rows,
-- while authenticated reads all 15 and 2040 rows. They are therefore kept (class 2), not dead, and the precondition below
-- re-checks that a policy applying to anon or public exists on each before anything is revoked. admin_action_cooldowns reads
-- pp1 in AT1 because its policy was {public} then; 381 narrowed it to authenticated, service_role, so it is dead (class 3) now.
-- Behaviour change to read before applying: two anon-key reads sit on revoked tables, fetchPriceStatsByItemIds in
-- src/lib/supabase-server.ts (published_price_statistics) and the sector_contexts read in fetchDashboardData. Both already
-- received zero rows (the policies are TO authenticated or the out-of-band one above); after this migration the anon-key client
-- receives 42501 instead of an empty set. The first logs the error and returns an empty map, the second reads data || [], so the
-- rendered result is unchanged; moving them to a session or service client is src, outside this
-- lane's write set, and is recorded in the lane's session log.
--
-- BY DESIGN, kept, with the policy that admits anon (13):
--   community_groups: community_groups_select_public_or_member (SELECT, roles {public})
--   community_posts: community_posts_select_inherits_group (SELECT, roles {public}); community_posts_select_member (SELECT, roles {public})
--   community_thread_entities: community_thread_entities_select_inherits_thread (SELECT, roles {public})
--   intelligence_changes: intelligence_changes_read (SELECT, roles {public})
--   intelligence_item_sections: intelligence_item_sections_read (SELECT, roles {public})
--   intelligence_items: intelligence_items_read (SELECT, roles {anon,authenticated})
--   item_changelog: item_changelog_read (SELECT, roles {public})
--   item_cross_references: item_cross_references_read (SELECT, roles {public})
--   item_disputes: item_disputes_read (SELECT, roles {public})
--   item_forward_events: item_forward_events_read (SELECT, roles {public})
--   item_supersessions: item_supersessions_read (SELECT, roles {public})
--   item_timelines: item_timelines_read (SELECT, roles {public})
--   obligations: obligations_read (SELECT, roles {public})
--
-- KEPT, policy applies to anon or public but needs an authenticated identity (30):
--   auxiliary_energy_profiles: auxiliary_energy_profiles_org_read (SELECT, roles {public})
--   bulk_imports: bulk_imports_read_authenticated (SELECT, roles {public})
--   canonical_source_candidates: canonical_source_candidates_admin_read (SELECT, roles {public})
--   community_group_invitations: community_group_invitations_select (SELECT, roles {public})
--   community_group_members: community_group_members_select_self_or_admin (SELECT, roles {public})
--   community_post_signoff_requests: signoff_select (SELECT, roles {public})
--   community_topic_groups: community_topic_groups_select_owner (SELECT, roles {public})
--   community_topics: community_topics_select_owner (SELECT, roles {public})
--   holdings_quality: holdings_quality_admin_read (SELECT, roles {public})
--   indexation_clauses: indexation_clauses_org_read (SELECT, roles {public})
--   ingest_rejections: ingest_rejections_read_platform_admin (SELECT, roles {public})
--   integrity_flags: integrity_flags_admin_read (SELECT, roles {public})
--   intelligence_summaries: summaries_read_authenticated (SELECT, out-of-band: docs/inventories/out-of-band-objects.md; AT1 probed anon S=R0/pp1, a policy applies to anon and answers zero rows)
--   item_workspace_tags: item_workspace_tags_org_read (SELECT, roles {public})
--   moderation_reports: moderation_reports_select (SELECT, roles {public})
--   notification_preferences: notification_preferences_select_self (SELECT, roles {public})
--   notifications: notifications_select_self (SELECT, roles {public})
--   org_invitations: org_invitations_admin_read (SELECT, roles {public})
--   org_member_bans: org_member_bans_select_owner_admin (SELECT, roles {public})
--   org_watchlist: org_watchlist_member_read (SELECT, roles {public})
--   pending_jurisdiction_review: pjr_read_platform_admin (SELECT, roles {public})
--   provisional_sources: provisional_sources_admin_read (SELECT, roles {public})
--   sector_contexts: sector_contexts_read_authenticated (SELECT, out-of-band: docs/inventories/out-of-band-objects.md; AT1 probed anon S=R0/pp1, a policy applies to anon and answers zero rows)
--   source_tier_opinions: source_tier_opinions_select_platform_admin (SELECT, roles {public})
--   user_item_state: user_item_state_select (SELECT, roles {public})
--   user_watchlist: user_watchlist_select (SELECT, roles {public})
--   vocabulary_mentions: vocabulary_mentions_admin_read (SELECT, roles {public})
--   vocabulary_terms: vocabulary_terms_admin_read (SELECT, roles {public})
--   workspace_item_overrides: overrides_read_org (SELECT, roles {public})
--   workspace_tags: workspace_tags_org_read (SELECT, roles {public})
--
-- REVOKED, no anon policy (49):
--   admin_action_cooldowns: no anon policy (its SELECT policies: service role full access {authenticated,service_role})
--   agent_run_searches: no anon policy (its SELECT policies: agent_run_searches_reconciler_select {reconciler})
--   agent_runs: no anon policy (its SELECT policies: agent_runs_service_role_all {service_role})
--   assumption_register: no anon policy (its SELECT policies: assumption_register_read {authenticated})
--   brief_apply_runs: no anon policy (no SELECT policy at all)
--   census_rollup_by_surface [view]: no anon policy (a view carries no policy; its base tables admit no anon read)
--   census_worklist: no anon policy (no SELECT policy at all)
--   claim_versions: no anon policy (no SELECT policy at all)
--   corpus_census: no anon policy (no SELECT policy at all)
--   corpus_turn_requests: no anon policy (its SELECT policies: corpus_turn_requests_admin_read {authenticated})
--   coverage_gap_candidates: no anon policy (no SELECT policy at all)
--   coverage_gap_census_findings: no anon policy (no SELECT policy at all)
--   data_sources: no anon policy (its SELECT policies: data_sources_read {authenticated})
--   derived_values: no anon policy (no SELECT policy at all)
--   derived_values_admissible [view]: no anon policy (a view carries no policy; its base tables admit no anon read)
--   disposition_ledger: no anon policy (no SELECT policy at all)
--   emission_factor_candidates [view]: no anon policy (a view carries no policy; its base tables admit no anon read)
--   emission_factors: no anon policy (its SELECT policies: emission_factors_read {authenticated})
--   error_events: no anon policy (its SELECT policies: error_events_admin_read {authenticated})
--   estimated_values: no anon policy (its SELECT policies: estimated_values_read {authenticated})
--   funded_pass_runlock: no anon policy (no SELECT policy at all)
--   gate_a_health_cache: no anon policy (no SELECT policy at all)
--   grid_connection_queues: no anon policy (its SELECT policies: grid_connection_queues_read {authenticated})
--   inference_records: no anon policy (no SELECT policy at all)
--   institutions: no anon policy (no SELECT policy at all)
--   intelligence_item_citations: no anon policy (no SELECT policy at all)
--   intelligence_item_versions: no anon policy (its SELECT policies: iiv_service_role_select_insert {service_role})
--   item_correction_evidence: no anon policy (its SELECT policies: item_correction_evidence_admin_read {authenticated})
--   item_corrections: no anon policy (its SELECT policies: item_corrections_admin_read {authenticated})
--   item_gate_a_state: no anon policy (its SELECT policies: item_gate_a_state_service_role_all {service_role})
--   item_type_required_slots: no anon policy (its SELECT policies: item_type_required_slots_reconciler_select {reconciler})
--   licence_clear_sources [view]: no anon policy (a view carries no policy; its base tables admit no anon read)
--   market_series: no anon policy (its SELECT policies: market_series_read {authenticated})
--   mutation_leases: no anon policy (no SELECT policy at all)
--   oem_tech_roadmaps: no anon policy (its SELECT policies: oem_tech_roadmaps_read {authenticated})
--   portal_link_candidates: no anon policy (no SELECT policy at all)
--   propagation_events: no anon policy (no SELECT policy at all)
--   propagation_queue_depth [view]: no anon policy (a view carries no policy; its base tables admit no anon read)
--   published_price_statistics: no anon policy (its SELECT policies: published_price_statistics_read {authenticated})
--   raw_fetches: no anon policy (its SELECT policies: raw_fetches_service_role_all {service_role})
--   reroute_events: no anon policy (its SELECT policies: reroute_events_read {authenticated})
--   research_assessments: no anon policy (no SELECT policy at all)
--   section_claim_provenance: no anon policy (its SELECT policies: section_claim_provenance_reconciler_select {reconciler})
--   source_bias_tags: no anon policy (no SELECT policy at all)
--   source_reliability_ledger: no anon policy (no SELECT policy at all)
--   staged_updates: no anon policy (no SELECT policy at all)
--   statutory_computations: no anon policy (its SELECT policies: statutory_computations_read {authenticated})
--   system_state: no anon policy (no SELECT policy at all)
--   system_state_flag_audit: no anon policy (no SELECT policy at all)
--
-- NOT TOUCHED: research_assessments_current (369 revoked its anon SELECT), profiles (372), the 18 reference tables and
-- org_memberships, organizations, workspace_settings (382); anon INSERT, UPDATE, DELETE, TRUNCATE (369, 381); default privileges
-- (369 section 3 owns them); column-level grants other than through the table-level revoke; policies (this migration changes none).
--
-- Reversible in intent (do not, it re-opens anonymous reads): GRANT SELECT ON public.<table> TO anon for each table in the dead
-- array below.

BEGIN;

-- ---- Part 1 precondition: the classification still holds on the database being migrated -------------------------------------
DO $pre$
DECLARE
  v_dead text[] := ARRAY[
    'admin_action_cooldowns',
    'agent_run_searches',
    'agent_runs',
    'assumption_register',
    'brief_apply_runs',
    'census_rollup_by_surface',
    'census_worklist',
    'claim_versions',
    'corpus_census',
    'corpus_turn_requests',
    'coverage_gap_candidates',
    'coverage_gap_census_findings',
    'data_sources',
    'derived_values',
    'derived_values_admissible',
    'disposition_ledger',
    'emission_factor_candidates',
    'emission_factors',
    'error_events',
    'estimated_values',
    'funded_pass_runlock',
    'gate_a_health_cache',
    'grid_connection_queues',
    'inference_records',
    'institutions',
    'intelligence_item_citations',
    'intelligence_item_versions',
    'item_correction_evidence',
    'item_corrections',
    'item_gate_a_state',
    'item_type_required_slots',
    'licence_clear_sources',
    'market_series',
    'mutation_leases',
    'oem_tech_roadmaps',
    'portal_link_candidates',
    'propagation_events',
    'propagation_queue_depth',
    'published_price_statistics',
    'raw_fetches',
    'reroute_events',
    'research_assessments',
    'section_claim_provenance',
    'source_bias_tags',
    'source_reliability_ledger',
    'staged_updates',
    'statutory_computations',
    'system_state',
    'system_state_flag_audit'
  ];
  v_design text[] := ARRAY[
    'community_groups',
    'community_posts',
    'community_thread_entities',
    'intelligence_changes',
    'intelligence_item_sections',
    'intelligence_items',
    'item_changelog',
    'item_cross_references',
    'item_disputes',
    'item_forward_events',
    'item_supersessions',
    'item_timelines',
    'obligations'
  ];
  v_authonly text[] := ARRAY[
    'auxiliary_energy_profiles',
    'bulk_imports',
    'canonical_source_candidates',
    'community_group_invitations',
    'community_group_members',
    'community_post_signoff_requests',
    'community_topic_groups',
    'community_topics',
    'holdings_quality',
    'indexation_clauses',
    'ingest_rejections',
    'integrity_flags',
    'intelligence_summaries',
    'item_workspace_tags',
    'moderation_reports',
    'notification_preferences',
    'notifications',
    'org_invitations',
    'org_member_bans',
    'org_watchlist',
    'pending_jurisdiction_review',
    'provisional_sources',
    'sector_contexts',
    'source_tier_opinions',
    'user_item_state',
    'user_watchlist',
    'vocabulary_mentions',
    'vocabulary_terms',
    'workspace_item_overrides',
    'workspace_tags'
  ];
  v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY v_dead || v_design || v_authonly LOOP
    IF to_regclass('public.' || quote_ident(v_tbl)) IS NULL THEN
      RAISE EXCEPTION 'ABORT: public.% does not exist on this database', v_tbl;
    END IF;
  END LOOP;
  FOREACH v_tbl IN ARRAY v_dead LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = v_tbl AND p.cmd IN ('SELECT', 'ALL') AND p.roles && ARRAY['anon', 'public']::name[]
    ) THEN
      RAISE EXCEPTION 'ABORT: public.% now has a SELECT policy that applies to anon or public: it is no longer a dead grant, review it before revoking', v_tbl;
    END IF;
  END LOOP;
  FOREACH v_tbl IN ARRAY v_design || v_authonly LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = v_tbl AND p.cmd IN ('SELECT', 'ALL') AND p.roles && ARRAY['anon', 'public']::name[]
    ) THEN
      RAISE EXCEPTION 'ABORT: public.% has no SELECT policy that applies to anon or public: it is not a kept grant', v_tbl;
    END IF;
  END LOOP;
END
$pre$;

-- ---- Part 2: grant follows policy -----------------------------------------------------------------------------------------
DO $rev$
DECLARE
  v_dead text[] := ARRAY[
    'admin_action_cooldowns',
    'agent_run_searches',
    'agent_runs',
    'assumption_register',
    'brief_apply_runs',
    'census_rollup_by_surface',
    'census_worklist',
    'claim_versions',
    'corpus_census',
    'corpus_turn_requests',
    'coverage_gap_candidates',
    'coverage_gap_census_findings',
    'data_sources',
    'derived_values',
    'derived_values_admissible',
    'disposition_ledger',
    'emission_factor_candidates',
    'emission_factors',
    'error_events',
    'estimated_values',
    'funded_pass_runlock',
    'gate_a_health_cache',
    'grid_connection_queues',
    'inference_records',
    'institutions',
    'intelligence_item_citations',
    'intelligence_item_versions',
    'item_correction_evidence',
    'item_corrections',
    'item_gate_a_state',
    'item_type_required_slots',
    'licence_clear_sources',
    'market_series',
    'mutation_leases',
    'oem_tech_roadmaps',
    'portal_link_candidates',
    'propagation_events',
    'propagation_queue_depth',
    'published_price_statistics',
    'raw_fetches',
    'reroute_events',
    'research_assessments',
    'section_claim_provenance',
    'source_bias_tags',
    'source_reliability_ledger',
    'staged_updates',
    'statutory_computations',
    'system_state',
    'system_state_flag_audit'
  ];
  v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY v_dead LOOP
    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM PUBLIC, anon', v_tbl);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role', v_tbl);
  END LOOP;
END
$rev$;

-- ---- Part 3: the enumeration as assertion ---------------------------------------------------------------------------------
-- Every relation in public where anon holds SELECT now has a SELECT or ALL policy that applies to anon or public, and the set of
-- those relations is exactly the kept set. A grant this migration missed (a relation created out of band, a grant added since
-- the tree was read) fails the apply and is named.
DO $enum$
DECLARE
  v_design text[] := ARRAY[
    'community_groups',
    'community_posts',
    'community_thread_entities',
    'intelligence_changes',
    'intelligence_item_sections',
    'intelligence_items',
    'item_changelog',
    'item_cross_references',
    'item_disputes',
    'item_forward_events',
    'item_supersessions',
    'item_timelines',
    'obligations'
  ];
  v_authonly text[] := ARRAY[
    'auxiliary_energy_profiles',
    'bulk_imports',
    'canonical_source_candidates',
    'community_group_invitations',
    'community_group_members',
    'community_post_signoff_requests',
    'community_topic_groups',
    'community_topics',
    'holdings_quality',
    'indexation_clauses',
    'ingest_rejections',
    'integrity_flags',
    'intelligence_summaries',
    'item_workspace_tags',
    'moderation_reports',
    'notification_preferences',
    'notifications',
    'org_invitations',
    'org_member_bans',
    'org_watchlist',
    'pending_jurisdiction_review',
    'provisional_sources',
    'sector_contexts',
    'source_tier_opinions',
    'user_item_state',
    'user_watchlist',
    'vocabulary_mentions',
    'vocabulary_terms',
    'workspace_item_overrides',
    'workspace_tags'
  ];
  v_bad  text;
  v_diff text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_bad
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND has_table_privilege('anon', c.oid, 'SELECT')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.cmd IN ('SELECT', 'ALL') AND p.roles && ARRAY['anon', 'public']::name[]
     );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: anon still holds SELECT on public relations that no policy applies to: %', v_bad;
  END IF;

  SELECT string_agg(x.relname, ', ' ORDER BY x.relname) INTO v_diff
    FROM (
      SELECT c.relname FROM pg_class c
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND has_table_privilege('anon', c.oid, 'SELECT')
         AND NOT (c.relname = ANY (v_design || v_authonly))
      UNION ALL
      SELECT t FROM unnest(v_design || v_authonly) AS t
       WHERE NOT has_table_privilege('anon', ('public.' || quote_ident(t))::regclass, 'SELECT')
    ) x;
  IF v_diff IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: the set of public relations anon can SELECT differs from the kept set: %', v_diff;
  END IF;
END
$enum$;

-- ---- Self-check: attack every relation as anon, as authenticated and as the service role, rolled back --------------------
-- sec9_try runs one statement as anon, authenticated (a fixture JWT subject that is no user) or service_role and returns
-- 'ok:<rows>' or 'err:<sqlstate>:<first line of the message>'; sec9_expect raises ABORT when the result does not match a LIKE
-- pattern; sec9_expect_none accepts exactly zero rows or a 42501 refusal.
CREATE FUNCTION pg_temp.sec9_try(p_role text, p_uid uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  v_rows integer;
BEGIN
  IF p_role = 'service_role' THEN
    SET LOCAL ROLE service_role;
  ELSIF p_role = 'anon' THEN
    SET LOCAL ROLE anon;
  ELSE
    SET LOCAL ROLE authenticated;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', p_role)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    RETURN 'ok:' || v_rows::text;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN 'err:' || SQLSTATE || ':' || split_part(SQLERRM, E'\n', 1);
  END;
END;
$f$;

CREATE FUNCTION pg_temp.sec9_expect(p_label text, p_got text, p_want_like text)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  IF p_got NOT LIKE p_want_like THEN
    RAISE EXCEPTION 'ABORT: % expected % but got %', p_label, p_want_like, p_got;
  END IF;
END;
$f$;

CREATE FUNCTION pg_temp.sec9_expect_none(p_label text, p_got text)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  IF p_got <> 'ok:0' AND p_got NOT LIKE 'err:42501:%' THEN
    RAISE EXCEPTION 'ABORT: % expected zero rows or a 42501 refusal but got %', p_label, p_got;
  END IF;
END;
$f$;

DO $sc$
DECLARE
  v_dead text[] := ARRAY[
    'admin_action_cooldowns',
    'agent_run_searches',
    'agent_runs',
    'assumption_register',
    'brief_apply_runs',
    'census_rollup_by_surface',
    'census_worklist',
    'claim_versions',
    'corpus_census',
    'corpus_turn_requests',
    'coverage_gap_candidates',
    'coverage_gap_census_findings',
    'data_sources',
    'derived_values',
    'derived_values_admissible',
    'disposition_ledger',
    'emission_factor_candidates',
    'emission_factors',
    'error_events',
    'estimated_values',
    'funded_pass_runlock',
    'gate_a_health_cache',
    'grid_connection_queues',
    'inference_records',
    'institutions',
    'intelligence_item_citations',
    'intelligence_item_versions',
    'item_correction_evidence',
    'item_corrections',
    'item_gate_a_state',
    'item_type_required_slots',
    'licence_clear_sources',
    'market_series',
    'mutation_leases',
    'oem_tech_roadmaps',
    'portal_link_candidates',
    'propagation_events',
    'propagation_queue_depth',
    'published_price_statistics',
    'raw_fetches',
    'reroute_events',
    'research_assessments',
    'section_claim_provenance',
    'source_bias_tags',
    'source_reliability_ledger',
    'staged_updates',
    'statutory_computations',
    'system_state',
    'system_state_flag_audit'
  ];
  v_design text[] := ARRAY[
    'community_groups',
    'community_posts',
    'community_thread_entities',
    'intelligence_changes',
    'intelligence_item_sections',
    'intelligence_items',
    'item_changelog',
    'item_cross_references',
    'item_disputes',
    'item_forward_events',
    'item_supersessions',
    'item_timelines',
    'obligations'
  ];
  v_authonly text[] := ARRAY[
    'auxiliary_energy_profiles',
    'bulk_imports',
    'canonical_source_candidates',
    'community_group_invitations',
    'community_group_members',
    'community_post_signoff_requests',
    'community_topic_groups',
    'community_topics',
    'holdings_quality',
    'indexation_clauses',
    'ingest_rejections',
    'integrity_flags',
    'intelligence_summaries',
    'item_workspace_tags',
    'moderation_reports',
    'notification_preferences',
    'notifications',
    'org_invitations',
    'org_member_bans',
    'org_watchlist',
    'pending_jurisdiction_review',
    'provisional_sources',
    'sector_contexts',
    'source_tier_opinions',
    'user_item_state',
    'user_watchlist',
    'vocabulary_mentions',
    'vocabulary_terms',
    'workspace_item_overrides',
    'workspace_tags'
  ];
  v_tbl text;
  v_oid oid;
  v_uid uuid := gen_random_uuid();
BEGIN
  BEGIN
    -- ======== A. the catalog: grants, and an anon policy behind every kept grant ========
    FOREACH v_tbl IN ARRAY v_dead LOOP
      v_oid := to_regclass('public.' || quote_ident(v_tbl));
      IF has_any_column_privilege('anon', v_oid, 'SELECT') THEN
        RAISE EXCEPTION 'ABORT: anon still holds SELECT (table or column level) on public.%', v_tbl;
      END IF;
      IF NOT has_table_privilege('authenticated', v_oid, 'SELECT') OR NOT has_table_privilege('service_role', v_oid, 'SELECT') THEN
        RAISE EXCEPTION 'ABORT: authenticated or service_role lost SELECT on public.%', v_tbl;
      END IF;
    END LOOP;
    FOREACH v_tbl IN ARRAY v_design || v_authonly LOOP
      v_oid := to_regclass('public.' || quote_ident(v_tbl));
      IF NOT has_table_privilege('anon', v_oid, 'SELECT') THEN
        RAISE EXCEPTION 'ABORT: anon lost SELECT on kept public.%', v_tbl;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = v_tbl AND p.cmd IN ('SELECT', 'ALL') AND p.roles && ARRAY['anon', 'public']::name[]
      ) THEN
        RAISE EXCEPTION 'ABORT: kept public.% has an anon SELECT grant and no policy that applies to anon or public', v_tbl;
      END IF;
    END LOOP;

    -- ======== B. every relation attacked as anon, with the controls ========
    FOREACH v_tbl IN ARRAY v_dead LOOP
      PERFORM pg_temp.sec9_expect('B anon SELECT on ' || v_tbl,
        pg_temp.sec9_try('anon', NULL, format('SELECT 1 FROM public.%I LIMIT 1', v_tbl)),
        'err:42501:permission denied for %');
      PERFORM pg_temp.sec9_expect('B service_role SELECT on ' || v_tbl,
        pg_temp.sec9_try('service_role', NULL, format('SELECT 1 FROM public.%I LIMIT 1', v_tbl)),
        'ok:%');
      PERFORM pg_temp.sec9_expect('B control: authenticated SELECT on ' || v_tbl,
        pg_temp.sec9_try('authenticated', v_uid, format('SELECT 1 FROM public.%I LIMIT 1', v_tbl)),
        'ok:%');
    END LOOP;
    FOREACH v_tbl IN ARRAY v_design LOOP
      PERFORM pg_temp.sec9_expect('B anon SELECT on kept ' || v_tbl,
        pg_temp.sec9_try('anon', NULL, format('SELECT 1 FROM public.%I LIMIT 1', v_tbl)),
        'ok:%');
      PERFORM pg_temp.sec9_expect('B control: authenticated SELECT on kept ' || v_tbl,
        pg_temp.sec9_try('authenticated', v_uid, format('SELECT 1 FROM public.%I LIMIT 1', v_tbl)),
        'ok:%');
    END LOOP;
    FOREACH v_tbl IN ARRAY v_authonly LOOP
      PERFORM pg_temp.sec9_expect_none('B anon SELECT on kept authenticated-only ' || v_tbl,
        pg_temp.sec9_try('anon', NULL, format('SELECT 1 FROM public.%I LIMIT 1', v_tbl)));
    END LOOP;

    RAISE EXCEPTION 'sec9_384_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM <> 'sec9_384_selfcheck_rollback' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'migration 384 OK: % relations lost the anon SELECT grant, % keep it by design, % keep it behind an authenticated-only policy; anon reads none of the revoked ones, authenticated and the service role still do', cardinality(v_dead), cardinality(v_design), cardinality(v_authonly);
END $sc$;

DROP FUNCTION pg_temp.sec9_try(text, uuid, text);
DROP FUNCTION pg_temp.sec9_expect(text, text, text);
DROP FUNCTION pg_temp.sec9_expect_none(text, text);

COMMIT;
