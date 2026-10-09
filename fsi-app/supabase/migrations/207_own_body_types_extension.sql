/* status: APPLIED UNDER LEDGER VERSION 20260801004400 (as of 2026-10-07; see APPLIED-MAP.json) */
-- subject: Migration 207 (DRIFT MIGRATION: documents DDL already applied 2026-08-01 04:44:00 UTC, schema_migrations entry 20260801004400). Extends the authority floor scope from 'standard' items alone to the full voluntary-instrument family: `c_own_body_types := ARRAY['standard','framework','initiative']`. A FACT on a voluntary instrument grounds at tier 4 (issuing-body authoritative text) ONLY when its source shares the item's own-source institution_id; a same-tier UNRELATED host stays at the item-type floor. Monotonic + voluntary-only (expands the 'standard' scoped floor to framework and initiative; all other item types byte-identical to the prior function). Mirrored in JS by `authorityFloorForFact` (extends to framework/initiative). Re-applying is a no-op when c_own_body_types is present; includes an "already applied" notice in that case. Reversible (restore the prior function body).
-- 207 — Extend own-body authority floor to voluntary instruments (framework, initiative).
--
-- DRIFT MIGRATION: Documents DDL already applied live on 2026-08-01 04:44:00 UTC
-- (schema_migrations entry version 20260801004400, name "extend_own_body_floor_to_voluntary_instruments_v203").
-- Re-applying is a no-op when c_own_body_types is present; includes an "already applied" notice in that case.
--
-- FLOOR VOCAB EXTENSION: Migration 202 scoped the authority floor to 'standard' items' own authoring bodies.
-- This extends that scope to voluntary instruments (framework, initiative) — the family of items authored by
-- a standards-like body that adopts STANDARDS or FRAMEWORKS as their own methodological base:
--
--   c_own_body_types := ARRAY['standard', 'framework', 'initiative']
--
-- A FACT on a voluntary instrument grounds at tier 4 ONLY when its source shares the item's own-source
-- institution_id. A same-tier UNRELATED host stays at the item-type floor. Mirrors the 202 ruling but widens
-- the item_type set from 'standard' alone to the full voluntary-instrument family.
--
-- ISOLATED DIFF (relative to 202; excludes 206/mint_hold_reason, 264/result_content rename, 225/criterion-7,
-- 300/url-typographic, 302/below-floor-warnings):
--   - Add DECLARE c_own_body_types constant
--   - Change floor check from `v_item.item_type = 'standard'` to `v_item.item_type = ANY (c_own_body_types)`
--   - Extend floor_scope to report 'voluntary_own_body' for framework/initiative items at tier 4
--
-- Idempotent: checks pg_proc.prosrc for existing c_own_body_types; exits with "already applied" notice if found.
--
-- 2026-10-08 (lane MIG-CI, ruling after replay run 37851428637, class STORED-WINS): the executable part of this file is now the
-- statements the ledger stored for this row, verbatim (the function and its COMMENT below). The previous executable part was a DO
-- block with a nested $$ function, which cannot parse in any position (syntax error at or near DECLARE), and an 'isolated diff'
-- reconstruction that lacked mint_hold_reason, fact_mint_hold, item_gate_a_state and gate_a_unproven_or_stale, so it was never what
-- ran. Migrations 289, 300 and 302 patch this function in place, so this body is what they build on; the schema oracle compares
-- pg_get_functiondef and grants for the end state. The isolated-diff description above is kept as history.

-- ─────────────────────────────────────────────────────────────────────────────
-- validate_item_provenance v203 (2026-08-01)
--
-- CHANGE (single, scoped): extend the pre-existing "own authoring body" authority-floor
-- carve-out from item_type='standard' to the VOLUNTARY-INSTRUMENT FAMILY:
--   ARRAY['standard','framework','initiative']
--
-- RATIONALE. v202 already encodes the governing principle for item_type='standard':
-- a FACT grounded in the item's OWN authoring/issuing institution grounds at the
-- standards-body tier (<=4), because "the standard's own authoritative text IS its
-- primary." That principle is not a property of the string 'standard'; it is a property
-- of voluntary instruments generally. A framework (GLEC/Smart Freight Centre) or an
-- initiative (ZEMBA) has no primary-law instrument behind it -- the issuing body IS the
-- authority of record for its own instrument. Holding such items to the tier-2
-- primary-law floor demands a primary source that cannot exist, which excludes
-- legitimate product content rather than labeling it.
--
-- SCOPE DISCIPLINE (deliberately surgical):
--   * Fires ONLY when the claim's source institution IS the item's own authoring
--     institution (src.institution_id = the institution of the item's canonical source),
--     and both are non-null. Institution identity, not tier and not domain.
--   * Tier cap remains <=4, unchanged from the 'standard' rule. This is a floor
--     RELAXATION to the standards-body tier, never a bypass: an own-body source at
--     tier 5+ still fails (e.g. SBTi at tier 5 remains blocked by design).
--   * Third-party secondary commentary NEVER passes this route, by construction.
--     ICCT commenting on an EU regulation, or DieselNet on anything, has a different
--     institution_id than the item's issuing body, so the carve-out cannot fire.
--     That cohort is handled by the labeling track (reclassify + tier-attributed
--     "Industry interpretation (Tier N - Source):" marker), not here.
--   * 'guidance' was CONSIDERED AND EXCLUDED: guidance items are predominantly issued
--     by government regulators (LADBS, Umweltbundesamt) already at tier <=2, so the
--     carve-out would be inert; and admitting it would widen the surface to
--     low-tier self-published "guidance" with no compensating benefit. Measured yield
--     for including it was 8 claims and 0 additional items cleared.
--   * 'regulation' and 'directive' are NOT included and are unaffected. Statements of
--     what the law says continue to require the primary-law floor without exception.
--
-- MEASURED IMPACT (pre-migration simulation, verified against the live validator):
--   criterion-3 floor failures fully cleared for 1 item (National Logistics Plan);
--   materially reduced for GLEC 3.0 (32 -> 10) and ASEAN ATSP (19 -> 12), whose
--   residual failures are third-party commentary bound for the labeling track.
--   Change is monotonically relaxing, so no previously-valid item can regress.
--
-- Reporting: 'floor_scope' remains 'standard_own_body' for item_type='standard' so
-- existing consumers see byte-identical output; the new path reports 'voluntary_own_body'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_item_provenance(p_item_id uuid)
 RETURNS validation_result
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_result        validation_result;
  v_failures      jsonb := '[]'::jsonb;
  v_item          RECORD;
  v_source        RECORD;
  v_has_sections  boolean;
  v_priority_high boolean;
  v_floor_armed   boolean;
  v_floor_max     integer;
  v_fact_floor    integer;          -- 202: per-fact effective floor (scoped for standard own-body)
  v_item_institution uuid;          -- 202: the item's own authoring-body institution (from its canonical source)
  r               RECORD;
  v_url           text;
  v_url_ok        boolean;
  v_slot          RECORD;
  v_slot_count    integer;
  v_fact_total    integer;
  v_fact_verified integer;
  -- 203: voluntary-instrument family eligible for the own-authoring-body floor.
  c_own_body_types constant text[] := ARRAY['standard', 'framework', 'initiative'];
  c_analysis_labels constant text[] := ARRAY[
    '*Per the workspace''s reading:*',
    '*Analytical inference:*',
    '*Industry interpretation:*',
    '*Operational implication:*'
  ];
  c_legal_callout   constant text := '*Legal Confirmation Required:*';
  c_label_re        constant text :=
    '\*?(per the workspace''s reading|analytical inference|industry interpretation|operational implication)([[:space:]]*\([^)]*\))?:\*?';
  c_legal_req_re    constant text :=
    '(the[[:space:]]+(regulation|law|directive|rule|act|amendment|mechanism|standard)[[:space:]]+(requires|mandates|obligates|prohibits|imposes))|(is[[:space:]]+required[[:space:]]+(under|by))|(legally[[:space:]]+required)';
  c_forward_re      constant text :=
    '(propos|would|will|expected|forthcoming|consultation|draft|anticipat|pending|set[[:space:]]+to|once[[:space:]]+(adopted|enacted)|if[[:space:]]+adopted|(by|from|effective|until)[[:space:]]+20[0-9][0-9])';
BEGIN
  SELECT id, source_id, priority, item_type, source_url, full_brief
    INTO v_item
    FROM public.intelligence_items
   WHERE id = p_item_id;

  IF NOT FOUND THEN
    v_failures := v_failures || jsonb_build_object(
      'criterion', 0,
      'reason', 'item_not_found',
      'item_id', p_item_id
    );
    v_result.valid := false;
    v_result.failures := v_failures;
    v_result.recommended_status := 'quarantined';
    RETURN v_result;
  END IF;

  -- 202: the item's own authoring-body institution (null when the item has no source / unlinked source).
  IF v_item.source_id IS NOT NULL THEN
    SELECT institution_id INTO v_item_institution
      FROM public.sources WHERE id = v_item.source_id;
  END IF;

  v_priority_high := v_item.priority IN ('CRITICAL', 'HIGH');
  v_floor_max := CASE
    WHEN v_item.item_type IN ('regulation', 'directive', 'standard', 'guidance', 'framework') THEN 2
    WHEN v_item.item_type = 'research_finding' THEN 4
    WHEN v_item.item_type IN ('technology', 'innovation', 'tool') THEN 5
    ELSE NULL
  END;
  -- 158: the reg family arms the floor UNCONDITIONALLY (primary-legal grounding is the bar
  -- regardless of the model's own severity choice); non-reg per-type floors stay CRITICAL/HIGH.
  v_floor_armed := v_priority_high
    OR v_item.item_type IN ('regulation', 'directive', 'standard', 'guidance', 'framework');

  SELECT EXISTS (
    SELECT 1 FROM public.intelligence_item_sections s
     WHERE s.item_id = p_item_id
       AND COALESCE(s.content_md, '') <> ''
  ) INTO v_has_sections;

  -- ══ CRITERION 1 — Validated source ════════════════════════════════ glyph:verbatim
  IF v_item.source_id IS NULL THEN
    v_failures := v_failures || jsonb_build_object(
      'criterion', 1,
      'reason', 'missing_source_id'
    );
  ELSE
    SELECT id, base_tier, effective_tier, status, url
      INTO v_source
      FROM public.sources
     WHERE id = v_item.source_id;

    IF NOT FOUND THEN
      v_failures := v_failures || jsonb_build_object(
        'criterion', 1,
        'reason', 'source_not_found',
        'source_id', v_item.source_id
      );
    ELSE
      IF v_source.base_tier IS NULL AND v_source.effective_tier IS NULL THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 1,
          'reason', 'source_tier_null',
          'source_id', v_item.source_id
        );
      END IF;
      IF v_source.status <> 'active' THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 1,
          'reason', 'source_not_active',
          'source_id', v_item.source_id,
          'status', v_source.status
        );
      END IF;
    END IF;
  END IF;

  IF v_has_sections THEN

    -- ══ CRITERION 2 — Citation URL grounding ════════════════════════ glyph:verbatim
    FOR r IN
      SELECT DISTINCT m[1] AS url
        FROM public.intelligence_item_sections s,
             LATERAL regexp_matches(
               COALESCE(s.content_md, ''),
               'https?://[^\s)\]\}"''<>]+',
               'g'
             ) AS m
       WHERE s.item_id = p_item_id
    LOOP
      v_url := public.canonicalize_citation_url(r.url);
      v_url_ok := false;

      IF v_item.source_url IS NOT NULL
         AND v_item.source_url <> ''
         AND public.canonicalize_citation_url(v_item.source_url) = v_url THEN
        v_url_ok := true;
      END IF;

      IF NOT v_url_ok AND EXISTS (
        SELECT 1 FROM public.agent_run_searches a
         WHERE a.intelligence_item_id = p_item_id
           AND public.canonicalize_citation_url(a.result_url) = v_url
      ) THEN
        v_url_ok := true;
      END IF;

      IF NOT v_url_ok AND EXISTS (
        SELECT 1 FROM public.sources sr
         WHERE public.canonicalize_citation_url(sr.url) = v_url
      ) THEN
        v_url_ok := true;
      END IF;

      IF NOT v_url_ok THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 2,
          'reason', 'ungrounded_url',
          'url', v_url
        );
      END IF;
    END LOOP;

    -- ══ CRITERION 3 — Claim-level FACT grounding ════════════════════ glyph:verbatim
    FOR r IN
      SELECT scp.id,
             scp.claim_text,
             scp.source_span,
             scp.search_result_id, scp.mint_hold_reason,
             COALESCE(src.tier_override, src.base_tier) AS derived_tier,
             src.institution_id AS src_institution_id,      -- 202: the fact source's authoring body
             ars.result_content_excerpt
        FROM public.section_claim_provenance scp
        LEFT JOIN public.agent_run_searches ars
               ON ars.id = scp.search_result_id
        LEFT JOIN public.sources src
               ON src.id = scp.source_id
       WHERE scp.intelligence_item_id = p_item_id
         AND scp.claim_kind = 'FACT'
    LOOP
      IF r.source_span IS NULL OR btrim(r.source_span) = '' THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 3,
          'reason', 'fact_missing_source_span',
          'claim', r.claim_text
        );
      ELSIF r.result_content_excerpt IS NULL
            OR position(lower(btrim(r.source_span)) IN lower(r.result_content_excerpt)) = 0 THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 3,
          'reason', 'fact_span_not_in_source',
          'claim', r.claim_text,
          'source_span', r.source_span
        );
      END IF;

      -- 202/203: per-fact effective floor. Default = the item-type floor (2 for the reg family).
      -- For a VOLUNTARY INSTRUMENT (standard | framework | initiative), a FACT on the item's OWN
      -- authoring body (same institution as the item's canonical source) grounds at the
      -- issuing-body tier (<= 4) — the instrument's own authoritative text IS its primary. glyph:verbatim
      -- A same-tier UNRELATED host does NOT qualify; it stays at the item-type floor. Third-party
      -- commentary therefore can never clear via this path.
      v_fact_floor := v_floor_max;
      IF v_item.item_type = ANY (c_own_body_types)
         AND v_item_institution IS NOT NULL
         AND r.src_institution_id IS NOT NULL
         AND r.src_institution_id = v_item_institution THEN
        v_fact_floor := 4;
      END IF;

      IF v_floor_armed
         AND v_fact_floor IS NOT NULL
         AND (r.derived_tier IS NULL
              OR r.derived_tier > v_fact_floor) THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 3,
          'reason', 'fact_below_authority_floor',
          'claim', r.claim_text,
          'source_tier_derived', r.derived_tier,
          'priority', v_item.priority,
          'item_type', v_item.item_type,
          'floor_max', v_fact_floor,
          'floor_scope', CASE
                           WHEN v_fact_floor = 4 AND v_item.item_type = 'standard'
                             THEN 'standard_own_body'
                           WHEN v_fact_floor = 4 AND v_item.item_type = ANY (c_own_body_types)
                             THEN 'voluntary_own_body'
                           ELSE 'default'
                         END,
          'floor_basis', CASE WHEN v_priority_high THEN 'priority' ELSE 'item_type_unconditional' END
        );
      END IF;

      IF r.mint_hold_reason IS NOT NULL THEN
        v_failures := v_failures || jsonb_build_object('criterion', 3, 'reason', 'fact_mint_hold', 'claim', r.claim_text, 'mint_hold_reason', r.mint_hold_reason);
      END IF;
    END LOOP;

    -- ══ CRITERION 4 — Labeling discipline ═══════════════════════════ glyph:verbatim
    -- 158: ANALYSIS label check is PER-CLAIM (same blank-line-delimited paragraph as the claim).
    FOR r IN
      SELECT scp.id, scp.claim_text, scp.claim_kind
        FROM public.section_claim_provenance scp
       WHERE scp.intelligence_item_id = p_item_id
         AND scp.claim_kind IN ('ANALYSIS', 'LEGAL')
    LOOP
      IF r.claim_kind = 'ANALYSIS' THEN
        IF NOT EXISTS (
          SELECT 1
            FROM public.intelligence_item_sections s,
                 LATERAL regexp_split_to_table(COALESCE(s.content_md, ''), E'\n[[:space:]]*\n') AS para
           WHERE s.item_id = p_item_id
             AND para ~* c_label_re
             AND para ILIKE '%' || r.claim_text || '%'
        ) THEN
          v_failures := v_failures || jsonb_build_object(
            'criterion', 4,
            'reason', 'analysis_missing_label_syntax',
            'claim', r.claim_text
          );
        END IF;

        IF r.claim_text ~* c_legal_req_re AND r.claim_text !~* c_forward_re THEN
          v_failures := v_failures || jsonb_build_object(
            'criterion', 4,
            'reason', 'legal_claim_mislabeled_analysis',
            'claim', r.claim_text
          );
        END IF;
      ELSIF r.claim_kind = 'LEGAL' THEN
        IF NOT EXISTS (
          SELECT 1
            FROM public.intelligence_item_sections s
           WHERE s.item_id = p_item_id
             AND s.content_md ILIKE '%' || c_legal_callout || '%'
        ) THEN
          v_failures := v_failures || jsonb_build_object(
            'criterion', 4,
            'reason', 'legal_not_routed_to_callout',
            'claim', r.claim_text
          );
        END IF;
      END IF;
    END LOOP;

    FOR r IN
      SELECT s.id AS section_row_id, s.content_md
        FROM public.intelligence_item_sections s
       WHERE s.item_id = p_item_id
         AND COALESCE(s.content_md, '') <> ''
    LOOP
      IF r.content_md ~* '\m(requires|must|mandates|obligates|prohibits|applies to)\M'
         AND NOT (
           r.content_md ~* c_label_re OR
           r.content_md ILIKE '%' || c_legal_callout || '%'
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.section_claim_provenance scp
            WHERE scp.section_row_id = r.section_row_id
              AND scp.claim_kind = 'FACT'
         )
      THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 4,
          'reason', 'unlabeled_assertion',
          'section_row_id', r.section_row_id
        );
      END IF;
    END LOOP;

    -- ══ CRITERION 5 — Active sourcing / required slots ══════════════ glyph:verbatim
    FOR v_slot IN
      SELECT slot_key
        FROM public.item_type_required_slots
       WHERE item_type = v_item.item_type
    LOOP
      SELECT count(*)::int INTO v_slot_count
        FROM public.section_claim_provenance scp
       WHERE scp.intelligence_item_id = p_item_id
         AND scp.claim_kind IN ('FACT', 'GAP')
         AND scp.claim_text ILIKE '%' || v_slot.slot_key || '%';

      IF v_slot_count = 0 THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 5,
          'reason', 'missing_required_slot',
          'slot_key', v_slot.slot_key,
          'item_type', v_item.item_type
        );
      END IF;
    END LOOP;

  ELSE
    v_failures := v_failures || jsonb_build_object(
      'criterion', 2,
      'reason', 'no_section_content'
    );
  END IF; -- v_has_sections

  -- ══ CRITERION 6 — Brief presence (Wave-a Track B9 / plan A8) ═══════ glyph:verbatim
  IF v_item.full_brief IS NULL OR btrim(v_item.full_brief) = '' THEN
    v_failures := v_failures || jsonb_build_object(
      'criterion', 6,
      'reason', 'missing_full_brief'
    );
  END IF;

  v_result.failures := v_failures;
    -- CRITERION 7 - GATE A (prose-fact, hash-validated). Every fact a customer could ACT ON must be span-proven.
  -- Fail when the item has a brief but lacks a CURRENT-HASH CLEAN scan state: missing state, STALE hash (prose edited
  -- since the scan), or orphan_count > 0. Scoped to full_brief <> '' (empty briefs are handled by criterion 6).
  IF coalesce(v_item.full_brief, '') <> ''
     AND NOT EXISTS (SELECT 1 FROM public.item_gate_a_state g
                      WHERE g.intelligence_item_id = p_item_id
                        AND g.scanned_hash = md5(v_item.full_brief)
                        AND g.orphan_count = 0) THEN
    v_failures := v_failures || jsonb_build_object('criterion', 7, 'reason', 'gate_a_unproven_or_stale');
    v_result.failures := v_failures;
  END IF;
  v_result.valid := (jsonb_array_length(v_failures) = 0);

  IF NOT v_result.valid THEN
    v_result.recommended_status := 'quarantined';
  ELSE
    v_result.recommended_status := 'verified';
  END IF;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.validate_item_provenance(uuid) IS
'v203 (2026-08-01): own-authoring-body authority-floor carve-out extended from item_type=''standard'' to the voluntary-instrument family ARRAY[''standard'',''framework'',''initiative'']. Fires only on institution identity (claim source institution = item canonical source institution), tier cap <=4 unchanged. Third-party secondary commentary cannot clear via this path and is handled by the labeling track. ''regulation''/''directive''/''guidance'' unaffected. Monotonically relaxing: cannot regress a previously-valid item.';

