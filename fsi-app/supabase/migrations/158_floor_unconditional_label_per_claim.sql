-- Migration 158: validate_item_provenance — reg-family authority floor UNCONDITIONAL on item_type;
-- criterion-4 ANALYSIS label check PER-CLAIM (paragraph-scoped).
--
-- P3c / S1-07 (chrome-audit traceability matrix, dispatch 2026-07-07). Two moat-gate holes:
--
-- 1. FLOOR-CONDITIONAL-ON-PRIORITY BYPASS. The criterion-3 authority floor fired only when
--    priority IN ('CRITICAL','HIGH') — and priority is the MODEL'S OWN output, so its severity
--    choice could disarm the floor. Reg-family items are exactly where primary-legal grounding is
--    the bar regardless of severity (moat doctrine: a reg FACT grounds in enacted/official text,
--    tier 1-2). This migration makes the floor fire UNCONDITIONALLY for the reg family
--    (regulation/directive/standard/guidance/framework); the non-regulatory per-type floors
--    (research_finding 4, technology-family 5, mig 141) keep the CRITICAL/HIGH condition —
--    unchanged semantics, no unruled widening. The failure object gains 'floor_basis'
--    ('priority' | 'item_type_unconditional') for diagnosis; the reason string is unchanged
--    (consumers: ProvenanceFailures.tsx, deterministic-lever.mjs).
--    BLAST RADIUS (probed live 2026-07-07, read-only): 90 of 113 verified reg-family items carry
--    LOW/MODERATE priority (floor never armed); 72 of them hold 947 sub-floor FACT claims —
--    385 with NO claim-level source_id at all (39 items), 562 grounded at tiers 3-6. Those 72 flip
--    to quarantined AT NEXT RE-VALIDATION (the set_provenance_status trigger fires on claim
--    writes), NOT at apply time — the flip rides re-ground/re-verify passes, where the
--    research-or-erase lane (re-home to floor pool via 4b, else honest quarantine) disposes them.
--
-- 2. SECTION-SCOPED ANALYSIS LABEL. Criterion-4 accepted an ANALYSIS claim if ANY paragraph of a
--    section containing the claim matched the label regex ANYWHERE in that section — one labeled
--    sentence licensed every analysis claim in the section. Now the label must sit in the SAME
--    PARAGRAPH (blank-line-delimited) as the claim text, matching what the generation prompt has
--    required per-sentence all along ("EVERY sentence that asserts an obligation ... must be ...
--    a labeled inference"). Probed live: of 517 ANALYSIS claims across 78 verified items, exactly
--    1 claim on 1 item (Japan MLIT, 68e05861) fails the paragraph-scoped check — the generator
--    was already complying; only the gate lagged. Reason string unchanged.
--
-- Everything else — criteria 1/2/5, the criterion-3 span checks, the legal-line guard, the
-- label-variant regex, canonicalize_citation_url (mig 150, not recreated here) — is BYTE-IDENTICAL
-- to migration 150. STABLE / read-only.
--
-- APPLY: AUTHOR-ONLY per the Phase-3 dispatch (migrations are committed files; this one rides the
-- operator's apply decision WITH the 72-item blast-radius figure above). Do not apply any other way.

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
  v_floor_armed   boolean;
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
  c_label_re        constant text :=
    '\*?(per the workspace''s reading|analytical inference|industry interpretation|operational implication)([[:space:]]*\([^)]*\))?:\*?';
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
  -- 158: the reg family arms the floor UNCONDITIONALLY (primary-legal grounding is the bar
  -- regardless of the model's own severity choice); non-reg per-type floors stay CRITICAL/HIGH.
  v_floor_armed := v_priority_high
    OR v_item.item_type IN ('regulation', 'directive', 'standard', 'guidance', 'framework');

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

    -- ══ CRITERION 3 — Claim-level FACT grounding ════════════════════
    -- D1: the authority-floor tier is DERIVED INLINE from the claim's resolved source
    -- (scp.source_id -> sources.COALESCE(tier_override, base_tier)) — base_tier-only + sanctioned
    -- override, never effective_tier (moat-pure), and read live (drift-proof). The stored
    -- source_tier_at_grounding is no longer consumed here. source_span checks unchanged.
    FOR r IN
      SELECT scp.id,
             scp.claim_text,
             scp.source_span,
             scp.search_result_id,
             COALESCE(src.tier_override, src.base_tier) AS derived_tier,
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

      IF v_floor_armed
         AND v_floor_max IS NOT NULL
         AND (r.derived_tier IS NULL
              OR r.derived_tier > v_floor_max) THEN
        v_failures := v_failures || jsonb_build_object(
          'criterion', 3,
          'reason', 'fact_below_authority_floor',
          'claim', r.claim_text,
          'source_tier_derived', r.derived_tier,
          'priority', v_item.priority,
          'item_type', v_item.item_type,
          'floor_max', v_floor_max,
          'floor_basis', CASE WHEN v_priority_high THEN 'priority' ELSE 'item_type_unconditional' END
        );
      END IF;
    END LOOP;

    -- ══ CRITERION 4 — Labeling discipline ═══════════════════════════
    -- 158: the ANALYSIS label check is PER-CLAIM — the label must sit in the SAME PARAGRAPH
    -- (blank-line-delimited) as the claim text. A single labeled sentence no longer licenses
    -- every analysis claim in its section. Reason string unchanged (consumer-stable).
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
  'Sprint 4 source-provenance invariant gate, migration 158 revision. (1) The criterion-3 authority floor is UNCONDITIONAL for the reg family (regulation/directive/standard/guidance/framework) — the model''s own priority choice can no longer disarm it; non-reg per-type floors (141) keep the CRITICAL/HIGH condition. Failure objects carry floor_basis. (2) The criterion-4 ANALYSIS label check is PER-CLAIM: the label must sit in the same blank-line-delimited paragraph as the claim text (one labeled sentence no longer licenses a whole section). Criteria 1/2/5, span checks, legal-line guard, label-variant regex, and canonicalize_citation_url (150) unchanged. READ-ONLY (STABLE).';

COMMIT;
