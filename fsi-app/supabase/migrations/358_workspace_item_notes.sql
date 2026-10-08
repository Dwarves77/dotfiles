-- subject: Migration 358 (lane S8-A, 2026-10-07, plan Stage 8 bullet 1): `item_notes`, threaded private-per-workspace notes on any intelligence item (org members read, the author edits and deletes their own, an owner or admin deletes any, by soft delete), with RLS and a column guard trigger, plus `move_override_notes_to_item_notes()`, the idempotent data move of the single `workspace_item_overrides.notes` text field into the new table; a note is workspace commentary, never analysed, never read by any page other than the item's own detail page, never read by the flywheel (ADR-042, ADR-043); NOT APPLIED
-- 358 -- item_notes (lane S8-A, 2026-10-07).
--
-- APPLIED (production ledger version 20261008034412, as of 2026-10-08). Authored by lane S8-A; the coordinator applies it (two-track policy, CLAUDE.md standing rule 3) BEFORE the
-- routes under src/app/api/workspace/items/[id]/notes/ are deployed. Requires migrations 006 (organizations,
-- org_memberships, workspace_item_overrides, user_belongs_to_org), 075 (org_memberships.user_id -> profiles), and the
-- profiles table itself.
--
-- DESIGN.
--   * REUSE DECISION (brief S8-A: "READ IT FIRST and decide reuse"). workspace_item_overrides.notes (migration 006) is ONE
--     text field per (org, item): no author, no thread, no edit history, last write wins between two members. It cannot
--     carry "list, add, edit own, delete" so it is SUPERSEDED for notes by this table. The field is not dropped here:
--     MarketSignalDetailSurface's NotesField, the overrides route, bootstrap/logic.ts and get_workspace_intelligence still
--     read and write it, and none of those files is in this lane's write set. See the lane report's NEEDS WRITE-SET
--     EXPANSION line. Nothing is lost: the data move below copies every existing note.
--   * ORG SCOPE. Every row carries org_id. Members of that org read it; no other org, and no anon caller, ever does
--     (RLS below; the routes additionally scope every query by the caller's own org resolved server-side, never from the
--     request). item_id references intelligence_items and cascades, same as workspace_item_overrides.
--   * WHO MAY DO WHAT. Read: any org member (a viewer reads). Add: owner, admin or member, as themselves
--     (author_user_id = auth.uid()). Edit the body: the author only, never anyone else (an admin included), enforced by
--     the item_notes_guard trigger because RLS cannot restrict columns. Delete: the author may delete their own note (the
--     same right as editing it, coordinator ruling 2026-10-07) and an owner or admin may delete any note, only by setting
--     deleted_at (soft delete); there is no DELETE policy, DELETE is revoked from anon and authenticated, and a deleted
--     note can neither be edited nor un-deleted by an authenticated caller. service_role (the routes' client) bypasses RLS
--     and the guard, so the routes enforce the same rules in code (src/lib/workspace/item-notes.mjs).
--   * author_user_id is nullable ON PURPOSE: ON DELETE SET NULL keeps a team's notes when a member leaves, and notes moved
--     from the old single field have no author. Such a note has no author, so nobody can edit it; an owner or admin can
--     still delete it.
--   * MOVE OF EXISTING NOTES (data migration, two-track: it runs AFTER the consumer code merges, by the coordinator).
--     public.move_override_notes_to_item_notes() copies each non-empty workspace_item_overrides.notes into one item_notes
--     row (author NULL, created_at = the override's updated_at, legacy_override_id = the override's id). It is idempotent
--     (legacy_override_id is UNIQUE, ON CONFLICT DO NOTHING) and returns the number of rows it inserted. A note longer than
--     the 20000 character cap is left in the old field (nothing is truncated). Staged command, run once after merge:
--         SELECT public.move_override_notes_to_item_notes();
--     Verification: SELECT count(*) FROM public.item_notes WHERE legacy_override_id IS NOT NULL; equals the count of
--     workspace_item_overrides rows with a non-empty notes of at most 20000 characters. Until the old NotesField is
--     retired, a note typed into it after the move is not copied until the function is run again (it picks up only
--     overrides not yet moved). Operator ruling 2026-10-04: no data population until every build layer is complete, so
--     nothing here runs the function.
--
-- SELF-CHECK. The final DO block attacks the table on LIVE rows inside a subtransaction it always rolls back (no fixture
-- is fabricated, so no foreign key can fail, the class that made migration 311's first inline proof unappliable): a
-- caller outside the org reads nothing and cannot insert; a second member of the org cannot edit or soft delete the
-- author's note; the author can edit and soft delete their own. Any step whose live fixture is absent is skipped with a NOTICE.
--
-- Reversible: DROP FUNCTION public.move_override_notes_to_item_notes(); DROP TABLE public.item_notes; DROP FUNCTION
-- public.item_notes_guard(). (The data move copies, it never deletes the source field, so dropping loses nothing.)

BEGIN;

-- 1. The table -------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_notes (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id            uuid        NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  author_user_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  body               text        NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 20000),
  created_at         timestamptz NOT NULL DEFAULT now(),
  edited_at          timestamptz,
  deleted_at         timestamptz,
  legacy_override_id uuid        UNIQUE REFERENCES public.workspace_item_overrides(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.item_notes IS
  'Migration 358. Private-per-workspace notes on an intelligence item. Org members read; the author edits their own; owner or admin soft deletes (deleted_at). Workspace commentary only: never analysed, never read by another page or the flywheel (ADR-042, ADR-043). Supersedes workspace_item_overrides.notes for threaded notes.';
COMMENT ON COLUMN public.item_notes.author_user_id IS
  'NULL for a note moved from workspace_item_overrides.notes (no author existed) and after the author''s profile is deleted. Nobody can edit an authorless note; an owner or admin can delete it.';
COMMENT ON COLUMN public.item_notes.legacy_override_id IS
  'The workspace_item_overrides row whose notes text this row was copied from by move_override_notes_to_item_notes(); UNIQUE so the move is idempotent.';

CREATE INDEX IF NOT EXISTS item_notes_org_item_idx
  ON public.item_notes (org_id, item_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS item_notes_item_idx ON public.item_notes (item_id);
CREATE INDEX IF NOT EXISTS item_notes_author_idx ON public.item_notes (author_user_id);

-- 2. RLS -------------------------------------------------------------------------------------------------------------
ALTER TABLE public.item_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.item_notes FROM anon;
REVOKE DELETE ON public.item_notes FROM authenticated;

DROP POLICY IF EXISTS item_notes_read_org ON public.item_notes;
CREATE POLICY item_notes_read_org ON public.item_notes
  FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS item_notes_insert_member ON public.item_notes;
CREATE POLICY item_notes_insert_member ON public.item_notes
  FOR INSERT
  WITH CHECK (
    (
      author_user_id = auth.uid()
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.org_id = item_notes.org_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin', 'member')
      )
    )
    OR auth.role() = 'service_role'
  );

-- UPDATE is allowed to the author and to an owner or admin of THIS row's org; WHICH columns each may change is the
-- guard trigger's job (RLS cannot restrict columns).
DROP POLICY IF EXISTS item_notes_update_author_or_admin ON public.item_notes;
CREATE POLICY item_notes_update_author_or_admin ON public.item_notes
  FOR UPDATE
  USING (
    (author_user_id = auth.uid() AND public.user_belongs_to_org(org_id))
    OR EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = item_notes.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    (author_user_id = auth.uid() AND public.user_belongs_to_org(org_id))
    OR EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = item_notes.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  );

-- 3. Column guard ----------------------------------------------------------------------------------------------------
-- Applies to authenticated callers only. A trusted context (service_role, or a session with no JWT such as the migration
-- runner) passes untouched; the routes enforce the same rules in code.
CREATE OR REPLACE FUNCTION public.item_notes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_admin boolean;
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.legacy_override_id IS DISTINCT FROM OLD.legacy_override_id THEN
    RAISE EXCEPTION 'item_notes: only body, edited_at and deleted_at may change' USING ERRCODE = '42501';
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'item_notes: a deleted note cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.body IS DISTINCT FROM OLD.body THEN
    IF OLD.author_user_id IS NULL OR OLD.author_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'item_notes: only the author can edit a note' USING ERRCODE = '42501';
    END IF;
    NEW.edited_at := now();
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    SELECT EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = OLD.org_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin')
    ) INTO v_admin;
    IF NOT v_admin AND (OLD.author_user_id IS NULL OR OLD.author_user_id <> auth.uid()) THEN
      RAISE EXCEPTION 'item_notes: only the author or an owner or admin can delete a note' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS item_notes_guard_trg ON public.item_notes;
CREATE TRIGGER item_notes_guard_trg
  BEFORE UPDATE ON public.item_notes
  FOR EACH ROW EXECUTE FUNCTION public.item_notes_guard();

-- 4. The data move (run by the coordinator AFTER the consumer code merges; never run here) ---------------------------
CREATE OR REPLACE FUNCTION public.move_override_notes_to_item_notes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.item_notes (org_id, item_id, author_user_id, body, created_at, legacy_override_id)
  SELECT o.org_id, o.item_id, NULL, btrim(o.notes), COALESCE(o.updated_at, o.created_at), o.id
  FROM public.workspace_item_overrides o
  WHERE btrim(o.notes) <> ''
    AND char_length(btrim(o.notes)) <= 20000
  ON CONFLICT (legacy_override_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END
$fn$;

REVOKE ALL ON FUNCTION public.move_override_notes_to_item_notes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_override_notes_to_item_notes() TO service_role;

-- 5. Self-check: attack the table on live rows, always roll back ---------------------------------------------------------
DO $check$
DECLARE
  v_org         uuid;
  v_author      uuid;
  v_other       uuid;
  v_other_role  text;
  v_outsider    uuid;
  v_item        uuid;
  v_note        uuid;
  v_n           integer;
BEGIN
  SELECT m.org_id, m.user_id INTO v_org, v_author
    FROM public.org_memberships m
   WHERE m.role IN ('owner', 'admin', 'member')
   ORDER BY m.created_at
   LIMIT 1;
  SELECT i.id INTO v_item FROM public.intelligence_items i LIMIT 1;

  IF v_org IS NULL OR v_item IS NULL THEN
    RAISE NOTICE 'migration 358 self-check SKIPPED: no live org member or no intelligence item to attack with';
    RETURN;
  END IF;

  SELECT m.user_id, m.role INTO v_other, v_other_role
    FROM public.org_memberships m
   WHERE m.org_id = v_org AND m.user_id <> v_author AND m.role IN ('owner', 'admin', 'member')
   ORDER BY (m.role = 'member') DESC
   LIMIT 1;
  SELECT p.id INTO v_outsider
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.org_id = v_org AND m.user_id = p.id)
   LIMIT 1;

  BEGIN
    INSERT INTO public.item_notes (org_id, item_id, author_user_id, body)
    VALUES (v_org, v_item, v_author, 'migration 358 self-check probe')
    RETURNING id INTO v_note;

    -- ATTACK 1: a caller outside the org reads nothing and cannot write into it.
    IF v_outsider IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO v_n FROM public.item_notes WHERE org_id = v_org;
      IF v_n <> 0 THEN
        RAISE EXCEPTION 'ATTACK FAILED: a caller outside the org read % item_notes rows', v_n;
      END IF;
      BEGIN
        INSERT INTO public.item_notes (org_id, item_id, author_user_id, body)
        VALUES (v_org, v_item, v_outsider, 'forged');
        RAISE EXCEPTION 'ATTACK FAILED: a caller outside the org inserted an item_notes row';
      EXCEPTION WHEN insufficient_privilege THEN
        NULL;
      END;
      RESET ROLE;
    ELSE
      RAISE NOTICE 'migration 358 self-check: no profile outside org %, cross-org steps skipped', v_org;
    END IF;

    -- ATTACK 2: a second member of the org cannot edit the author's note, and (when that member holds the plain
    -- member role) cannot soft delete it either.
    IF v_other IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      BEGIN
        UPDATE public.item_notes SET body = 'tampered' WHERE id = v_note;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n <> 0 THEN
          RAISE EXCEPTION 'ATTACK FAILED: a second member edited another member''s note';
        END IF;
      EXCEPTION WHEN insufficient_privilege THEN
        NULL;
      END;
      IF v_other_role = 'member' THEN
        BEGIN
          UPDATE public.item_notes SET deleted_at = now() WHERE id = v_note;
          GET DIAGNOSTICS v_n = ROW_COUNT;
          IF v_n <> 0 THEN
            RAISE EXCEPTION 'ATTACK FAILED: a second plain member soft deleted another member''s note';
          END IF;
        EXCEPTION WHEN insufficient_privilege THEN
          NULL;
        END;
      END IF;
      RESET ROLE;
    ELSE
      RAISE NOTICE 'migration 358 self-check: org % has a single member, second-member steps skipped', v_org;
    END IF;

    -- ATTACK 3: the author can edit and can soft delete their own note.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.item_notes SET body = 'edited by the author' WHERE id = v_note;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'ATTACK FAILED: the author could not edit their own note (% rows)', v_n;
    END IF;
    UPDATE public.item_notes SET deleted_at = now() WHERE id = v_note;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'ATTACK FAILED: the author could not delete their own note (% rows)', v_n;
    END IF;
    RESET ROLE;

    RAISE EXCEPTION 'item_notes self-check passed (rolled back)' USING ERRCODE = 'P0001';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'item_notes self-check passed (rolled back)' THEN
      RAISE;
    END IF;
  END;

  RAISE NOTICE 'migration 358 OK: item_notes created with RLS, column guard and data-move function; adversarial self-check passed and rolled back';
END
$check$;

COMMIT;
