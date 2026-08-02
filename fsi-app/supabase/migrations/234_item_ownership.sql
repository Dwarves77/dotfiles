-- 234_item_ownership.sql — Phase 1 of the item-management program (operator-approved
-- scope, 2026-08-01): real owner assignment. Ownership is ORG-SCOPED team state
-- (operator ruling: priority/team-state is org-scoped), so it lives on
-- workspace_item_overrides — the existing (org_id, item_id) override triad —
-- not a new table (reuse-before-construction).
--
-- owner_user_id      : the assignee. FK profiles(id) — same target org_memberships.user_id
--                      uses. ON DELETE SET NULL: a deleted account silently unassigns
--                      rather than blocking profile deletion or orphaning a uuid.
-- owner_assigned_by  : attribution — who made the assignment (protection-layer pattern
--                      from the team-archive ruling).
-- owner_assigned_at  : when.
--
-- Membership enforcement (assignee must belong to the org) is API-layer: the
-- /api/workspace/overrides writer verifies org_memberships before stamping.
-- A DB-level trigger would also have to fire on membership revocation to stay
-- truthful; the read path treats an owner who left the org as unassigned.

ALTER TABLE public.workspace_item_overrides
  ADD COLUMN IF NOT EXISTS owner_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_assigned_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_assigned_at timestamptz NULL;

-- By-owner rollups filter on (org, owner); partial index keeps it cheap and
-- skips the (vast) unassigned majority.
CREATE INDEX IF NOT EXISTS idx_workspace_item_overrides_org_owner
  ON public.workspace_item_overrides (org_id, owner_user_id)
  WHERE owner_user_id IS NOT NULL;

COMMENT ON COLUMN public.workspace_item_overrides.owner_user_id IS
  'Org-scoped item assignee (Phase 1 ownership, 2026-08-02). FK profiles(id); API layer enforces org membership at write time.';
