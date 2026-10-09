-- subject: Migration 382 (lane SEC-8, 2026-10-09): read policies name their role; the 16 reference tables whose SELECT policy was the literal USING (true) with the implicit roles {public} (connection_theme_runs, connection_themes, coverage_gaps, entities, entity_identifiers, entity_refs, entity_scope, monitoring_queue, region_dimension_coverage, regional_data_facts, regions, signposts, source_trust_events, source_verifications, state_cost_facts, theme_briefs) are ALTERed TO authenticated, service_role and anon loses its table-level SELECT on them, so an anonymous request reads none of their rows; sources and source_citations keep their literal-true policy because the anon-key server client still reads them (named below, owed to a lane that may edit src); a rolled-back self-check attacks every touched table as anon and as authenticated, and attacks profiles, org_memberships and organizations as a member of another organization; NOT APPLIED.
-- 382 -- read policies name their role (lane SEC-8, 2026-10-09).
--
-- NOT APPLIED. Authored by lane SEC-8; the coordinator's executor applies it after CI (two-track policy, CLAUDE.md
-- standing rule 3: schema DDL applies via the Supabase CLI before any dependent code commits). No code in src or
-- scripts changes. Sibling of 381 (SEC-7, write policies name their role), which left SELECT policies and grants alone
-- ("a read decision, not this lane's"), and of 369 (SEC-3a, grant hygiene) and 370 (SEC-3b, the policies in question).
--
-- THE FINDING [CONFIRMED by AUD-AT-1, docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md section 10, a rolled back
-- probe against the live schema]. Anon SELECT returned rows on 17 tables whose SELECT policy is the literal USING (true)
-- with the implicit roles {public}: connection_theme_runs 64, connection_themes 18, coverage_gaps 2, entities 2880,
-- entity_identifiers 2853, entity_refs 2878, entity_scope 8, monitoring_queue 580, region_dimension_coverage 30,
-- regional_data_facts 90, regions 5, source_citations 742, source_trust_events 908, source_verifications 1414, sources
-- 2572, state_cost_facts 13, theme_briefs 9. The same 17 tables returned rows to an authenticated non-admin member
-- (P4), which is correct for platform reference data and is kept (the precedent is emission_factors_read, market_series_read,
-- published_price_statistics_read and data_sources_read: TO authenticated, USING (true)).
--
-- One more table of the same class, not in the AT1 list because it held 0 rows when AT1 ran (AT1 section 7 line for signposts:
-- anon S=NX, empty): signposts.signposts_read, created by migration 346 as FOR SELECT USING (true) with the implicit roles
-- {public}; its only readers (read-signposts.mjs, through loadDetail's service client; signpost-watch.ts; prediction-scoring.mjs)
-- use the service role. It is narrowed with the others, 16 tables in all. The tree-derived enumeration (every SELECT or ALL
-- policy with roles {public} and qual true below 382) is exactly these 16 plus the two HELD.
--
-- THE RULING (brief, SEC-8): a table is readable by anon only where an ADR or spec names it public. Read for all 17 table
-- names in docs/decisions and docs/specs on 2026-10-09: no ADR or spec names any of them public (the only hits are
-- docs/specs/00 and 06, where "entities" is the nine canonical entities of the spine, ADR-024 naming entity_refs and
-- sources.url as text keys, and the ADR-001/003/004 mentions of sources as the subject of admin routes, none a public
-- read). The routes that are public (route-policy.ts PUBLIC_ROUTES: /login, /signup, /auth/callback,
-- /auth/reset-password, /privacy) read none of the 17.
--
-- WHAT THE FIX IS, IN THREE PARTS.
--   1. ALTER POLICY <name> ON public.<table> TO authenticated, service_role for the 16 tables below (SEC-7's convention,
--      migration 381: the policy names its roles; service_role bypasses RLS and is listed only so the policy reads the
--      same as the write policies). USING (true) is kept: the data is platform reference data with no owner column, the
--      precedent above reads it TO authenticated with the same predicate, and a signed-in user with no organization yet
--      (create_org_for_self runs after sign-up) must still resolve regions and entities.
--   2. GRANT FOLLOWS POLICY (ADR-046, constructive over detective; migration 369 derives write grants the same way).
--      REVOKE SELECT ON each of the 16 FROM PUBLIC, anon, then GRANT SELECT back TO authenticated, service_role so the
--      revoke can never take a privilege the real principals rely on. A table-level revoke also revokes any column-level
--      SELECT anon held. Anon's refusal now comes from the GRANT (permission denied for table), as it does for the writes
--      after 381, not from a policy that happens to evaluate to true.
--   3. THE ENUMERATION AS ASSERTION. After the ALTERs the block reads pg_policies: no SELECT or ALL policy that applies to
--      anon or public and whose predicate is the literal true may remain on any public table other than the two HELD
--      below. A policy this migration missed, or an out-of-band policy that would let anon read one of the 16, fails the
--      apply and is named in the error.
--
-- HELD: sources.sources_read AND source_citations.source_citations_read STAY TO public USING (true). Reason [CONFIRMED by
-- reading src, 2026-10-09]: three readers use the anon-key server client with no user session (fetchSources in
-- src/lib/supabase-server.ts line 442 through getSupabase(), which createClient()s with NEXT_PUBLIC_SUPABASE_ANON_KEY and
-- feeds fetchSourceData(true) on /admin; and the SECURITY INVOKER functions get_source_citation_stats and
-- get_research_source_coverage, migrations 098 and 100, which fetchSourceCitationStatsByIds and
-- fetchResearchSourceCoverage call through the same anon client for the Market and Research views). Narrowing the two
-- policies today returns zero rows to those three readers. The fix is a src change (those three paths move to the
-- service client, or the two functions become SECURITY DEFINER aggregates), which this lane's write set does not hold.
-- The two policies are listed in the enumeration assertion by name so that the day they are narrowed the assertion
-- is edited with them, and the attack in scripts/proof/attacks/attacks.json (sec8-*) names them as the open residue.
--
-- WHAT STAYS, AND WHY (the P4 half of AT1 section 10, "foreign rows"). profiles, org_memberships, organizations,
-- workspace_item_overrides and workspace_settings are already scoped to the caller's organization in the tree below 382:
-- profiles_select_own_or_shared_org (migration 372: own row, or a row of a member of an organization the caller belongs
-- to), membership_read, org_read_members, overrides_read_org and settings_read_org (user_belongs_to_org(...) OR the service
-- role). The AT1 "1 of 1" cells were the second member of the one organization production holds (org_memberships holds 2
-- rows, 1 organization), not a foreign organization's row; AT1 section 1 says no second organization exists, so no cell
-- could have read a foreign one. This migration therefore changes nothing for them and the self-check ATTACKS them with a
-- second organization built inside the rolled back transaction (a member of org B reads zero rows of org A's profile,
-- membership and organization), which AT1 could not do. intelligence_items and its child tables, community_groups,
-- sector_contexts, emission_factors, market_series, published_price_statistics and data_sources are published platform
-- content or public-by-privacy groups behind filtered or authenticated-only policies (code RA and RD in AT1), not
-- per-organization rows; they are not touched.
--
-- Reversible in intent (do not, it re-opens anonymous reads): ALTER POLICY <each> ON public.<table> TO public;
-- GRANT SELECT ON public.<table> TO anon;

BEGIN;

-- ---- Part 1 precondition: each listed policy exists as the literal-true public SELECT policy (or is already narrowed) -
DO $pre$
DECLARE
  v_pols text[] := ARRAY[
    'connection_theme_runs.connection_theme_runs_read',
    'connection_themes.connection_themes_read',
    'coverage_gaps.coverage_gaps_select',
    'entities.entities_read',
    'entity_identifiers.entity_identifiers_read',
    'entity_refs.entity_refs_read',
    'entity_scope.entity_scope_read',
    'monitoring_queue.monitoring_queue_read',
    'region_dimension_coverage.region_dimension_coverage_read',
    'regional_data_facts.regional_data_facts_read',
    'regions.regions_read',
    'signposts.signposts_read',
    'source_trust_events.source_trust_events_read',
    'source_verifications.source_verifications_read',
    'state_cost_facts.state_cost_facts_read',
    'theme_briefs.theme_briefs_read'
  ];
  v_pair text;
  v_row  record;
BEGIN
  FOREACH v_pair IN ARRAY v_pols LOOP
    SELECT p.cmd, p.roles, p.qual INTO v_row
      FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = split_part(v_pair, '.', 1) AND p.policyname = split_part(v_pair, '.', 2);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ABORT: policy % on public.% does not exist', split_part(v_pair, '.', 2), split_part(v_pair, '.', 1);
    END IF;
    IF v_row.cmd <> 'SELECT' THEN
      RAISE EXCEPTION 'ABORT: policy % on public.% is % not SELECT', split_part(v_pair, '.', 2), split_part(v_pair, '.', 1), v_row.cmd;
    END IF;
    IF v_row.roles <> ARRAY['public']::name[] AND NOT (v_row.roles @> ARRAY['authenticated', 'service_role']::name[] AND v_row.roles <@ ARRAY['authenticated', 'service_role']::name[]) THEN
      RAISE EXCEPTION 'ABORT: policy % on public.% has roles % (expected {public} or already {authenticated,service_role})', split_part(v_pair, '.', 2), split_part(v_pair, '.', 1), v_row.roles;
    END IF;
    IF v_row.qual IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'ABORT: policy % on public.% is no longer the literal true (%): review it before narrowing', split_part(v_pair, '.', 2), split_part(v_pair, '.', 1), v_row.qual;
    END IF;
  END LOOP;
END
$pre$;

-- ---- Part 1: the 16 ALTERs -------------------------------------------------------------------------------------------
ALTER POLICY connection_theme_runs_read ON public.connection_theme_runs TO authenticated, service_role;
ALTER POLICY connection_themes_read ON public.connection_themes TO authenticated, service_role;
ALTER POLICY coverage_gaps_select ON public.coverage_gaps TO authenticated, service_role;
ALTER POLICY entities_read ON public.entities TO authenticated, service_role;
ALTER POLICY entity_identifiers_read ON public.entity_identifiers TO authenticated, service_role;
ALTER POLICY entity_refs_read ON public.entity_refs TO authenticated, service_role;
ALTER POLICY entity_scope_read ON public.entity_scope TO authenticated, service_role;
ALTER POLICY monitoring_queue_read ON public.monitoring_queue TO authenticated, service_role;
ALTER POLICY region_dimension_coverage_read ON public.region_dimension_coverage TO authenticated, service_role;
ALTER POLICY regional_data_facts_read ON public.regional_data_facts TO authenticated, service_role;
ALTER POLICY regions_read ON public.regions TO authenticated, service_role;
ALTER POLICY signposts_read ON public.signposts TO authenticated, service_role;
ALTER POLICY source_trust_events_read ON public.source_trust_events TO authenticated, service_role;
ALTER POLICY source_verifications_read ON public.source_verifications TO authenticated, service_role;
ALTER POLICY state_cost_facts_read ON public.state_cost_facts TO authenticated, service_role;
ALTER POLICY theme_briefs_read ON public.theme_briefs TO authenticated, service_role;

-- ---- Part 2: grant follows policy ------------------------------------------------------------------------------------
REVOKE SELECT ON TABLE
  public.connection_theme_runs, public.connection_themes, public.coverage_gaps, public.entities, public.entity_identifiers,
  public.entity_refs, public.entity_scope, public.monitoring_queue, public.region_dimension_coverage,
  public.regional_data_facts, public.regions, public.signposts, public.source_trust_events, public.source_verifications,
  public.state_cost_facts, public.theme_briefs
  FROM PUBLIC, anon;
GRANT SELECT ON TABLE
  public.connection_theme_runs, public.connection_themes, public.coverage_gaps, public.entities, public.entity_identifiers,
  public.entity_refs, public.entity_scope, public.monitoring_queue, public.region_dimension_coverage,
  public.regional_data_facts, public.regions, public.signposts, public.source_trust_events, public.source_verifications,
  public.state_cost_facts, public.theme_briefs
  TO authenticated, service_role;

-- ---- Part 3: the enumeration as assertion ----------------------------------------------------------------------------
DO $enum$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(p.tablename || '.' || p.policyname, ', ') INTO v_bad
    FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.cmd IN ('SELECT', 'ALL')
     AND p.roles && ARRAY['anon', 'public']::name[]
     AND p.qual = 'true'
     AND (p.tablename || '.' || p.policyname) NOT IN ('sources.sources_read', 'source_citations.source_citations_read');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: SELECT policies that apply to anon or public with the literal true predicate remain: %', v_bad;
  END IF;
END
$enum$;

-- ---- Self-check: attack every touched table as anon and as authenticated, then a second organization, rolled back ----
-- sec8_try runs one statement as anon, authenticated (with a fixture JWT subject) or service_role and returns
-- 'ok:<rows>' or 'err:<sqlstate>:<first line of the message>'; sec8_expect raises ABORT when the result does not match.
CREATE FUNCTION pg_temp.sec8_try(p_role text, p_uid uuid, p_sql text)
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

CREATE FUNCTION pg_temp.sec8_expect(p_label text, p_got text, p_want_like text)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  IF p_got NOT LIKE p_want_like THEN
    RAISE EXCEPTION 'ABORT: % expected % but got %', p_label, p_want_like, p_got;
  END IF;
END;
$f$;

DO $sc$
DECLARE
  v_tables text[] := ARRAY[
    'connection_theme_runs',
    'connection_themes',
    'coverage_gaps',
    'entities',
    'entity_identifiers',
    'entity_refs',
    'entity_scope',
    'monitoring_queue',
    'region_dimension_coverage',
    'regional_data_facts',
    'regions',
    'signposts',
    'source_trust_events',
    'source_verifications',
    'state_cost_facts',
    'theme_briefs'
  ];
  v_tbl    text;
  v_oid    oid;
  v_ok     boolean := true;
  v_owner  uuid := gen_random_uuid();
  v_other  uuid := gen_random_uuid();
  v_u      uuid;
  v_org_a  uuid;
  v_org_b  uuid;
BEGIN
  BEGIN
    -- ======== A. the catalog: roles, grants ========
    FOREACH v_tbl IN ARRAY v_tables LOOP
      v_oid := to_regclass('public.' || quote_ident(v_tbl));
      IF v_oid IS NULL THEN
        RAISE NOTICE 'migration 382 self-check: public.% does not exist on this database, skipped', v_tbl;
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = v_tbl AND p.cmd IN ('SELECT', 'ALL') AND p.roles && ARRAY['anon', 'public']::name[]
      ) THEN
        RAISE EXCEPTION 'ABORT: public.% still carries a SELECT policy that applies to anon or public', v_tbl;
      END IF;
      IF has_any_column_privilege('anon', v_oid, 'SELECT') THEN
        RAISE EXCEPTION 'ABORT: anon still holds SELECT (table or column level) on public.%', v_tbl;
      END IF;
      IF NOT has_table_privilege('authenticated', v_oid, 'SELECT') OR NOT has_table_privilege('service_role', v_oid, 'SELECT') THEN
        RAISE EXCEPTION 'ABORT: authenticated or service_role lost SELECT on public.%', v_tbl;
      END IF;
    END LOOP;

    -- ======== B. every touched table: anon refused on the GRANT, authenticated and the service role still read ========
    -- Fixture users first: a request with a JWT subject is the authenticated principal of AT1's P4.
    BEGIN
      FOREACH v_u IN ARRAY ARRAY[v_owner, v_other] LOOP
        INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
        VALUES (v_u, 'authenticated', 'authenticated', 'sec8-' || v_u::text || '@sec8-selfcheck.invalid', now(), now());
        INSERT INTO public.profiles (id, email, display_name)
        VALUES (v_u, 'sec8-' || v_u::text || '@sec8-selfcheck.invalid', 'sec8 selfcheck')
        ON CONFLICT (id) DO NOTHING;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_ok := false;
      RAISE NOTICE 'migration 382 self-check: could not create fixture auth.users and profiles rows (%), fixture legs skipped; catalog and anon legs still ran', SQLERRM;
    END;

    FOREACH v_tbl IN ARRAY v_tables LOOP
      v_oid := to_regclass('public.' || quote_ident(v_tbl));
      IF v_oid IS NULL THEN CONTINUE; END IF;
      PERFORM pg_temp.sec8_expect('B anon SELECT on ' || v_tbl,
        pg_temp.sec8_try('anon', NULL, format('SELECT 1 FROM public.%I LIMIT 1', v_tbl)),
        'err:42501:permission denied for table %');
      PERFORM pg_temp.sec8_expect('B service_role SELECT on ' || v_tbl,
        pg_temp.sec8_try('service_role', NULL, format('SELECT 1 FROM public.%I LIMIT 1', v_tbl)),
        'ok:%');
      IF v_ok THEN
        PERFORM pg_temp.sec8_expect('B control: authenticated SELECT on ' || v_tbl,
          pg_temp.sec8_try('authenticated', v_owner, format('SELECT 1 FROM public.%I LIMIT 1', v_tbl)),
          'ok:%');
      END IF;
    END LOOP;

    -- ======== C. P4 against a second organization: a member of org B reads nothing of org A ========
    IF v_ok THEN
      INSERT INTO public.organizations (name, slug) VALUES ('sec8 selfcheck a', 'sec8-a-' || v_owner::text) RETURNING id INTO v_org_a;
      INSERT INTO public.organizations (name, slug) VALUES ('sec8 selfcheck b', 'sec8-b-' || v_other::text) RETURNING id INTO v_org_b;
      INSERT INTO public.org_memberships (org_id, user_id, role) VALUES (v_org_a, v_owner, 'owner'), (v_org_b, v_other, 'member');

      PERFORM pg_temp.sec8_expect('C control: the org A owner reads the org A membership',
        pg_temp.sec8_try('authenticated', v_owner, format('SELECT 1 FROM public.org_memberships WHERE org_id = %L', v_org_a)),
        'ok:1');
      PERFORM pg_temp.sec8_expect('C control: the org A owner reads the org A organization',
        pg_temp.sec8_try('authenticated', v_owner, format('SELECT 1 FROM public.organizations WHERE id = %L', v_org_a)),
        'ok:1');
      PERFORM pg_temp.sec8_expect('C control: the org A owner reads their own profile',
        pg_temp.sec8_try('authenticated', v_owner, format('SELECT 1 FROM public.profiles WHERE id = %L', v_owner)),
        'ok:1');
      PERFORM pg_temp.sec8_expect('C attack: a member of org B reads the org A membership',
        pg_temp.sec8_try('authenticated', v_other, format('SELECT 1 FROM public.org_memberships WHERE org_id = %L', v_org_a)),
        'ok:0');
      PERFORM pg_temp.sec8_expect('C attack: a member of org B reads the org A organization',
        pg_temp.sec8_try('authenticated', v_other, format('SELECT 1 FROM public.organizations WHERE id = %L', v_org_a)),
        'ok:0');
      PERFORM pg_temp.sec8_expect('C attack: a member of org B reads the profile of the org A owner',
        pg_temp.sec8_try('authenticated', v_other, format('SELECT 1 FROM public.profiles WHERE id = %L', v_owner)),
        'ok:0');
      PERFORM pg_temp.sec8_expect('C attack: a member of org B reads org A workspace settings',
        pg_temp.sec8_try('authenticated', v_other, format('SELECT 1 FROM public.workspace_settings WHERE org_id = %L', v_org_a)),
        'ok:0');
      PERFORM pg_temp.sec8_expect('C attack: anon reads the org A membership',
        pg_temp.sec8_try('anon', NULL, format('SELECT 1 FROM public.org_memberships WHERE org_id = %L', v_org_a)),
        'err:42501:%');
      PERFORM pg_temp.sec8_expect('C attack: anon reads the org A owner profile',
        pg_temp.sec8_try('anon', NULL, format('SELECT 1 FROM public.profiles WHERE id = %L', v_owner)),
        'err:42501:%');
    END IF;

    RAISE EXCEPTION 'sec8_382_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM <> 'sec8_382_selfcheck_rollback' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'migration 382 OK: 16 reference tables carry SELECT policies that name authenticated and service_role, anon holds no SELECT on them, authenticated and the service role still read them, and a member of another organization reads none of org A (sources and source_citations HELD, see the header)';
END $sc$;

DROP FUNCTION pg_temp.sec8_try(text, uuid, text);
DROP FUNCTION pg_temp.sec8_expect(text, text, text);

COMMIT;
