-- Migration 218 — REVERT the F3 durable-evidence apparatus (migrations 216 + 217).
--
-- Full Supabase audit (2026-07-19) established that item_source_evidence was DEAD/DUPLICATE code:
--   - 0 rows (never populated),
--   - its writer stored cleanCtl(b.text) — BYTE-IDENTICAL to agent_run_searches.result_content_excerpt,
--     an EXISTING per-item, SQL-queryable content store (2864 rows, up to 600 KB/row),
--   - all 210 verified live items already hold their criterion-3 evidence in that existing pool (0 items
--     missing it), so the "pool gets erased on re-generate" problem the store was built for does not manifest,
--   - raw_fetches (678 rows) is the EXISTING permanent snapshot store the original F3 instruction named.
-- The new table duplicated existing structure. This reverts it: criterion 3 returns to the working-excerpt-only
-- check (the exact pre-217 behavior; monotonic-safe reversal — all 210 verified items still pass), then the
-- store, its append-only trigger, and the trigger function are dropped. Zero data loss (table empty).

-- 1. Restore criterion 3 to the pre-217 working-excerpt-only span check (surgical, anchor-verified reverse of 217).
DO $mig$
DECLARE
  src text;
  superset_block text := $new$ELSIF NOT (
              (r.result_content_excerpt IS NOT NULL
                 AND position(lower(btrim(r.source_span)) IN lower(r.result_content_excerpt)) > 0)
              OR EXISTS (
                SELECT 1 FROM public.item_source_evidence ev
                 WHERE ev.intelligence_item_id = p_item_id
                   AND position(lower(btrim(r.source_span)) IN lower(ev.cleaned_text)) > 0
              )
            ) THEN$new$;
  original_block text := $old$ELSIF r.result_content_excerpt IS NULL
            OR position(lower(btrim(r.source_span)) IN lower(r.result_content_excerpt)) = 0 THEN$old$;
BEGIN
  src := pg_get_functiondef('public.validate_item_provenance(uuid)'::regprocedure);
  IF position(superset_block IN src) = 0 THEN
    RAISE EXCEPTION 'F3 revert (218): the 217 superset block was not found in validate_item_provenance — function drifted; aborting rather than corrupt the gate';
  END IF;
  src := replace(src, superset_block, original_block);
  EXECUTE src;
END $mig$;

-- 2. Drop the dead store (function no longer references it after step 1).
DROP TRIGGER IF EXISTS item_source_evidence_no_update ON public.item_source_evidence;
DROP TRIGGER IF EXISTS item_source_evidence_no_delete ON public.item_source_evidence;
DROP TABLE IF EXISTS public.item_source_evidence;
DROP FUNCTION IF EXISTS public.item_source_evidence_append_only();
