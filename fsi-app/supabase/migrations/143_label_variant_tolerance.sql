-- Migration 143: validate_item_provenance — criterion-4 LABEL-VARIANT TOLERANCE.
--
-- The criterion-4 label discipline matched the four ANALYSIS label tokens by EXACT substring
-- (c_analysis_labels: '*Per the workspace''s reading:*', '*Analytical inference:*',
-- '*Industry interpretation:*', '*Operational implication:*'). The agent intermittently emits a VALID
-- label WITHOUT the markdown asterisks — e.g. "Operational implication:" not "*Operational implication:*"
-- (the DOMINANT cause, diagnosed on the Path-B batch by reading the failing prose) — and, secondarily,
-- with a parenthetical qualifier ("*Industry interpretation (academic):*"). Both are legitimately-labeled
-- analytical claims, but the exact match misses them, producing TWO false failures: (a)
-- analysis_missing_label_syntax (the labeled claim reads as unlabeled), and (b) a false-positive
-- unlabeled_assertion (the labeled section reads as unlabeled). Path-B batch (2026-06-27, 9 enacted items)
-- showed these as the largest fixable residual class; an asterisk-optional simulation cleared all 9.
--
-- THE FIX (brittleness only — the legal-line guard is UNTOUCHED): replace the exact-substring label match
-- with a regex (c_label_re) that accepts a RECOGNIZED base label token with the asterisks OPTIONAL + an
-- OPTIONAL parenthetical qualifier. STRICT on MISSING labels — genuinely-unlabeled binding-modal prose has
-- no recognized base token, so it still fails unlabeled_assertion (the legal-line guard holds). Tolerant
-- ONLY of a valid VARIANT on a real token (asterisk-less / parenthetical); never an arbitrary string.
--
-- Criteria 1/2/3/5, the criterion-4 LEGAL-callout + legal-line-guard checks, and everything else are
-- BYTE-IDENTICAL to migration 142. Only the label-token match in the two criterion-4 spots changes
-- (exact 4-ILIKE -> c_label_re regex). STABLE / read-only.

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
  v_floor_max     integer;
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
  -- migration 143: variant-tolerant ANALYSIS-label match. A recognised base token, with the markdown
  -- asterisks OPTIONAL (the agent intermittently emits the label WITHOUT bold — "Operational implication:"
  -- not "*Operational implication:*" — the DOMINANT real cause, diagnosed on the Path-B batch) and an
  -- OPTIONAL parenthetical qualifier. STRICT on missing labels (no recognised base token => no match =>
  -- still flagged); tolerant only of a valid VARIANT on a REAL token (asterisk-less / parenthetical),
  -- never an arbitrary label-looking string. POSIX, used with ~*.
  c_label_re        constant text :=
    '\*?(per the workspace''s reading|analytical inference|industry interpretation|operational implication)([[:space:]]*\([^)]*\))?:\*?';
  -- migration 142: LEGAL-LINE GUARD patterns (unchanged).
  c_legal_req_re    constant text :=
    '(the[[:space:]]+(regulation|law|directive|rule|act|amendment|mechanism|standard)[[:space:]]+(requires|mandates|obligates|prohibits|imposes))|(is[[:space:]]+required[[:space:]]+(under|by))|(legally[[:space:]]+required)';
  c_forward_re      constant text :=
    '(propos|would|will|expected|forthcoming|consultation|draft|anticipat|pending|set[[:space:]]+to|once[[:space:]]+(adopted|enacted)|if[[:space:]]+adopted|(by|from|effective|until)[[:space:]]+20[0-9][0-9])';
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
        -- migration 143: variant-tolerant label match (c_label_re), STRICT on missing.
        IF NOT EXISTS (
          SELECT 1
            FROM public.intelligence_item_sections s
           WHERE s.item_id = p_item_id
             AND s.content_md ~* c_label_re
             AND s.content_md ILIKE '%' || r.claim_text || '%'
        ) THEN
          v_failures := v_failures || jsonb_build_object(
            'criterion', 4,
            'reason', 'analysis_missing_label_syntax',
            'claim', r.claim_text
          );
        END IF;

        -- LEGAL-LINE GUARD (migration 142, unchanged).
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
      -- migration 143: the label-exemption uses the variant-tolerant match (c_label_re). STRICT on
      -- MISSING labels — a section asserting a binding modal with NO recognised label token + NO legal
      -- callout + NO FACT claim still fails unlabeled_assertion (the legal-line guard is UNTOUCHED).
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
    v_failures := v_failures || jsonb_build_object(
      'criterion', 2,
      'reason', 'no_section_content'
    );
  END IF; -- v_has_sections

  v_result.failures := v_failures;
  v_result.valid := (jsonb_array_length(v_failures) = 0);

  IF NOT v_result.valid THEN
    v_result.recommended_status := 'quarantined';
  ELSE
    v_result.recommended_status := 'verified';
  END IF;

  RETURN v_result;
END;
$func$;

COMMENT ON FUNCTION public.validate_item_provenance(uuid) IS
  'Sprint 4 source-provenance invariant gate, migration 143 revision. Criterion-4 ANALYSIS-label match is now VARIANT-TOLERANT (c_label_re: a recognised base token + optional parenthetical qualifier + close), fixing false analysis_missing_label_syntax + false-positive unlabeled_assertion on validly-labeled-with-variant claims. STRICT on MISSING labels (legal-line guard untouched). Criteria 1/2/3/5 + the LEGAL-callout + legal-line-guard checks unchanged from 142. READ-ONLY (STABLE).';

COMMIT;
