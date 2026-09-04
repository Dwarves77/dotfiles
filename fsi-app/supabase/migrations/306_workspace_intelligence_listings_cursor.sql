-- 306 — get_workspace_intelligence_listings: add optional keyset-cursor params
--
-- PERF-12 lane (2026-09-04, ADR-027 §2/§5, docs/audits/perf-waterfall-2026-09-04.md).
--
-- WRITTEN, NOT APPLIED. Same convention as migration 305 (this lane's own sibling): the
-- coordinator applies this when the two-track DDL-before-code-commits window allows; the app
-- works before it lands (fails soft to `.range(offset, offset+limit-1)` — see
-- src/lib/supabase-server.ts's CURSOR_SCOPED_RPCS / fetchWorkspaceResources for the client-side
-- fail-soft ladder this migration activates automatically once live, no second deploy).
--
-- THE PROBLEM THIS FIXES. ADR-027 §2 names PostgREST `.range()`/keyset cursor pagination as the
-- standard mechanism for "one screen of rows at a time" (tanstack.com/query infinite-queries +
-- postgrest.org pagination). `.range(offset, offset+limit-1)` (the mechanism PERF-11's FIRSTPAGE
-- lane already built, kept here as the fail-soft floor) is OFFSET pagination: correct today
-- (rows are read-only from this RPC's own perspective within one session), but it re-derives
-- "how far in am I" as a raw position count rather than the row itself, so a page fetched via
-- OFFSET N is not "the page after that specific row", it's "the Nth-through-N+limit rows of
-- whatever this exact query returns right now" — a row inserted/re-prioritized ahead of the
-- cursor between two fetches shifts every subsequent OFFSET page by one, which a TRUE keyset
-- cursor (WHERE the ordering columns are strictly greater than the last row's own values) does
-- not suffer, because it re-anchors on the row's own identity every fetch, not a position count.
--
-- THE FIX: `p_after_priority text DEFAULT NULL, p_after_added_date date DEFAULT NULL,
-- p_after_id uuid DEFAULT NULL` — the caller passes back the LAST ROW of the previous page's own
-- `(effective_priority, added_date, id)` triple, the exact three columns
-- `get_workspace_intelligence_listings`'s own `ORDER BY CASE effective_priority ... END,
-- added_date DESC, id ASC` sorts by (migration 272's order, confirmed live and unchanged by 303/
-- 305). The WHERE clause below is the row-comparison expansion of that ORDER BY (rank ascending,
-- added_date descending, id ascending) as an OR-chain of three progressively-narrower AND clauses
-- — not a Postgres ROW() comparison, because ROW() compares lexicographically left-to-right using
-- one direction per whole tuple, and this ORDER BY mixes ASC (rank), DESC (added_date), ASC (id)
-- across its three columns, which a single ROW() `>` cannot express:
--
--   (rank > after_rank)
--   OR (rank = after_rank AND added_date < after_added_date)
--   OR (rank = after_rank AND added_date = after_added_date AND id > after_id)
--
-- `p_after_priority` is matched with the SAME `effective_priority` string values the ORDER BY's
-- own CASE already switches on (CRITICAL/HIGH/MODERATE/LOW/else) — the function computes the rank
-- for the incoming cursor with the identical CASE expression, so the two rank computations can
-- never drift apart from each other (one CASE literal, referenced twice inside the same function
-- body). Passing NULL (the default, every existing caller) short-circuits the whole predicate to
-- TRUE — a no-op, byte-identical to today for every caller that never passes it, same pattern
-- migration 305's `p_domain IS NULL OR ...` already established for this same function.
--
-- COMPOSES WITH 305, DOES NOT DEPEND ON A SPECIFIC APPLY ORDER. This DO block inspects the LIVE
-- body and picks one of two source templates: the confirmed pre-305 body (md5 verified below,
-- lifted verbatim from 305's own guard) or a POST-305 body (detected structurally, via `LIKE`, not
-- an exact md5 — this lane's container has no live DB access to independently capture
-- `pg_get_functiondef`'s post-305 formatting, so an exact md5 for that branch cannot be honestly
-- asserted; the structural check below matches the exact substrings 305's own post-apply
-- verification query already checks for, which is the strongest guarantee available without a
-- live read). Either branch produces the SAME final body (p_domain retained/added + the three new
-- cursor params + the OR-chain WHERE, ANDed with 305's own domain predicate) — apply this
-- migration whenever, in either order, exactly once; a third run against an already-cursor-aware
-- body is a no-op (checked first, below).
--
-- WHY A NEW PARAMETER, NOT A NEW RPC: same rationale as 305's own header — this is a leaf-level
-- signature addition (DEFAULT-valued, trailing) via CREATE OR REPLACE, no RETURNS TABLE change, no
-- DROP needed, reversible by re-applying the pre-image body.
--
-- POST-APPLY VERIFICATION (run by the coordinator after applying, not run by this lane):
--   SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_workspace_intelligence_listings';
--   -- expect: signature carries `p_after_priority text DEFAULT NULL::text, p_after_added_date
--   -- date DEFAULT NULL::date, p_after_id uuid DEFAULT NULL::uuid` and the body carries the
--   -- three-branch OR-chain above.
--
-- Reversible: re-apply whichever of the two v_old_def bodies below matched at apply time.

DO $$
DECLARE
  v_def          text;
  v_pre305_md5   constant text := '6e329b1f407a0e14ee19596b26eb3198'; -- lifted verbatim from 305's own v_pre_md5

  v_old_def_pre305 constant text :=
'CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso
  FROM public._workspace_active_items(p_org_id) ii
  ORDER BY
    CASE ii.effective_priority
      WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$
';

  -- Final target body — same result whichever branch (pre-305 or post-305) the live function was
  -- found in: p_domain (305) AND the three cursor params (306), ANDed together in one WHERE.
  v_new_def   constant text :=
'CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings(p_org_id uuid, p_domain integer DEFAULT NULL::integer, p_after_priority text DEFAULT NULL::text, p_after_added_date date DEFAULT NULL::date, p_after_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_after_rank int;
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  v_after_rank := CASE p_after_priority
    WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4
    WHEN NULL THEN NULL ELSE 5 END;
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso
  FROM public._workspace_active_items(p_org_id) ii
  WHERE (p_domain IS NULL OR ii.domain = p_domain)
    AND (
      p_after_id IS NULL
      OR (
        (CASE ii.effective_priority WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END) > v_after_rank
        OR ((CASE ii.effective_priority WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END) = v_after_rank AND ii.added_date < p_after_added_date)
        OR ((CASE ii.effective_priority WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END) = v_after_rank AND ii.added_date = p_after_added_date AND ii.id > p_after_id)
      )
    )
  ORDER BY
    CASE ii.effective_priority
      WHEN ''CRITICAL'' THEN 1 WHEN ''HIGH'' THEN 2 WHEN ''MODERATE'' THEN 3 WHEN ''LOW'' THEN 4 ELSE 5 END,
    ii.added_date DESC, ii.id ASC;
END;
$function$
';

BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_workspace_intelligence_listings';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORT 306: public.get_workspace_intelligence_listings not found';
  END IF;

  -- Already applied (cursor params already present) — no-op, idempotent re-run.
  IF v_def LIKE '%p_after_id%' THEN
    RAISE NOTICE '306: already applied (p_after_id already present) — no-op';
    RETURN;
  END IF;

  IF md5(v_def) = v_pre305_md5 THEN
    -- Confirmed pre-305 baseline (exact md5 match, lifted from 305's own guard).
    NULL; -- fall through to EXECUTE v_new_def below; nothing else to branch on
  ELSIF v_def LIKE '%p_domain integer DEFAULT NULL%'
    AND v_def LIKE '%p_domain IS NULL OR ii.domain = p_domain%'
    AND v_def LIKE '%ii.added_date DESC, ii.id ASC%' THEN
    -- Structurally matches 305's own post-apply verification query (see 305's file, same three
    -- substrings) — 305 is live. No exact md5 to check against (not independently capturable from
    -- this lane's container without a live DB read), so this is the strongest available guard.
    NULL; -- fall through to EXECUTE v_new_def below
  ELSE
    RAISE EXCEPTION 'ABORT 306: live get_workspace_intelligence_listings body matches neither the confirmed pre-305 baseline (md5 %) nor the expected post-305 shape — read the live definition and re-derive this migration before applying. Live md5: %', v_pre305_md5, md5(v_def);
  END IF;

  EXECUTE v_new_def;

  -- Post-patch verification.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_workspace_intelligence_listings';
  IF v_def NOT LIKE '%p_after_id%' OR v_def NOT LIKE '%p_domain%' THEN
    RAISE EXCEPTION 'ABORT 306: post-patch definition does not carry both p_domain and the cursor params';
  END IF;

  RAISE NOTICE '306 OK: get_workspace_intelligence_listings now accepts optional keyset-cursor params (p_after_priority/p_after_added_date/p_after_id); post md5 %', md5(v_def);
END $$;
