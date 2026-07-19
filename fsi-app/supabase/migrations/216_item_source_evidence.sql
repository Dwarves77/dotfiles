-- Migration 216 — item_source_evidence: durable, append-only, DB-queryable criterion-3 evidence store.
--
-- F3 (Phase R addendum, operator ruling 2026-07-19 option a). validate_item_provenance criterion 3 checks a
-- FACT's source_span against agent_run_searches.result_content_excerpt — the WORKING pool, which the live
-- generate step DELETE-then-INSERT REPLACES every generation, so a re-generate erased the prior criterion-3
-- evidence and there was no durable fallback. (The live workflow never wrote the permanent raw_fetches
-- snapshot; and raw_fetches holds its body in Storage as RAW bytes — un-queryable by the plpgsql validator and
-- not substring-comparable to a CLEANED span — so "criterion 3 on raw_fetches" as first proposed was
-- unbuildable and would have flipped verified items.) This store holds the CLEANED pool text (byte-identical
-- to result_content_excerpt) in a DB column the validator CAN read, keyed by (item, content_hash), APPEND-ONLY.
--
-- Criterion 3 becomes a SUPERSET (migration 217): span in the working excerpt OR in this durable store — a
-- monotonic add, proven zero-flip (scripts/_f3-zero-flip-prover output) BEFORE 217 applies.

CREATE TABLE IF NOT EXISTS public.item_source_evidence (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id  uuid NOT NULL,
  content_hash          text NOT NULL,
  cleaned_text          text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intelligence_item_id, content_hash)
);

CREATE INDEX IF NOT EXISTS item_source_evidence_item_idx
  ON public.item_source_evidence (intelligence_item_id);

-- System-internal store: service role writes it, the SECURITY-context validator reads it; no anon/authenticated
-- access. RLS on with NO policy denies public roles by default (service role bypasses RLS).
ALTER TABLE public.item_source_evidence ENABLE ROW LEVEL SECURITY;

-- APPEND-ONLY at the DB layer: no UPDATE, no DELETE, by anyone (service role included). A re-INSERT of the same
-- (item, content_hash) is a no-op via ON CONFLICT DO NOTHING (NOT an UPDATE), so idempotent writes are
-- unaffected. This is the STRUCTURAL guarantee that prior criterion-3 evidence is never erased — the whole
-- point of the store — enforced in the DB, not by app discipline alone.
CREATE OR REPLACE FUNCTION public.item_source_evidence_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'item_source_evidence is APPEND-ONLY: % is forbidden (F3 durable criterion-3 evidence)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS item_source_evidence_no_update ON public.item_source_evidence;
CREATE TRIGGER item_source_evidence_no_update
  BEFORE UPDATE ON public.item_source_evidence
  FOR EACH ROW EXECUTE FUNCTION public.item_source_evidence_append_only();

DROP TRIGGER IF EXISTS item_source_evidence_no_delete ON public.item_source_evidence;
CREATE TRIGGER item_source_evidence_no_delete
  BEFORE DELETE ON public.item_source_evidence
  FOR EACH ROW EXECUTE FUNCTION public.item_source_evidence_append_only();
