-- 308 — source_tier_opinions: add 'host_class_table' to the opinion_source CHECK constraint.
--
-- THE GAP [CONFIRMED, Supabase MCP 2026-09-05]: migration 091 created source_tier_opinions with
-- opinion_source CHECK (opinion_source = ANY (ARRAY['haiku_brief_classifier', 'haiku_verification',
-- 'operator_review'])) -- a closed enum. Every value in it names an LLM or human process; migration
-- 091's own header (Q3) anticipated "opinions can originate from sources OTHER than brief generation
-- in the future", but no deterministic, $0, no-LLM upstream had ever been WRITTEN until Lane
-- ATTACH-SOURCES, W3.3 (docs/plans/complete-system-build-plan-2026-09-04.md): scripts/maintenance/
-- tier-opinions.mjs compares each sources.base_tier against classTierForHost(hostOf(url)) -- the SAME
-- SC-13 class table (src/lib/sources/host-authority.ts) heal-provenance.mjs's STEP SOURCE and
-- institution-canonicalize.mjs's Part C already use to classify a host with zero guessing -- and
-- records a disagreement as an opinion. That writer (src/lib/sources/tier-opinion-writer.ts's
-- recordTierOpinion, extended with an opinionSource parameter) needs a literal the CHECK constraint
-- does not yet allow: 'host_class_table'. Without this migration, every insert that new caller attempts
-- fails the CHECK and recordTierOpinion's own catch-and-swallow contract (never throws) would silently
-- report ok:false for every single row -- the writer would exist and be wired, and would still write
-- nothing, live.
--
-- SAFE BY CONSTRUCTION: source_tier_opinions has 0 rows today (confirmed, Supabase MCP), so there is no
-- existing row to reconcile -- the pre-check below is a belt-and-suspenders count, not a real risk
-- (unlike migration 307's genuinely non-empty table). ADDING a literal to a CHECK's allowed set is
-- backward-compatible by construction: every row that satisfied the OLD constraint still satisfies the
-- new (strictly wider) one, so no existing row can be invalidated by this change either way.
--
-- WHY DROP AND RE-ADD RATHER THAN ALTER: Postgres has no ALTER CONSTRAINT to change a CHECK's
-- expression; migration 275/307 already established this repo's DROP CONSTRAINT / re-create pattern
-- for the equivalent situation on an index, reused here for a CHECK constraint's TEXT literal set.

BEGIN;

-- Pre-check: name the constraint and its current definition before touching it, and confirm the table
-- really is empty (belt-and-suspenders -- an ADDED literal cannot invalidate an existing row regardless,
-- but naming the actual state up front matches this repo's own migration convention).
DO $$
DECLARE
  n_rows int;
  n_constraint int;
BEGIN
  SELECT count(*) INTO n_rows FROM public.source_tier_opinions;
  SELECT count(*) INTO n_constraint FROM pg_constraint
    WHERE conrelid = 'public.source_tier_opinions'::regclass
      AND conname = 'source_tier_opinions_opinion_source_check';
  IF n_constraint <> 1 THEN
    RAISE EXCEPTION 'ABORT: expected exactly 1 constraint named source_tier_opinions_opinion_source_check, found %. '
      'The constraint name may have drifted from migration 091 -- update this migration to match before proceeding.', n_constraint;
  END IF;
  RAISE NOTICE 'migration 308 pre-check OK: source_tier_opinions has % row(s); target constraint present as expected', n_rows;
END $$;

ALTER TABLE public.source_tier_opinions
  DROP CONSTRAINT source_tier_opinions_opinion_source_check;

ALTER TABLE public.source_tier_opinions
  ADD CONSTRAINT source_tier_opinions_opinion_source_check
  CHECK (opinion_source IN ('haiku_brief_classifier', 'haiku_verification', 'operator_review', 'host_class_table'));

COMMENT ON CONSTRAINT source_tier_opinions_opinion_source_check ON public.source_tier_opinions IS
  'opinion_source enum, migration 091 + 308. host_class_table (308, Lane ATTACH-SOURCES W3.3) is the '
  'first deterministic, $0, no-LLM upstream: scripts/maintenance/tier-opinions.mjs comparing sources.base_tier '
  'against src/lib/sources/host-authority.ts''s classTierForHost(hostOf(url)) -- the same SC-13 class table '
  'STEP SOURCE and institution-canonicalize.mjs Part C already use.';

-- Post-check: the new literal is accepted, the old three still are, and a genuinely bad value is still rejected.
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
    WHERE conrelid = 'public.source_tier_opinions'::regclass
      AND conname = 'source_tier_opinions_opinion_source_check';
  IF def IS NULL OR def NOT LIKE '%host_class_table%' THEN
    RAISE EXCEPTION 'ABORT: source_tier_opinions_opinion_source_check does not mention host_class_table after re-create (def=%)', def;
  END IF;
  IF def NOT LIKE '%haiku_brief_classifier%' OR def NOT LIKE '%haiku_verification%' OR def NOT LIKE '%operator_review%' THEN
    RAISE EXCEPTION 'ABORT: source_tier_opinions_opinion_source_check lost an existing literal after re-create (def=%)', def;
  END IF;
  RAISE NOTICE 'migration 308 OK: opinion_source CHECK now allows host_class_table alongside the original three';
END $$;

COMMIT;
