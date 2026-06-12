-- Migration 138: validate_item_provenance — ITEM_TYPE-SCOPED authority floor (reg-only).
--
-- F1 decision (Jason 2026-06-11, Option B): the CRITICAL/HIGH per-claim authority floor
-- (source_tier_at_grounding IN (1,2)) was applied UNIFORMLY to every item type. That is a category
-- error: a CRITICAL market_signal / research_finding / initiative / regional_data / technology item is
-- legitimately grounded in tier 3-6 sources (market data, intergovernmental analysis, trade press) —
-- severity (cost/decision pressure) is not source authority. Holding non-regulatory items to a tier-1-2
-- REGULATORY floor false-quarantines correctly-sourced briefs. The constant-2 stamp (now removed, the F1
-- fake-certification fix) was masking this latent mis-calibration.
--
-- FIX: the floor BITES ONLY on the REGULATORY item-type family
--   (regulation / directive / standard / guidance / framework),
-- where tier-1-2 primary-legal / regulator grounding is the right bar. A binding regulation grounded in
-- secondary analysis SHOULD fail (re-ground against primary legal text — the product's integrity promise).
--
-- NAMED NON-REG EXEMPTION (REVISIT): non-regulatory item types are EXEMPT from the authority floor in
-- THIS migration. This is an HONEST, NAMED deferral — not a silent absence. The per-type non-reg floor
-- VALUE (grounded in the source-credibility-model tier definitions) is deferred to the queued research/
-- tech calibration spec pass (same 137/Q2 sequencing: ship the settled half, spec the unsettled half),
-- and is tracked there. REVISIT: set per-type non-reg floors when that spec lands.
--
-- This changes ONLY the criterion-3 floor predicate (adds the item_type scope). Criteria 1/2/3-span/4/5/6
-- are byte-identical to migration 121. The companion stamp fix (groundBrief writes the canonical
-- institutional tier of the span source, no constants) lands in the same change; this migration ships
-- WITH a corpus revalidation (the status-is-a-cache standing rule) so stored provenance_status agrees
-- with the new gate. STABLE / read-only function.

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
  v_reg_family    boolean;
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
  -- Migration 138: the authority floor is REGULATORY-only. Non-reg item types are exempt (named
  -- exemption, REVISIT — see header). The reg family is the five regulation-format item types.
  v_reg_family := v_item.item_type IN ('regulation', 'directive', 'standard', 'guidance', 'framework');

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

      -- AUTHORITY FLOOR — migration 138: REGULATORY item types only (non-reg exempt, REVISIT).
      IF v_priority_high
         AND v_reg_family
         AND (r.source_tier_at_grounding IS NULL
              OR r.source_tier_at_grounding NOT IN (1, 2)) THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 3,
          'reason', 'fact_below_authority_floor',
          'claim', r.claim_text,
          'source_tier_at_grounding', r.source_tier_at_grounding,
          'priority', v_item.priority,
          'item_type', v_item.item_type
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
  'Sprint 4 source-provenance invariant gate, migration 138 revision. Criterion-3 authority floor is REGULATORY-only (regulation/directive/standard/guidance/framework); non-reg item types are EXEMPT (named exemption, REVISIT — per-type non-reg floor deferred to the research/tech calibration spec). Criteria 1/2/4/5/6 unchanged from 121. Ships with a corpus revalidation (status-is-a-cache rule). READ-ONLY (STABLE).';

COMMIT;
