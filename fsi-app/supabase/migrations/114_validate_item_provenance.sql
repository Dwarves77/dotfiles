-- Migration 114: validate_item_provenance(item_id) — six-criteria provenance
-- validation function (Sprint 4 Block 1, task 1.3).
--
-- Implements design-doc section 4 STEP 4 (function half) and section 3b
-- (the six criteria, verbatim) for the source-provenance invariant.
--
-- Returns a validation_result composite:
--   valid             boolean  -- true iff criteria 1-5 all pass
--   failures          jsonb    -- array of {criterion, ...payload} objects
--   recommended_status provenance_status
--                              -- the terminal status the trigger (task 1.4)
--                              -- should set: 'quarantined' if !valid;
--                              -- else 'pending_human_verify' for CRITICAL/HIGH
--                              -- (criterion 6), else 'verified' for MODERATE/LOW.
--
-- This migration is FUNCTION-ONLY. It is ADDITIVE per the Block 1 hard fence:
--   - NO ALTER/DROP of any existing column/table/constraint
--   - NO NOT NULL / CHECK added to EXISTING columns
--   - NO backfill / UPDATE of any existing intelligence_items /
--     intelligence_item_sections / section_claim_provenance row
--   - NO trigger (set_provenance_status is task 1.4, migration 115)
--   - The function is READ-ONLY (STABLE). It reads; it never writes. It does
--     not flip any item's provenance_status. Nothing flips in Block 1.
--
-- Criterion 6 note: the function only RECOMMENDS the terminal status via the
-- recommended_status field. It does not enforce the human-verify gate itself;
-- that is the trigger's job (task 1.4) and the admin verification queue's job
-- (task 1.12). The function reports what the status SHOULD be on a passing gate
-- given the item's priority.
--
-- Span-check (criterion 3): this Block-1 function checks the FACT span against
-- the CACHED agent_run_searches.result_content_excerpt only (the design's
-- primary, no-refetch path). The page-refetch fallback + 2-3 retry backoff
-- (Component 7 / criterion 3 fallback) is implemented in the Vercel Workflow
-- validation step (task 1.14), NOT in this Postgres function — Postgres cannot
-- make outbound HTTP. A FACT claim whose span is not found in its cached
-- excerpt fails criterion 3 here; the workflow step is where the retry/refetch
-- recovery happens before the claim is routed to staging.

BEGIN;

-- ── Composite return type ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'validation_result') THEN
    CREATE TYPE validation_result AS (
      valid              boolean,
      failures           jsonb,
      recommended_status provenance_status
    );
  END IF;
END$$;

-- ── Function: validate_item_provenance(item_id uuid) ────────────────
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
  -- The closed set of four EXACT ANALYSIS label patterns (decision-log
  -- row 207, LOCKED). Exact-match, not fuzzy. A near-miss fails as unlabeled.
  c_analysis_labels constant text[] := ARRAY[
    '*Per the workspace''s reading:*',
    '*Analytical inference:*',
    '*Industry interpretation:*',
    '*Operational implication:*'
  ];
  c_legal_callout   constant text := '*Legal Confirmation Required:*';
BEGIN
  -- Load the item. A non-existent item is itself a failure.
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

  -- Does the item have any section content? (criteria 2-5 are vacuous for
  -- shells per design-doc section 1 / section 3a.)
  SELECT EXISTS (
    SELECT 1 FROM public.intelligence_item_sections s
     WHERE s.item_id = p_item_id
       AND COALESCE(s.content_md, '') <> ''
  ) INTO v_has_sections;

  -- ══ CRITERION 1 — Validated source ════════════════════════════════
  -- Non-null source_id -> sources row with non-null base_tier (or
  -- effective_tier) AND status = 'active'.
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

  -- Criteria 2-5 only apply to items WITH section content. Shells satisfy
  -- them vacuously (design-doc section 1). Skip the section-walking criteria
  -- entirely for shells.
  IF v_has_sections THEN

    -- ══ CRITERION 2 — Citation URL grounding ════════════════════════
    -- Every URL emitted in any section's content_md must resolve to:
    --   (a) the item's source_url,
    --   (b) an agent_run_searches.result_url for this item, OR
    --   (c) the url of any row in sources.
    -- URLs extracted via regex over content_md.
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
      v_url := rtrim(r.url, '.,;:'); -- trim trailing sentence punctuation
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
    -- For each section_claim_provenance row of kind FACT:
    --   - source_span non-null AND non-empty,
    --   - the span appears (substring, case-insensitive) in the linked
    --     agent_run_searches.result_content_excerpt (cached, no-refetch path),
    --   - for CRITICAL/HIGH items, source_tier_at_grounding IN (1, 2).
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
    -- ANALYSIS claims: the claim_text must appear inside a recognized label
    --   pattern (closed set, exact) somewhere in the item's content_md.
    -- LEGAL claims: must route to the *Legal Confirmation Required:* callout
    --   present in the item's content_md (else fail).
    -- Unlabeled strong-modal assertions: scan section prose for conclusory
    --   strong-modal verbs NOT wrapped in any recognized label / callout.
    FOR r IN
      SELECT scp.id, scp.claim_text, scp.claim_kind
        FROM public.section_claim_provenance scp
       WHERE scp.intelligence_item_id = p_item_id
         AND scp.claim_kind IN ('ANALYSIS', 'LEGAL')
    LOOP
      IF r.claim_kind = 'ANALYSIS' THEN
        -- The claim must be carried by one of the four exact label patterns
        -- in the content. We require that at least one label pattern is
        -- present in the same section content and that the claim text follows
        -- the label. Practical check: a label pattern is present in the
        -- content AND the claim_text appears in the content.
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

    -- Unlabeled strong-modal assertion scan over section prose. A line/segment
    -- containing a conclusory strong-modal verb (requires, must, mandates,
    -- obligates, prohibits, applies to) that is NOT within reach of any
    -- recognized ANALYSIS label or the LEGAL callout contributes one
    -- unlabeled_assertion failure. Per decision-log row 203 the asymmetry is
    -- accepted: false positives are minor friction; an unlabeled regulatory
    -- conclusion is the firm-standing-rule violation.
    FOR r IN
      SELECT s.id AS section_row_id, s.content_md
        FROM public.intelligence_item_sections s
       WHERE s.item_id = p_item_id
         AND COALESCE(s.content_md, '') <> ''
    LOOP
      -- Only flag when a strong-modal conclusory pattern is present AND the
      -- section carries NEITHER a recognized ANALYSIS label NOR the LEGAL
      -- callout to license the assertion.
      IF r.content_md ~* '\m(requires|must|mandates|obligates|prohibits|applies to)\M'
         AND NOT (
           r.content_md ILIKE '%' || c_analysis_labels[1] || '%' OR
           r.content_md ILIKE '%' || c_analysis_labels[2] || '%' OR
           r.content_md ILIKE '%' || c_analysis_labels[3] || '%' OR
           r.content_md ILIKE '%' || c_analysis_labels[4] || '%' OR
           r.content_md ILIKE '%' || c_legal_callout || '%'
         )
         -- ...and the assertion is not itself backed by a FACT claim in this
         -- section (a span-grounded FACT carrying the modal is not an
         -- unlabeled inference, it is a sourced fact).
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
    -- Each required slot for the item's item_type must be addressed by AT
    -- LEAST ONE section_claim_provenance row (FACT span-grounded OR explicit
    -- GAP). A required slot with zero covering rows fails. The slot is matched
    -- against the claim via a slot_key marker in claim_text (the parser stamps
    -- the slot_key into the claim row; see task 1.8). We treat a claim as
    -- covering a slot when its claim_text contains the slot_key token.
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

    -- No-bare-fact: every FACT/GAP claim that is NOT span-grounded (FACT
    -- without a usable span already failed criterion 3). A bare unsourced
    -- assertion shows up as a FACT row lacking source_span — already covered
    -- by criterion 3's fact_missing_source_span. Nothing additional needed
    -- here; the slot coverage above + criterion 3 together enforce
    -- "no bare unsourced fact, no extrapolation."

  END IF; -- v_has_sections

  -- ══ Assemble result ═══════════════════════════════════════════════
  v_result.failures := v_failures;
  v_result.valid := (jsonb_array_length(v_failures) = 0);

  IF NOT v_result.valid THEN
    v_result.recommended_status := 'quarantined';
  ELSIF v_priority_high THEN
    -- CRITERION 6 — CRITICAL/HIGH pass the gate to pending_human_verify,
    -- NOT verified, until the admin queue ticks each FACT claim.
    v_result.recommended_status := 'pending_human_verify';
  ELSE
    v_result.recommended_status := 'verified';
  END IF;

  RETURN v_result;
END;
$func$;

COMMENT ON FUNCTION public.validate_item_provenance(uuid) IS
  'Sprint 4 source-provenance invariant gate (design-doc section 3b). Walks all six criteria for an intelligence_items row and returns (valid, failures jsonb[], recommended_status). Criteria 1-5 determine valid/quarantined; criterion 6 maps a passing CRITICAL/HIGH item to pending_human_verify and MODERATE/LOW to verified via recommended_status. READ-ONLY (STABLE): never writes, never flips status. The trigger set_provenance_status (task 1.4) consumes recommended_status. Span-check uses cached agent_run_searches.result_content_excerpt only; page-refetch + retry backoff (Component 7) lives in the workflow validation step (task 1.14), not in this function.';

COMMIT;
