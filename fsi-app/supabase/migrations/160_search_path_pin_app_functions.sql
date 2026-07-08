-- Migration 160: pin search_path on all 56 APP-OWNED public functions (S1-12 residual).
--
-- APPLIED 2026-07-08 — DELEGATED-WITH-PROOF per dispatch (reclassifies THIS migration's
-- operator-window status; see ADR-011). Prior status was "reviewed companion, break-risky, never a
-- live-prod sweep"; the dispatch delegated it with a mandatory before/after proof, which passed:
--   app-owned unpinned functions 56 -> 0; customer read path UNCHANGED (listings 251->251, market
--   78->78, research 43->43, _workspace_active_items 251->251, via a simulated authed member);
--   non-gated search_intelligence_items 30/30, validate_item_provenance valid, detect_intersections
--   50 all unchanged; advisor function_search_path_mutable 168 mentions -> 0. Ledger row 160 carries
--   the identity apply-record. Reversible per function: ALTER FUNCTION ... RESET search_path.
--
-- CENSUS RECONCILED (2026-07-07, live pg_proc): 165 public functions lack a pinned search_path,
-- but 109 of them are EXTENSION-OWNED (pg_depend deptype='e' — pg_trgm etc. living in public).
-- Extension members are deliberately EXCLUDED: extension upgrades overwrite them, they are not
-- app code, and altering them is churn. The app-owned set is 56 — exactly the advisor's original
-- count, resolving the earlier "advisor said 56, live says 165" discrepancy (the advisor counts
-- app-owned only). 26 of the 56 are SECURITY DEFINER (the set where an unpinned search_path is a
-- real privilege-escalation lint), the rest are invoker-rights RPCs/triggers pinned for hygiene.
--
-- PIN CHOICE (minimal-change, break-safe): `public, extensions, pg_temp` — the database default
-- ('"$user", public, extensions') minus `"$user"` (the role-controlled injection vector). Every
-- unqualified reference that resolved before resolves identically after; explicit schema
-- references (auth.*) are unaffected by search_path at all. This is deliberately NOT the strict
-- `search_path = ''` form, which would require auditing every body for unqualified references —
-- the break-risk the standing ruling exists to avoid.
--
-- GENERATION: mechanical, from live pg_proc via pg_get_function_identity_arguments (overload-safe)
-- with the extension-member exclusion. Re-generate before applying if the window is far out:
--   SELECT 'ALTER FUNCTION public.' || quote_ident(p.proname) || '(' ||
--          pg_get_function_identity_arguments(p.oid) || ') SET search_path = public, extensions, pg_temp;'
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.prokind IN ('f','p')
--      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
--      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
--
-- POST-APPLY VERIFICATION (run in the window):
--   1. The generator query above returns 0 rows.
--   2. Behavioral smoke: SELECT (validate_item_provenance('<any-id>')).valid;  -- gate fn works
--      SELECT count(*) FROM get_workspace_intelligence_listings('<org-id>');   -- dashboard RPC works
--      SELECT count(*) FROM search_intelligence_items('packaging', 5);          -- FTS RPC works
--   3. get_advisors(security): function_search_path_mutable count drops to 0 app-owned.
--
-- Reversible per function: ALTER FUNCTION ... RESET search_path;

BEGIN;

ALTER FUNCTION public._assert_org_membership(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public._classify_jurisdiction_token(token text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public._derive_jurisdiction_iso_from_canonical(canonical_jurisdictions text[]) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public._guard_source_archive() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public._mirror_profiles_to_user_profiles() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public._mirror_user_profiles_to_profiles() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public._normalize_jurisdictions(input text[]) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public._url_host(u text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public._workspace_active_items(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.accept_invitation(p_token text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.admin_attention_counts() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.canonicalize_citation_url(u text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.coverage_matrix() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.create_org_for_self(p_org_name text, p_org_slug text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.decline_invitation(p_token text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.derive_source_category(p_role text, p_name text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.derive_source_intelligence_types(p_category text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.detect_intersections(min_strength integer, max_results integer) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_all_surface_counts(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_market_intel_items(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_operations_items(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_research_items(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_surface_counts(p_org_id uuid, p_surface text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_technology_items(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_tier_opinion_disagreements(window_days integer) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_workspace_intelligence(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_workspace_intelligence_aggregates(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_workspace_intelligence_aggregates_scoped(p_org_id uuid, p_scope_filter jsonb) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_workspace_intelligence_dashboard(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_workspace_intelligence_listings(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_workspace_intelligence_slim(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_workspace_members(p_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.guard_provenance_flip() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.lookup_invitation(p_token text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.recompute_agent_integrity_flag() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.recompute_source_accuracy() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.region_dimension_coverage_sync_fact_count() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.related_items_derived(p_item uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.revoke_invitation(p_invitation_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_provenance_status() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_source_label() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.stamp_prov_origin() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.surface_of(p_item_type text, p_domain integer) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.sync_sources_tier_columns() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_case_study_validation_count() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_community_group_member_count() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_community_post_reply_count() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_section_thread_count() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_thread_reply_count() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_updated_at() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_vendor_endorsement_count() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.user_belongs_to_org(check_org_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.user_is_group_admin(_group_id uuid, _user_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.user_is_group_member(_group_id uuid, _user_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.user_owns_group(_group_id uuid, _user_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.validate_item_provenance(p_item_id uuid) SET search_path = public, extensions, pg_temp;

COMMIT;
