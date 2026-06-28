-- Migration 142: validate_item_provenance — LEGAL-LINE GUARD on criterion 4 (WS1, tier→label router).
--
-- The tier→confidence-label router (docs/design/tier-confidence-router-and-surfacing.md) keeps sub-floor /
-- contextual / forthcoming content by RELABELING it FACT->ANALYSIS and routing forthcoming content to the
-- format's forward section. The anti-laundering invariant: that relabel path must NOT become an escape
-- hatch for a HOLLOW reg-fact. A PRESENT-TENSE ENACTED-LAW REQUIREMENT ("the regulation requires X") that
-- can only be sourced below the floor is a real defect — it must re-source to primary (Tier 1/2) FACT or
-- route to a *Legal Confirmation Required:* callout. It may NEVER be carried under an analysis label to
-- slip past the floor (the floor is FACT-only; an ANALYSIS claim is floor-exempt, so a binding requirement
-- mislabeled ANALYSIS would launder).
--
-- This adds ONE check to criterion 4: an ANALYSIS claim whose claim_text asserts a present-tense enacted-law
-- requirement (TARGETED pattern: "the <law> requires/mandates/...", "is required under/by", "legally
-- required") and is NOT forward-framed (proposed / would / will / forthcoming / in-consultation / dated-
-- future) fails as 'legal_claim_mislabeled_analysis'. STRICT ON AMBIGUITY: absence of a forward marker is
-- treated as present-tense and flagged, so an ambiguous claim falls to the stricter FACT / Legal path,
-- never the forward / early-signal escape.
--
-- Deliberately NARROW: generic colloquial modals ("operators must adapt their fleet") are NOT matched — only
-- explicit law-imposes-duty phrasing. Read-only blast-radius probe (scripts/_diag/_legal-guard-blast.mjs,
-- 2026-06-26) measured 0 of 538 existing ANALYSIS claims flagged, 0 items — pure defense-in-depth, no
-- existing valid analysis touched, no revalidation flips expected. The present-tense-vs-forward heuristic is
-- the documented iteration point (tighten/loosen the two patterns as the corpus exercises it).
--
-- Criteria 1 / 2 / 3 / 5 and the criterion-4 label-syntax + LEGAL-callout checks are BYTE-IDENTICAL to
-- migration 141. Only the new ANALYSIS guard block + its two pattern constants are added. STABLE / read-only.

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
  -- migration 142: LEGAL-LINE GUARD patterns (POSIX, case-insensitive via ~*). LEGAL_REQ = explicit
  -- "the law imposes a duty" phrasing only (NOT generic modals). FORWARD = forthcoming markers that exempt
  -- a claim as legitimate forward ANALYSIS. Absence of a FORWARD marker on a LEGAL_REQ claim => flagged.
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

        -- LEGAL-LINE GUARD (migration 142). An ANALYSIS claim may NOT carry a PRESENT-TENSE ENACTED-LAW
        -- REQUIREMENT — that would launder a binding requirement under an analysis label to escape the
        -- FACT-only authority floor. A present-tense "the regulation requires X" must be a primary-grounded
        -- FACT or a *Legal Confirmation Required:* callout. Forward-framed claims (proposed / would / will /
        -- forthcoming / dated-future) are legitimate forward ANALYSIS and exempt. STRICT ON AMBIGUITY:
        -- no forward marker => treated as present-tense => flagged (the stricter FACT/Legal path).
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
  'Sprint 4 source-provenance invariant gate, migration 142 revision. Adds the criterion-4 LEGAL-LINE GUARD: an ANALYSIS claim asserting a present-tense enacted-law requirement (and not forward-framed) fails as legal_claim_mislabeled_analysis — the relabel-and-route path cannot launder a hollow reg-fact under an analysis label. Strict on ambiguity (no forward marker => flagged). Criteria 1/2/3/5 + the criterion-4 label-syntax/LEGAL-callout checks unchanged from 141. Blast radius measured 0/538 existing ANALYSIS. READ-ONLY (STABLE).';

COMMIT;
