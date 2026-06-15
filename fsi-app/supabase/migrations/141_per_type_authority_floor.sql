-- Migration 141: validate_item_provenance — PER-ITEM-TYPE authority floor (Stage D1).
--
-- Migration 138 made the criterion-3 authority floor REGULATORY-only (reg family floor = tier IN (1,2))
-- and left ALL non-reg item types EXEMPT with a named REVISIT: "set per-type non-reg floors when the
-- research/tech calibration spec lands." This is that spec landing (docs/STAGE-D-NONREG-FLOOR-AND-
-- PRODUCT-DECISIONS.md, operator-ratified 2026-06-15).
--
-- The floor is now a per-item-type maximum tier (v_floor_max). A CRITICAL/HIGH item's FACT claims must
-- carry source_tier_at_grounding <= v_floor_max (and not NULL); else they fail the floor.
--
--   reg family (regulation/directive/standard/guidance/framework) ... floor max 2   [unchanged from 138]
--   research_finding ............................................... floor max 4   [NEW]
--   technology / innovation / tool ................................. floor max 5   [NEW, forward default]
--   market_signal / initiative / regional_data .................... EXEMPT (NULL) [named, REVISIT]
--
-- CALIBRATION RATIONALE (data-grounded, not feel-right):
--  * research_finding floor 4: per source-credibility-model Section 3 the established research core
--    (IPCC, OECD, IEA, World Bank, ICAP, UNCTAD) sits at T3 (intergovernmental analysis body); T4 is
--    industry bodies / classification societies. A <=T4 floor PRESERVES the T3 research core (live corpus:
--    332 of 643 research FACTs are T3) with one tier of industry-analysis margin, and excludes T5 news /
--    T6 opinion (which must be ANALYSIS-labeled) and T7 overflow. So T4 cannot false-quarantine the
--    research core; it can only over-admit T4 — the safe direction. (Tighter alternative ≤T3 noted in the
--    spec sheet; T4 ratified.)
--  * technology/innovation/tool floor 5: FORWARD DEFAULT calibrated against ZERO live data (0 such items
--    in the corpus today) — a hypothesis, not a measurement. Technology Profiles ground in vendor
--    announcements (T4-5) + analytical press; T5 admits those, rejects T6 opinion / T7 overflow. REVISIT
--    when the first technology items land (registered in the invariant registry).
--  * market_signal / initiative EXEMPT: their grounding is CORROBORATION-COUNT (N independent tier-weighted
--    corroborators per source-credibility-model Section 4), NOT a single-source authority tier — a tier
--    floor is the wrong instrument. Codifying the corroboration gate before it is built would be the
--    migration-113 pattern (unbuilt mechanism in a gate). Named exemption + REVISIT in the invariant
--    registry instead.
--  * regional_data EXEMPT: operations facts are bimodal by design — feasibility facts want T1-3, cost-data
--    facts (diesel/SAF/drayage) are legitimately T5-6 commercial sources. An item-level floor is
--    category-wrong; the real gate is per-SECTION. Named exemption + REVISIT until the section-keyed floor
--    is built.
--
-- T5-6 RELABEL (research): research FACTs at T5-6 that fail this floor are recovered to ANALYSIS by the
-- Phase 2 mechanical prose-safe relabel discipline (scripts/phase2-analysis-relabel.mjs, generalized to
-- per-type floors) — label-only, claim_text byte-identical, content_md byte-delta = the fixed marker
-- token only, NO synthesized prose. The relabel is a DATA op run after this migration, not part of it.
--
-- This changes ONLY the criterion-3 floor predicate (reg_family boolean -> per-type floor max). Criteria
-- 1/2/3-span/4/5/6 are otherwise byte-identical to migration 138. Ships WITH a corpus revalidation
-- (status-is-a-cache standing rule) so stored provenance_status agrees with the new gate. STABLE / read-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_item_provenance(p_item_id uuid)
RETURNS validation_result
LANGUAGE plpgsql
STABLE
AS $func$
DECLARE
  v_result        validation_result;
  v_failures      jsonb := '[]'::jsonb;
  v_item          RECORD;
  v_source        RECORD;
  v_has_sections  boolean;
  v_priority_high boolean;
  v_floor_max     integer;  -- migration 141: per-item-type authority-floor maximum tier (NULL = exempt)
  r               RECORD;
  v_url           text;
  v_url_ok        boolean;
  v_slot          RECORD;
  v_slot_count    integer;
  v_fact_total    integer;
  v_fact_verified integer;
  c_analysis_labels constant text[] := ARRAY[
    '*Per the workspace''s reading:*',
    '*Analytical inference:*',
    '*Industry interpretation:*',
    '*Operational implication:*'
  ];
  c_legal_callout   constant text := '*Legal Confirmation Required:*';
BEGIN
  SELECT id, source_id, priority, item_type, source_url
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

  v_priority_high := v_item.priority IN ('CRITICAL', 'HIGH');
  -- Migration 141: per-item-type authority-floor maximum tier. NULL = exempt (market_signal / initiative /
  -- regional_data — named exemptions, REVISIT in the invariant registry). reg family unchanged at 2.
  v_floor_max := CASE
    WHEN v_item.item_type IN ('regulation', 'directive', 'standard', 'guidance', 'framework') THEN 2
    WHEN v_item.item_type = 'research_finding' THEN 4
    WHEN v_item.item_type IN ('technology', 'innovation', 'tool') THEN 5
    ELSE NULL
  END;

  SELECT EXISTS (
    SELECT 1 FROM public.intelligence_item_sections s
     WHERE s.item_id = p_item_id
       AND COALESCE(s.content_md, '') <> ''
  ) INTO v_has_sections;

  -- ══ CRITERION 1 — Validated source ════════════════════════════════
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

  -- Criteria 2-5 walk section/claim content. An item WITH section content runs
  -- them; an item WITHOUT section content FAILS CLOSED (migration 119).
  IF v_has_sections THEN

    -- ══ CRITERION 2 — Citation URL grounding ════════════════════════
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
      v_url := rtrim(r.url, '.,;:');
      v_url_ok := false;

      IF v_item.source_url IS NOT NULL
         AND v_item.source_url <> ''
         AND rtrim(v_item.source_url, '.,;:') = v_url THEN
        v_url_ok := true;
      END IF;

      IF NOT v_url_ok AND EXISTS (
        SELECT 1 FROM public.agent_run_searches a
         WHERE a.intelligence_item_id = p_item_id
           AND rtrim(a.result_url, '.,;:') = v_url
      ) THEN
        v_url_ok := true;
      END IF;

      IF NOT v_url_ok AND EXISTS (
        SELECT 1 FROM public.sources sr
         WHERE rtrim(sr.url, '.,;:') = v_url
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

    -- ══ CRITERION 3 — Claim-level FACT grounding ════════════════════
    FOR r IN
      SELECT scp.id,
             scp.claim_text,
             scp.source_span,
             scp.search_result_id,
             scp.source_tier_at_grounding,
             ars.result_content_excerpt
        FROM public.section_claim_provenance scp
        LEFT JOIN public.agent_run_searches ars
               ON ars.id = scp.search_result_id
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

      -- AUTHORITY FLOOR — migration 141: per-item-type max tier (v_floor_max; NULL = exempt type).
      IF v_priority_high
         AND v_floor_max IS NOT NULL
         AND (r.source_tier_at_grounding IS NULL
              OR r.source_tier_at_grounding > v_floor_max) THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 3,
          'reason', 'fact_below_authority_floor',
          'claim', r.claim_text,
          'source_tier_at_grounding', r.source_tier_at_grounding,
          'priority', v_item.priority,
          'item_type', v_item.item_type,
          'floor_max', v_floor_max
        );
      END IF;
    END LOOP;

    -- ══ CRITERION 4 — Labeling discipline ═══════════════════════════
    FOR r IN
      SELECT scp.id, scp.claim_text, scp.claim_kind
        FROM public.section_claim_provenance scp
       WHERE scp.intelligence_item_id = p_item_id
         AND scp.claim_kind IN ('ANALYSIS', 'LEGAL')
    LOOP
      IF r.claim_kind = 'ANALYSIS' THEN
        IF NOT EXISTS (
          SELECT 1
            FROM public.intelligence_item_sections s
           WHERE s.item_id = p_item_id
             AND (
               s.content_md ILIKE '%' || c_analysis_labels[1] || '%' OR
               s.content_md ILIKE '%' || c_analysis_labels[2] || '%' OR
               s.content_md ILIKE '%' || c_analysis_labels[3] || '%' OR
               s.content_md ILIKE '%' || c_analysis_labels[4] || '%'
             )
             AND s.content_md ILIKE '%' || r.claim_text || '%'
        ) THEN
          v_failures := v_failures || jsonb_build_object(
            'criterion', 4,
            'reason', 'analysis_missing_label_syntax',
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
           r.content_md ILIKE '%' || c_analysis_labels[1] || '%' OR
           r.content_md ILIKE '%' || c_analysis_labels[2] || '%' OR
           r.content_md ILIKE '%' || c_analysis_labels[3] || '%' OR
           r.content_md ILIKE '%' || c_analysis_labels[4] || '%' OR
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

    -- ══ CRITERION 5 — Active sourcing / required slots ══════════════
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
    -- ══ FAIL-CLOSE (migration 119) — no groundable content ══════════
    v_failures := v_failures || jsonb_build_object(
      'criterion', 2,
      'reason', 'no_section_content'
    );
  END IF; -- v_has_sections

  -- ══ Assemble result ═══════════════════════════════════════════════
  v_result.failures := v_failures;
  v_result.valid := (jsonb_array_length(v_failures) = 0);

  IF NOT v_result.valid THEN
    v_result.recommended_status := 'quarantined';
  ELSE
    -- migration 121: UNIFORM PROMOTION (human-in-the-loop removed). A valid item -> 'verified'.
    v_result.recommended_status := 'verified';
  END IF;

  RETURN v_result;
END;
$func$;

COMMENT ON FUNCTION public.validate_item_provenance(uuid) IS
  'Sprint 4 source-provenance invariant gate, migration 141 revision. Criterion-3 authority floor is PER-ITEM-TYPE (v_floor_max): reg family max 2, research_finding max 4, technology/innovation/tool max 5 (forward default, 0 live items, REVISIT), market_signal/initiative/regional_data EXEMPT (named exemptions, REVISIT — corroboration-count gate and per-section regional floor are unbuilt). Criteria 1/2/4/5/6 unchanged from 138. Ships WITH a corpus revalidation (status-is-a-cache rule). READ-ONLY (STABLE).';

COMMIT;
