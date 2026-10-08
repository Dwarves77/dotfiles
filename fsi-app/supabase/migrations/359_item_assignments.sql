-- subject: Migration 359 (lane S8-A, 2026-10-07, plan Stage 8 bullet 1): `item_assignments`, multi-person assignment of any intelligence item to members of the caller's own org (one row per org, item and assignee, optional due date, state open or done; the assignee must hold the role member, admin or owner, a viewer is not assignable) with RLS and a column guard trigger, and the `assignment` value added to the notifications.kind CHECK so an assignment notifies each assignee through the existing Community notification machinery (migrations 032 and 235); coordination metadata only, never analysed, never read by any other page or the flywheel (ADR-042, ADR-043); APPLIED (production ledger version 20261008034443, as of 2026-10-08)
-- 359 -- item_assignments (lane S8-A, 2026-10-07).
--
-- APPLIED (production ledger version 20261008034443, as of 2026-10-08). Authored by lane S8-A; the coordinator applies it (two-track policy, CLAUDE.md standing rule 3) BEFORE the
-- routes under src/app/api/workspace/items/[id]/assignments/ and the 'assignment' notification kind in
-- src/lib/notifications/dispatch.ts are deployed. Requires migrations 006 (organizations, org_memberships,
-- user_belongs_to_org), 032 and 235 (notifications and its kind CHECK, which this file replaces), and the profiles table.
--
-- DESIGN.
--   * REUSE DECISION. workspace_item_overrides.owner_user_id (migration 234) is a SINGLE org-scoped owner per item and stays
--     as it is (OwnerTeamCard's one "Assignee" select). It cannot hold several assignees, a due date or a done state, so
--     this table is the multi-person assignment the plan asks for; the two do not share rows and neither writes the other.
--   * ONE ROW per (org_id, item_id, assignee_user_id) (UNIQUE). The assignee must be a member of the same org AND hold the
--     role member, admin or owner: a viewer is readable-only and is not assignable (coordinator ruling 2026-10-07). The
--     INSERT policy checks both, and the route checks both (an assignment outside the company group is refused, same
--     rule as the overrides route's ownerUserId guard).
--   * WHO MAY DO WHAT. Read: any org member. Assign: owner, admin or member, as themselves (assigned_by = auth.uid()), to
--     a member of that org. Change state, or remove an assignment: the assignee, the person who assigned, or an owner or
--     admin of the org. The item_assignments_guard trigger lets an authenticated caller change ONLY state; everything
--     else is immutable (a due date is set when the assignment is made; to change it, remove and assign again).
--     service_role (the routes' client) bypasses RLS and the guard, so the routes enforce the same rules in code
--     (src/lib/workspace/item-assignments.mjs).
--   * NOTIFICATION. notifications.kind gains 'assignment'. The CHECK is replaced with the 235 list plus the new value; every
--     existing row already satisfies it. The row itself is inserted by dispatchNotification (service role), unchanged.
--
-- SELF-CHECK. The final DO block attacks the table on LIVE rows inside a subtransaction it always rolls back, same method
-- and same skip rule as migration 358: an outsider reads nothing and cannot assign; an assignee can mark their own
-- assignment done but cannot change its due date; a plain member who is neither assignee nor assigner cannot change it.
--
-- Reversible: DROP TABLE public.item_assignments; DROP FUNCTION public.item_assignments_guard(); restore the 235 CHECK:
-- ALTER TABLE public.notifications DROP CONSTRAINT notifications_kind_check; ALTER TABLE public.notifications ADD CONSTRAINT
-- notifications_kind_check CHECK (kind = ANY (ARRAY['mention','reply','promote','invite','moderation','archive'])) (first delete
-- any 'assignment' notification rows).

BEGIN;

-- 1. The table -------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_assignments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id          uuid        NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  assignee_user_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_on           date,
  state            text        NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'done')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_assignments_unique_assignee UNIQUE (org_id, item_id, assignee_user_id)
);

COMMENT ON TABLE public.item_assignments IS
  'Migration 359. Multi-person assignment of an intelligence item to members of the caller''s own org, with an optional due date and an open or done state. Coordination metadata only: never analysed, never read by another page or the flywheel (ADR-042, ADR-043). Distinct from workspace_item_overrides.owner_user_id (migration 234), the single owner.';

CREATE INDEX IF NOT EXISTS item_assignments_org_item_idx ON public.item_assignments (org_id, item_id);
CREATE INDEX IF NOT EXISTS item_assignments_assignee_idx ON public.item_assignments (assignee_user_id, state);
CREATE INDEX IF NOT EXISTS item_assignments_item_idx ON public.item_assignments (item_id);
CREATE INDEX IF NOT EXISTS item_assignments_assigned_by_idx ON public.item_assignments (assigned_by);

-- 2. RLS -------------------------------------------------------------------------------------------------------------
ALTER TABLE public.item_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.item_assignments FROM anon;

DROP POLICY IF EXISTS item_assignments_read_org ON public.item_assignments;
CREATE POLICY item_assignments_read_org ON public.item_assignments
  FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS item_assignments_insert_member ON public.item_assignments;
CREATE POLICY item_assignments_insert_member ON public.item_assignments
  FOR INSERT
  WITH CHECK (
    (
      assigned_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.org_id = item_assignments.org_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin', 'member')
      )
      AND EXISTS (
        SELECT 1 FROM public.org_memberships a
        WHERE a.org_id = item_assignments.org_id
          AND a.user_id = item_assignments.assignee_user_id
          AND a.role IN ('owner', 'admin', 'member')
      )
    )
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS item_assignments_update_party ON public.item_assignments;
CREATE POLICY item_assignments_update_party ON public.item_assignments
  FOR UPDATE
  USING (
    (
      public.user_belongs_to_org(org_id)
      AND (assignee_user_id = auth.uid() OR assigned_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = item_assignments.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    (
      public.user_belongs_to_org(org_id)
      AND (assignee_user_id = auth.uid() OR assigned_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = item_assignments.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS item_assignments_delete_party ON public.item_assignments;
CREATE POLICY item_assignments_delete_party ON public.item_assignments
  FOR DELETE
  USING (
    (
      public.user_belongs_to_org(org_id)
      AND (assignee_user_id = auth.uid() OR assigned_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = item_assignments.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  );

-- 3. Column guard: an authenticated caller may change state and nothing else ----------------------------------------
CREATE OR REPLACE FUNCTION public.item_assignments_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.assignee_user_id IS DISTINCT FROM OLD.assignee_user_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.due_on IS DISTINCT FROM OLD.due_on
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'item_assignments: only state may change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS item_assignments_guard_trg ON public.item_assignments;
CREATE TRIGGER item_assignments_guard_trg
  BEFORE UPDATE ON public.item_assignments
  FOR EACH ROW EXECUTE FUNCTION public.item_assignments_guard();

-- 4. Notification kind -----------------------------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY['mention'::text, 'reply'::text, 'promote'::text, 'invite'::text, 'moderation'::text, 'archive'::text, 'assignment'::text]));

-- 5. Self-check: attack the table on live rows, always roll back ---------------------------------------------------------
DO $check$
DECLARE
  v_org       uuid;
  v_assigner  uuid;
  v_assignee  uuid;
  v_bystander uuid;
  v_viewer    uuid;
  v_outsider  uuid;
  v_item      uuid;
  v_row       uuid;
  v_n         integer;
BEGIN
  SELECT m.org_id, m.user_id INTO v_org, v_assigner
    FROM public.org_memberships m
   WHERE m.role IN ('owner', 'admin', 'member')
   ORDER BY m.created_at
   LIMIT 1;
  SELECT i.id INTO v_item FROM public.intelligence_items i LIMIT 1;

  IF v_org IS NULL OR v_item IS NULL THEN
    RAISE NOTICE 'migration 359 self-check SKIPPED: no live org member or no intelligence item to attack with';
    RETURN;
  END IF;

  -- The assignee may be the assigner when the org has a single member; the bystander needs a third member with role member.
  SELECT m.user_id INTO v_assignee
    FROM public.org_memberships m
   WHERE m.org_id = v_org AND m.user_id <> v_assigner AND m.role IN ('owner', 'admin', 'member')
   ORDER BY m.created_at
   LIMIT 1;
  IF v_assignee IS NULL THEN
    v_assignee := v_assigner;
  END IF;
  SELECT m.user_id INTO v_bystander
    FROM public.org_memberships m
   WHERE m.org_id = v_org AND m.role = 'member' AND m.user_id NOT IN (v_assigner, v_assignee)
   LIMIT 1;
  SELECT m.user_id INTO v_viewer
    FROM public.org_memberships m
   WHERE m.org_id = v_org AND m.role = 'viewer'
   LIMIT 1;
  SELECT p.id INTO v_outsider
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.org_id = v_org AND m.user_id = p.id)
   LIMIT 1;

  BEGIN
    INSERT INTO public.item_assignments (org_id, item_id, assignee_user_id, assigned_by, due_on)
    VALUES (v_org, v_item, v_assignee, v_assigner, current_date + 7)
    RETURNING id INTO v_row;

    -- ATTACK 1: a caller outside the org reads nothing and cannot assign.
    IF v_outsider IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO v_n FROM public.item_assignments WHERE org_id = v_org;
      IF v_n <> 0 THEN
        RAISE EXCEPTION 'ATTACK FAILED: a caller outside the org read % item_assignments rows', v_n;
      END IF;
      BEGIN
        INSERT INTO public.item_assignments (org_id, item_id, assignee_user_id, assigned_by)
        VALUES (v_org, v_item, v_outsider, v_outsider);
        RAISE EXCEPTION 'ATTACK FAILED: a caller outside the org inserted an item_assignments row';
      EXCEPTION WHEN insufficient_privilege THEN
        NULL;
      END;
      RESET ROLE;
    ELSE
      RAISE NOTICE 'migration 359 self-check: no profile outside org %, cross-org steps skipped', v_org;
    END IF;

    -- ATTACK 1b: a viewer of the org is not assignable.
    IF v_viewer IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_assigner, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      BEGIN
        INSERT INTO public.item_assignments (org_id, item_id, assignee_user_id, assigned_by)
        VALUES (v_org, v_item, v_viewer, v_assigner);
        RAISE EXCEPTION 'ATTACK FAILED: a viewer was assigned';
      EXCEPTION WHEN insufficient_privilege THEN
        NULL;
      END;
      RESET ROLE;
    ELSE
      RAISE NOTICE 'migration 359 self-check: org % has no viewer, viewer step skipped', v_org;
    END IF;

    -- ATTACK 2: the assignee can mark done but cannot change the due date.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_assignee, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.item_assignments SET state = 'done' WHERE id = v_row;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'ATTACK FAILED: the assignee could not mark their own assignment done (% rows)', v_n;
    END IF;
    BEGIN
      UPDATE public.item_assignments SET due_on = current_date + 30 WHERE id = v_row;
      RAISE EXCEPTION 'ATTACK FAILED: the due date was changed by an authenticated caller';
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
    RESET ROLE;

    -- ATTACK 3: a plain member who is neither assignee nor assigner cannot change it.
    IF v_bystander IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bystander, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      UPDATE public.item_assignments SET state = 'open' WHERE id = v_row;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 0 THEN
        RAISE EXCEPTION 'ATTACK FAILED: a bystander member changed someone else''s assignment';
      END IF;
      RESET ROLE;
    ELSE
      RAISE NOTICE 'migration 359 self-check: no third plain member in org %, bystander step skipped', v_org;
    END IF;

    RAISE EXCEPTION 'item_assignments self-check passed (rolled back)' USING ERRCODE = 'P0001';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'item_assignments self-check passed (rolled back)' THEN
      RAISE;
    END IF;
  END;

  RAISE NOTICE 'migration 359 OK: item_assignments created with RLS and column guard, notifications.kind accepts assignment; adversarial self-check passed and rolled back';
END
$check$;

COMMIT;
