-- subject: **REVERTED by migration 218 (2026-07-19)** — criterion 3 restored to the working-excerpt-only check (the superset referenced the dead `item_source_evidence`). Original description follows. Migration 217 (Phase R F3 addendum). Makes `validate_item_provenance` criterion 3 a SUPERSET: a FACT span passes when present in the working excerpt (`agent_run_searches.result_content_excerpt`) OR in the durable store (`item_source_evidence`, mig 216). SURGICAL + anchor-verified: a `DO` block reads the function's OWN `pg_get_functiondef`, asserts the exact criterion-3 span anchor exists (RAISEs if the function drifted), replaces ONLY that block, and re-creates the function — no hand-transcribed body. Monotonic add (the working-pool check is never removed), so no currently-verified item can flip to quarantined. **Gated on the zero-flip prover** (`scripts/_diag/_f3-zero-flip-prover.sql`: 0 would-flip / 210 baseline verified, run + committed BEFORE apply). **APPLIED 2026-07-19** via apply_migration; post-apply verified: superset present, old null-check replaced (not duplicated), verified-live still 210, sample verified item still valid. Reversible by re-applying the pre-217 function body. [glyph:verbatim]
-- Migration 217 — validate_item_provenance criterion 3 becomes a SUPERSET (F3 durable evidence).
--
-- Surgical, anchor-verified: this operates on the DB's OWN current function definition (never a hand-
-- transcribed 200-line body that could corrupt the customer-visibility gate). It asserts the criterion-3 span
-- anchor exists (fails LOUDLY if the function drifted from the expected shape), then replaces ONLY the span
-- sub-check so a FACT span passes when it is in the working excerpt (agent_run_searches) OR in the durable
-- append-only store (item_source_evidence, migration 216). Monotonic add (an OR branch; the working-pool check
-- is never removed), so no currently-verified item can flip to quarantined — proven zero-flip by
-- scripts/_f3-zero-flip-prover.mjs (output committed) BEFORE this migration applies.

DO $mig$
DECLARE
  src text;
  old_block text := $old$ELSIF r.result_content_excerpt IS NULL
            OR position(lower(btrim(r.source_span)) IN lower(r.result_content_excerpt)) = 0 THEN$old$;
  new_block text := $new$ELSIF NOT (
              (r.result_content_excerpt IS NOT NULL
                 AND position(lower(btrim(r.source_span)) IN lower(r.result_content_excerpt)) > 0)
              OR EXISTS (
                SELECT 1 FROM public.item_source_evidence ev
                 WHERE ev.intelligence_item_id = p_item_id
                   AND position(lower(btrim(r.source_span)) IN lower(ev.cleaned_text)) > 0
              )
            ) THEN$new$;
BEGIN
  src := pg_get_functiondef('public.validate_item_provenance(uuid)'::regprocedure);
  IF position(old_block IN src) = 0 THEN
    RAISE EXCEPTION 'F3/217: criterion-3 span anchor not found in validate_item_provenance — aborting (function drifted; re-verify before applying)';
  END IF;
  src := replace(src, old_block, new_block);
  EXECUTE src;
END $mig$;
