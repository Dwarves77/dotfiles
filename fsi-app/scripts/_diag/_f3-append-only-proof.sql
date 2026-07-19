-- F3 APPEND-ONLY PROOF (item_source_evidence, migration 216). A rolled-back probe: insert a sentinel, attempt
-- UPDATE and DELETE (both must be rejected by the mig-216 trigger), then RAISE to roll the whole block back so
-- the sentinel never persists. Proves the store is append-only AT THE DB LAYER (service role included), not by
-- app discipline alone.
--
-- CAPTURED OUTPUT (run 2026-07-19, project kwrsbpiseruzbfwjpvsp):
--   ERROR: APPEND_ONLY_PROBE upd_blocked=t del_blocked=t (this DO block is rolled back; the sentinel INSERT never persists)
--   post-run: SELECT count(*) FROM item_source_evidence = 0  (rollback confirmed, nothing persisted)
-- Both UPDATE and DELETE rejected. Append-only proven.

DO $$
DECLARE upd_blocked boolean := false; del_blocked boolean := false;
BEGIN
  INSERT INTO public.item_source_evidence (intelligence_item_id, content_hash, cleaned_text)
    VALUES ('00000000-0000-0000-0000-000000000001','append-only-probe','probe text');
  BEGIN
    UPDATE public.item_source_evidence SET cleaned_text='mutated' WHERE content_hash='append-only-probe';
  EXCEPTION WHEN others THEN upd_blocked := true; END;
  BEGIN
    DELETE FROM public.item_source_evidence WHERE content_hash='append-only-probe';
  EXCEPTION WHEN others THEN del_blocked := true; END;
  RAISE EXCEPTION 'APPEND_ONLY_PROBE upd_blocked=% del_blocked=% (this DO block is rolled back; the sentinel INSERT never persists)', upd_blocked, del_blocked;
END $$;
