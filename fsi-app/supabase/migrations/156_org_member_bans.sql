-- 156_org_member_bans.sql
--
-- ORG-SCOPED member ban (§7 KNOWN NEW BACKEND — operator ruling 2026-07-07:
-- ban is ORG-SCOPED, block-rejoin, NOT a platform-wide account ban). A ban
-- removes the member from the workspace AND records the (org_id, user_id) so
-- the account cannot re-join THAT workspace — via invite-accept or otherwise —
-- until the ban is lifted. It does not touch the account anywhere else.
--
-- Two parts:
--   1. `org_member_bans` — the ban ledger, PK (org_id, user_id).
--   2. `accept_invitation()` gains a ban check so a banned user cannot rejoin
--      by accepting a fresh invitation (the primary rejoin vector; the RPC is
--      the DB-layer choke so every caller is covered). The members-route POST
--      ban action inserts the ban row + removes the membership.
--
-- Reversible: DROP TABLE org_member_bans; restore the 076 function body (the
-- only change here is the added ban check before the membership INSERT).

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_member_bans (
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  banned_at  timestamptz NOT NULL DEFAULT now(),
  reason     text,
  PRIMARY KEY (org_id, user_id)
);

COMMENT ON TABLE public.org_member_bans IS
  'Org-scoped member bans (operator ruling 2026-07-07). A row means (user_id) may not rejoin (org_id) — enforced in accept_invitation() and the members-route add path. NOT a platform-wide account ban; the account is unaffected in every other workspace. Lifting a ban = DELETE the row.';

CREATE INDEX IF NOT EXISTS idx_org_member_bans_user
  ON public.org_member_bans (user_id);

-- RLS: an org's owners/admins may read that org's ban list; writes are
-- service-role only (the members route is the auth boundary), mirroring the
-- org_memberships write posture.
ALTER TABLE public.org_member_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_member_bans_select_owner_admin ON public.org_member_bans;
CREATE POLICY org_member_bans_select_owner_admin
  ON public.org_member_bans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = org_member_bans.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

-- Extend accept_invitation with the ban check. IDENTICAL to migration 076
-- except the ban guard added immediately before the membership INSERT.
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS uuid AS $$
DECLARE
  v_invitation public.org_invitations;
  v_caller_id  uuid;
  v_caller_email text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT lower(u.email) INTO v_caller_email
  FROM auth.users u WHERE u.id = v_caller_id;
  IF v_caller_email IS NULL THEN
    RAISE EXCEPTION 'Caller email not found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invitation
  FROM public.org_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF v_invitation IS NULL THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', v_invitation.status USING ERRCODE = '22023';
  END IF;
  IF v_invitation.expires_at <= now() THEN
    UPDATE public.org_invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;
  IF v_invitation.invited_email <> v_caller_email THEN
    RAISE EXCEPTION 'Invitation is for a different email' USING ERRCODE = '42501';
  END IF;

  -- BAN GUARD (migration 156): a banned account cannot rejoin this workspace,
  -- even with a fresh invitation. Lifting the ban (DELETE the row) is required
  -- first. Errcode 42501 = insufficient privilege.
  IF EXISTS (
    SELECT 1 FROM public.org_member_bans b
    WHERE b.org_id = v_invitation.org_id
      AND b.user_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'This account is banned from the workspace' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.org_memberships (org_id, user_id, role)
  VALUES (v_invitation.org_id, v_caller_id, v_invitation.proposed_role)
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role = EXCLUDED.role;

  UPDATE public.org_invitations
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_invitation.id;

  RETURN v_invitation.org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

COMMIT;
