-- Migration 121: validate_item_provenance — UNIFORM PROMOTION (no human-in-the-loop).
-- Collapses the criterion-6 tier branch: a valid item -> 'verified' for ALL tiers.
-- CRITICAL/HIGH no longer route to 'pending_human_verify'; the task-1.12 human tick
-- is removed. Criteria 1-5 are byte-identical to migration 119 (this file is generated
-- by replacing ONLY the criterion-6 routing block) — the validity bar is UNCHANGED.
-- (original 119 header follows)
-- Migration 119: validate_item_provenance — FAIL-CLOSE the empty-shell skip.
--
-- DEFECT (migration 114, line 154 `IF v_has_sections THEN ... END IF`):
-- criteria 2-5 were gated on the item HAVING section content. A 0-section item
-- skipped all of criteria 2-5, accrued no failures from them, and reached the
-- assembly step with an empty failure list — so on a valid source (criterion 1)
-- it was certified 'verified' (MODERATE/LOW) or 'pending_human_verify'
-- (CRITICAL/HIGH). The gate therefore CERTIFIED EMPTINESS: an item with no
-- groundable content passed, while a content-rich item (which actually runs
-- 2-5) could fail. Corpus effect at 2026-06-02: all 207 'verified' items had 0
-- sections (vacuous pass); the flagship regs (CBAM/FuelEU/ReFuelEU/CSRD/EU ETS),
-- which DO have sections, quarantined.
--
-- FIX: fail-close. An item with no section content has nothing to ground and
-- MUST NOT pass. The skip stays (no point walking 2-5 with no sections), but the
-- ELSE branch now records a single 'no_section_content' failure so the item
-- routes to 'quarantined' instead of vacuously passing. Sectioned items are
-- UNCHANGED — they still run criteria 2-5 exactly as before.
--
-- This does NOT loosen any criterion and does NOT touch criteria 1-6 logic. It is
-- the minimal correctness fix to the one inverted branch. Re-grounding the rich
-- items so they can legitimately PASS criteria 2-5 (the empty section_claim_provenance
-- / agent_run_searches substrate) is the separate Block-4 build; this migration does
-- not attempt it. Until Block 4 lands and items are genuinely grounded, the honest
-- state is: nothing is provenance-'verified'.
--
-- STABLE / read-only function (unchanged contract); flips nothing at apply time.
-- The set_provenance_status trigger (115) re-derives status on the next write to
-- each item; the reconcile pass drives that write.

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
  -- them; an item WITHOUT section content FAILS CLOSED (migration 119) — there
  -- is no groundable substance, so it must not vacuously pass.
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

      IF v_priority_high
         AND (r.source_tier_at_grounding IS NULL
              OR r.source_tier_at_grounding NOT IN (1, 2)) THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 3,
          'reason', 'fact_below_authority_floor',
          'claim', r.claim_text,
          'source_tier_at_grounding', r.source_tier_at_grounding,
          'priority', v_item.priority
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
    -- The vacuous-skip is gone. An item with no non-empty section content has
    -- nothing the grounding criteria can check; it cannot be provenance-clean by
    -- default. Record a single failure so it routes to 'quarantined'. This is the
    -- minimal correctness fix — it does not weaken any criterion; it removes the
    -- branch that let emptiness pass.
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
    -- migration 121: UNIFORM PROMOTION (human-in-the-loop removed). A valid item
    -- flips to 'verified' for ALL tiers. The prior CRITICAL/HIGH branch routed
    -- valid items to 'pending_human_verify' pending a per-claim human tick
    -- (task 1.12, removed). Criteria 1-5 (validity) are UNCHANGED — this removes
    -- ONLY the extra human step the high tiers required on top of the gate.
    v_result.recommended_status := 'verified';
  END IF;

  RETURN v_result;
END;
$func$;

COMMENT ON FUNCTION public.validate_item_provenance(uuid) IS
  'Sprint 4 source-provenance invariant gate (design-doc section 3b), migration 121 uniform-promotion revision. Walks the six criteria for an intelligence_items row and returns (valid, failures jsonb[], recommended_status). FIX vs 114: valid items flip to verified for ALL tiers (no CRITICAL/HIGH human-tick branch); criteria 1-5 unchanged from 119. Sectioned items are validated on 2-5 unchanged. READ-ONLY (STABLE).';

COMMIT;
