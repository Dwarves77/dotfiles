-- F3 ZERO-FLIP PROVER (read-only). Run BEFORE migration 217 applies (operator ruling 2026-07-19).
--
-- Criterion 3's span sub-check becomes a monotonic SUPERSET in 217: a FACT span passes when it is in the
-- working excerpt (agent_run_searches) OR in the durable append-only store (item_source_evidence, mig 216).
-- Because the check only ADDS an OR branch (the working-pool check is never removed) and item_source_evidence
-- is empty for every existing item, no currently-verified item can flip to quarantined. This prover computes
-- the NEW predicate over every verified live item and counts would-flip; it must be 0 before 217 applies.
--
-- CAPTURED OUTPUT (run 2026-07-19, project kwrsbpiseruzbfwjpvsp, BEFORE 217 applied):
--   verified_items_that_would_flip = 0
--   baseline_verified_live         = 210
--   evidence_rows_now              = 0
-- Zero flips. 217 applied on this result. (Re-run post-apply confirmed verified-live still 210, 0 flips.)

WITH would_flip AS (
  SELECT DISTINCT i.id
  FROM public.intelligence_items i
  JOIN public.section_claim_provenance scp
    ON scp.intelligence_item_id = i.id AND scp.claim_kind = 'FACT'
  LEFT JOIN public.agent_run_searches ars ON ars.id = scp.search_result_id
  WHERE i.provenance_status = 'verified' AND i.is_archived = false
    AND scp.source_span IS NOT NULL AND btrim(scp.source_span) <> ''
    AND NOT (
      (ars.result_content_excerpt IS NOT NULL
         AND position(lower(btrim(scp.source_span)) IN lower(ars.result_content_excerpt)) > 0)
      OR EXISTS (
        SELECT 1 FROM public.item_source_evidence ev
         WHERE ev.intelligence_item_id = i.id
           AND position(lower(btrim(scp.source_span)) IN lower(ev.cleaned_text)) > 0
      )
    )
)
SELECT
  (SELECT count(*) FROM would_flip) AS verified_items_that_would_flip,
  (SELECT count(*) FROM public.intelligence_items
     WHERE provenance_status='verified' AND is_archived=false) AS baseline_verified_live,
  (SELECT count(*) FROM public.item_source_evidence) AS evidence_rows_now;
