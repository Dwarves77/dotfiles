-- subject: Migration 351 (lane S3-C, 2026-10-04): `theme_briefs` gains nullable structured columns, `sections jsonb`, `claims jsonb` and `member_ids uuid[]`, so a theme brief authored through the theme-briefs batch pattern keeps its five sections, its claim list and the membership it was written for. APPLIED (production ledger version 20261006030519, as of 2026-10-07): authored only, applied by the coordinator before the dependent writer runs live (standing rule 3, schema DDL first); the writer (scripts/turns/apply-theme-briefs.mjs) probes for the columns and writes the base columns only until then. Additive and nullable, no default, no CHECK, no backfill; RLS unchanged (public SELECT per 280, service-role writes).
-- 351 -- theme_briefs: structured sections, claims and the membership a brief was written for.
--
-- WHY. The theme-briefs batch pattern (scripts/turns/theme-briefs/README.md) authors a brief as five sections
-- (connection, meaning, ramifications, watch, gaps) plus a claim list tying every stated fact to a grounded
-- claim of a member. brief_md keeps the sections rendered in order under fixed headings (what every reader
-- already consumes); `sections` and `claims` keep the structured form so a surface can render one section on
-- its own and a later audit can re-check a claim against its grounded source without parsing markdown.
--
-- WHY member_ids. A theme id is its smallest member id (cluster.mjs), so a membership change can move the id
-- and orphan the brief stored under the old one. theme_briefs stores only an md5 of the membership
-- (member_hash), which cannot be compared for overlap. member_ids stores the membership itself, which is what
-- lets resolveBriefForTheme (src/lib/connections/brief-staleness.mjs) find the best overlapping prior brief
-- and serve it as stale instead of losing it. Briefs written before this migration have no member_ids; they
-- are found through the latest connection_theme_runs.theme_delta lineage (migration 276) instead.
--
-- ADDITIVE AND SAFE. Three nullable columns, nothing else: no default, no CHECK, no backfill (existing rows
-- keep their brief_md and member_hash untouched), no RLS change. The writer tolerates their absence, so the
-- order of "migration applied" and "writer dispatched" is not load-bearing; applying first is the standing
-- two-track policy for schema DDL.
--
-- REVERSAL (not shipped as a rollback file, an additive nullable column set on a small table):
--   ALTER TABLE public.theme_briefs DROP COLUMN IF EXISTS sections, DROP COLUMN IF EXISTS claims, DROP COLUMN IF EXISTS member_ids;

BEGIN;

ALTER TABLE public.theme_briefs
  ADD COLUMN IF NOT EXISTS sections jsonb,
  ADD COLUMN IF NOT EXISTS claims jsonb,
  ADD COLUMN IF NOT EXISTS member_ids uuid[];

COMMENT ON COLUMN public.theme_briefs.sections IS
  'Structured theme brief: {connection, meaning, ramifications, watch, gaps}, each a markdown string. brief_md is these rendered in order under fixed headings. NULL for a brief written before migration 351.';
COMMENT ON COLUMN public.theme_briefs.claims IS
  'Every factual statement in sections: [{section, text, member_id, claim_ids}], claim_ids being grounded section_claim_provenance ids of that member (or, in the watch section, item_forward_events ids). NULL for a brief written before migration 351.';
COMMENT ON COLUMN public.theme_briefs.member_ids IS
  'The theme membership the brief was written for (sorted). Lets a drifted theme id find its prior brief by member overlap (brief-staleness.mjs resolveBriefForTheme); member_hash is the md5 of the same set. NULL for a brief written before migration 351.';

-- Post-check: the three columns exist, are nullable, and have the intended types.
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'theme_briefs'
     AND is_nullable = 'YES'
     AND ((column_name = 'sections' AND data_type = 'jsonb')
       OR (column_name = 'claims' AND data_type = 'jsonb')
       OR (column_name = 'member_ids' AND data_type = 'ARRAY'));
  IF n <> 3 THEN
    RAISE EXCEPTION 'ABORT: theme_briefs structured columns not created as expected (found % of 3)', n;
  END IF;
  RAISE NOTICE 'migration 351 OK: theme_briefs.sections, claims, member_ids added (nullable, no backfill)';
END $$;

COMMIT;
