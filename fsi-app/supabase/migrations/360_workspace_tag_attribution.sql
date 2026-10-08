-- subject: Migration 360 (lane s8b-tag-attribution, 2026-10-07, plan Stage 8 tag attribution): a workspace tag shows who applied it and when. READ OF MIGRATION 313 FOUND THE AUTHOR COLUMNS ALREADY PRESENT, so no column is added: `item_workspace_tags.created_by` (the applying member, uuid, nullable, ON DELETE SET NULL) and `created_at` (timestamptz, NOT NULL DEFAULT now()) ARE the applied-by and applied-at pair. This migration asserts both columns and their types, documents the pair as the attribution on the column comments, and leaves RLS and data untouched (no backfill); NOT APPLIED.
-- 360, workspace tag attribution (lane s8b-tag-attribution, 2026-10-07).
--
-- NOT APPLIED. Authored by lane s8b-tag-attribution; the coordinator applies it (two-track policy,
-- CLAUDE.md standing rule 3). It changes no schema object other than two column comments, so the dependent
-- code (src/lib/tags/attribution.ts, the tags GET route's `applications` field, the chip title and the
-- popover list) works whether or not it has been applied; applying it only makes the intent readable from the
-- database catalog and fails loudly if the author pair ever drifts.
--
-- WHY NO NEW COLUMNS. The brief asked for `applied_by uuid` and `applied_at` "if absent". Migration 313
-- created the join as (tag_id, intelligence_item_id, org_id, created_by, created_at), and the tag write route
-- (PUT /api/workspace/tags/[id]/items) already stamps created_by from the session. Adding applied_by and
-- applied_at beside them would be a second copy of the same two facts (reuse before construction, and two
-- columns that must agree is the drift class). The real gap was in the write, not the schema: the route
-- upserted on (tag_id, intelligence_item_id) and so, on a second apply of the same tag, rewrote created_by to
-- the re-applier while created_at kept the first time, pairing one member's name with another's date. The
-- route now upserts with ignoreDuplicates (ON CONFLICT DO NOTHING), so the first applier and date stand.
--
-- RLS is unchanged (migration 313): org-scoped read, insert and delete; INSERT for a member additionally
-- requires created_by = auth.uid(). The route writes through the service role and takes the author from the
-- verified session only, never from the request body.
--
-- Idempotent: COMMENT ON is repeatable; the preconditions only read the catalog.

BEGIN;

-- Preconditions: migration 313 applied and the author pair intact.
DO $$
DECLARE
  n_by int;
  n_at int;
BEGIN
  IF to_regclass('public.item_workspace_tags') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.item_workspace_tags does not exist, migration 313 must be applied first';
  END IF;

  SELECT count(*) INTO n_by FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'item_workspace_tags'
     AND column_name = 'created_by' AND data_type = 'uuid' AND is_nullable = 'YES';
  IF n_by <> 1 THEN
    RAISE EXCEPTION 'ABORT: item_workspace_tags.created_by (uuid, nullable) not found as migration 313 defined it';
  END IF;

  SELECT count(*) INTO n_at FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'item_workspace_tags'
     AND column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO';
  IF n_at <> 1 THEN
    RAISE EXCEPTION 'ABORT: item_workspace_tags.created_at (timestamptz, not null) not found as migration 313 defined it';
  END IF;
END $$;

COMMENT ON COLUMN public.item_workspace_tags.created_by IS
  'Who applied the tag to the item (migration 313, named the attribution by migration 360). Stamped by the tag write route from the verified session, never from the request body; the first applier is kept on a repeat apply; NULL once that account is removed (ON DELETE SET NULL). Shown to workspace members as "applied by <name> on <date>".';
COMMENT ON COLUMN public.item_workspace_tags.created_at IS
  'When the tag was applied to the item (migration 313, named the attribution by migration 360). Shown to workspace members as the date in "applied by <name> on <date>".';

-- Post-check: both comments are in place.
DO $$
BEGIN
  IF col_description('public.item_workspace_tags'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.item_workspace_tags'::regclass AND attname = 'created_by')) NOT LIKE '%applied by <name> on <date>%'
     OR col_description('public.item_workspace_tags'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.item_workspace_tags'::regclass AND attname = 'created_at')) NOT LIKE '%applied by <name> on <date>%' THEN
    RAISE EXCEPTION 'ABORT: attribution column comments were not set';
  END IF;
  RAISE NOTICE 'migration 360 OK: item_workspace_tags.created_by / created_at documented as the tag attribution; no schema change, RLS unchanged.';
END $$;

COMMIT;
