-- Migration 150: validate_item_provenance — Criterion-2 URL compare CANONICALIZES before matching.
--
-- 1b (URL-normalization, operator ruling 2026-07-04). Criterion-2 (citation-URL grounding) did an
-- EXACT-string compare (rtrim '.,;:' only), so a URL in section content_md that differed from an ACTIVE
-- registered source by a trailing markdown-emphasis `*`/backtick, a `www.` prefix, or a trailing slash read
-- as `ungrounded_url` DESPITE the source being registered and active. The ungrounded_url ruling table
-- (2026-07-04) found ~30 of 33 such failures were canonicalization mismatches against an already-active
-- source, NOT missing sources.
--
-- This migration adds an IMMUTABLE helper `canonicalize_citation_url(text)` (lowercase, strip a trailing
-- `*`/backtick glued by markdown emphasis, strip a leading `www.`, strip a trailing slash, rtrim '.,;:') and
-- applies it to BOTH sides of all three criterion-2 compares (item source_url, pool result_url, registry
-- sources.url). Defense-in-depth: the WRITE-site fix (canonical-pipeline stripUrlMarkers on content_md) + the
-- 1c cleanup pass already strip the `*` from stored rows; this normalizes at the COMPARE so the `www`/slash
-- residual (which the row-cleanup does not touch) also matches.
--
-- Everything else — criteria 1/3/4/5, the authority floor (inline COALESCE(tier_override, base_tier) via
-- source_id, moat-pure), the legal-line guard, the label-variant match — is BYTE-IDENTICAL to migration 145.
-- Only criterion-2's URL comparison changes. STABLE / read-only.
--
-- APPLY: rides the DDL push (operator apply checklist now 146-150). Do not apply any other way.

BEGIN;

-- Canonical form for citation-URL comparison (criterion 2). IMMUTABLE + STRICT so the planner can inline it.
CREATE OR REPLACE FUNCTION public.canonicalize_citation_url(u text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $canon$
  SELECT regexp_replace(                                -- ONE combined trailing-junk strip: slash + dots +
    regexp_replace(                                     -- punct, so `…/path/.*` (after marker strip `…/path/.`)
      regexp_replace(lower(btrim(u)), '[*`]+$', ''),    -- fully normalizes to `…/path`. strip trailing markers,
      '^(https?://)www\.', '\1'                         -- then leading www., then the combined trailing class.
    ),
    '[/.,;:]+$', ''
  );
$canon$;

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

      IF v_priority_high
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
             AND s.content_md ~* c_label_re
             AND s.content_md ILIKE '%' || r.claim_text || '%'
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
  'Sprint 4 source-provenance invariant gate, migration 145 revision. Criterion-3 authority floor now DERIVES the FACT tier INLINE from the claim''s resolved source (section_claim_provenance.source_id -> sources.COALESCE(tier_override, base_tier)) — base_tier-only + sanctioned override, never effective_tier (moat-pure), read live (drift-proof). The stored source_tier_at_grounding is no longer consumed by the floor. Criteria 1/2/4/5, the criterion-3 source_span checks, the legal-line guard, and the label-variant match are unchanged from 143. Zero blast radius (proven: 0 drift on the source_id basis, 0 floor flips). READ-ONLY (STABLE).';

COMMIT;
