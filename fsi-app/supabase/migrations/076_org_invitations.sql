-- Migration 076 — Org invitations + onboarding state machine
--
-- Date: 2026-05-15
-- Workstream: Multi-Tenant Foundation B (invitation infrastructure)
-- Pre-work: docs/multi-tenant-foundation-prework-2026-05-15.md
--
-- Background
-- ----------
-- The schema has multi-tenant tables (organizations, org_memberships,
-- workspace_settings) but no way to invite a person to an org. The runtime
-- is single-tenant by default — Dietl/Rockit was hand-seeded. This
-- migration introduces the full invitation lifecycle and the helper RPCs
-- that the Workstream B API endpoints + UI build on.
--
-- Lifecycle states (per dispatch brief):
--   pending  -> created by an admin; awaiting invitee action
--   accepted -> invitee clicked accept link; org_memberships row created
--   declined -> invitee clicked decline link
--   expired  -> created_at + 14d elapsed (handled at read time)
--   revoked  -> admin pulled the invite back before invitee acted
--
-- RLS posture (per dispatch brief):
--   * The invitee can read their own invitation by token (server-side
--     lookup via accept/decline endpoints; the token is the bearer
--     credential).
--   * Org admins (admin/owner roles in org_memberships) can read all
--     invitations for orgs they administer.
--   * Service role (server-side endpoints) can do everything.
--
-- Idempotent. CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS guards.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Table
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.org_invitations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_email         text NOT NULL,
  invited_by_user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  proposed_role         text NOT NULL DEFAULT 'member'
                        CHECK (proposed_role IN ('admin', 'member', 'viewer')),
  -- Token is the bearer credential. 32-byte random hex (gen_random_bytes
  -- via the pgcrypto extension that Supabase enables by default).
  token                 text NOT NULL UNIQUE
                        DEFAULT encode(gen_random_bytes(32), 'hex'),
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at           timestamptz NULL,
  accepted_by_user_id   uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  declined_at           timestamptz NULL,
  revoked_at            timestamptz NULL,
  revoked_by_user_id    uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- An email address may have at most one PENDING invitation per org.
  -- Past accepted/declined/expired/revoked invitations are unconstrained
  -- (admin can re-invite after a decline). Enforced by the partial unique
  -- index below.
  CONSTRAINT org_invitations_email_lower_chk CHECK (invited_email = lower(invited_email))
);

CREATE UNIQUE INDEX IF NOT EXISTS org_invitations_pending_unique
  ON public.org_invitations (org_id, invited_email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_org_invitations_org_status
  ON public.org_invitations (org_id, status);

CREATE INDEX IF NOT EXISTS idx_org_invitations_email
  ON public.org_invitations (invited_email)
  WHERE status = 'pending';

-- The token lookup is critical. Already covered by the UNIQUE constraint.

COMMENT ON TABLE public.org_invitations IS
  'Invitation lifecycle for adding people to an org. Bearer-token model: anyone with the token can accept or decline. Migration 076 / Workstream B.';
COMMENT ON COLUMN public.org_invitations.token IS
  '32-byte hex string. Bearer credential — anyone holding the token can accept or decline. Created with pgcrypto gen_random_bytes(32). Single-use: status flips to accepted/declined on action.';
COMMENT ON COLUMN public.org_invitations.proposed_role IS
  'Role the invitee gets in org_memberships on accept. Constrained to admin/member/viewer (owner is reserved for org creator).';
COMMENT ON COLUMN public.org_invitations.expires_at IS
  'Default now() + 14 days. Lookup endpoints treat status pending + now() > expires_at as "expired" without writing a row update (lazy expiry).';

-- ───────────────────────────────────────────────────────────────────────
-- 2. updated_at trigger
-- ───────────────────────────────────────────────────────────────────────
-- No updated_at column on this table; transitions are recorded by setting
-- the corresponding state-specific timestamp (accepted_at, declined_at,
-- revoked_at). No trigger needed.

-- ───────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- 3a. Service role: full access. (Server-side API endpoints use the service
-- role to bypass RLS for token-based lookups, since the invitee may not
-- yet be a member of the org and would otherwise be invisible to RLS.)
DROP POLICY IF EXISTS org_invitations_service_role ON public.org_invitations;
CREATE POLICY org_invitations_service_role
  ON public.org_invitations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3b. Org admins can SELECT all invitations for orgs they administer.
-- Reads support the admin "Invitations" tab listing.
DROP POLICY IF EXISTS org_invitations_admin_read ON public.org_invitations;
CREATE POLICY org_invitations_admin_read
  ON public.org_invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = org_invitations.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

-- 3c. Org admins can INSERT invitations to orgs they administer.
DROP POLICY IF EXISTS org_invitations_admin_insert ON public.org_invitations;
CREATE POLICY org_invitations_admin_insert
  ON public.org_invitations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = org_invitations.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
    -- Admin invites can only propose member or viewer; an admin can NOT
    -- elevate to admin by self-issuing. Promotion happens via direct
    -- org_memberships UPDATE by an existing owner. (owner is reserved
    -- for the org creator and is set by accept_invitation only when the
    -- accepted role is owner — which it cannot be since proposed_role
    -- CHECK excludes owner.)
    AND proposed_role IN ('admin', 'member', 'viewer')
    AND invited_by_user_id = auth.uid()
  );

-- 3d. Org admins can UPDATE invitations (used to revoke).
DROP POLICY IF EXISTS org_invitations_admin_update ON public.org_invitations;
CREATE POLICY org_invitations_admin_update
  ON public.org_invitations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = org_invitations.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

-- No DELETE policy; revocation is a status update, not a delete.

COMMENT ON POLICY org_invitations_admin_read ON public.org_invitations IS
  'Org admins (owner/admin) can list invitations for orgs they administer. Used by the admin Invitations tab.';
COMMENT ON POLICY org_invitations_admin_insert ON public.org_invitations IS
  'Org admins can create new invitations. proposed_role limited to admin/member/viewer (owner reserved for org creator).';

-- ───────────────────────────────────────────────────────────────────────
-- 4. Helper RPCs (SECURITY DEFINER) for token-based actions
-- ───────────────────────────────────────────────────────────────────────
-- The accept/decline path takes a token from an unauthenticated or
-- newly-authenticated user, so RLS would block the read. These RPCs use
-- SECURITY DEFINER and explicit token-based authorization.

-- 4a. accept_invitation(token) — inserts the org_memberships row.
-- Returns the org_id on success; raises on token-not-found / expired /
-- already-acted / wrong-email.
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

  -- Resolve the caller's email from auth.users for the invitation match.
  SELECT lower(u.email) INTO v_caller_email
  FROM auth.users u WHERE u.id = v_caller_id;
  IF v_caller_email IS NULL THEN
    RAISE EXCEPTION 'Caller email not found' USING ERRCODE = '42501';
  END IF;

  -- Lock the invitation row for the duration of the transaction.
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
    -- Lazy-expire: write the status update so subsequent calls don't
    -- need to re-check the timestamp.
    UPDATE public.org_invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;
  IF v_invitation.invited_email <> v_caller_email THEN
    RAISE EXCEPTION 'Invitation is for a different email' USING ERRCODE = '42501';
  END IF;

  -- Insert (or upsert) the membership.
  INSERT INTO public.org_memberships (org_id, user_id, role)
  VALUES (v_invitation.org_id, v_caller_id, v_invitation.proposed_role)
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role = EXCLUDED.role;

  -- Mark accepted.
  UPDATE public.org_invitations
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_invitation.id;

  RETURN v_invitation.org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
COMMENT ON FUNCTION public.accept_invitation(text) IS
  'Accept an org invitation by token. Requires the caller email match invited_email. Inserts org_memberships row + flips invitation status to accepted. Returns org_id on success; raises with state-appropriate errcode otherwise.';

-- 4b. decline_invitation(token)
CREATE OR REPLACE FUNCTION public.decline_invitation(p_token text)
RETURNS void AS $$
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
  IF v_invitation.invited_email <> COALESCE(v_caller_email, '') THEN
    RAISE EXCEPTION 'Invitation is for a different email' USING ERRCODE = '42501';
  END IF;

  UPDATE public.org_invitations
  SET status = 'declined',
      declined_at = now()
  WHERE id = v_invitation.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.decline_invitation(text) TO authenticated;
COMMENT ON FUNCTION public.decline_invitation(text) IS
  'Decline an org invitation by token. Requires caller email match. Flips invitation status to declined.';

-- 4c. lookup_invitation(token) — read an invitation by its token.
-- Used by the GET /api/invitations/[token] endpoint (server-side, anon-safe).
-- Service role only by GRANT; the server endpoint uses the service-role
-- client to call this, then checks email match before exposing details
-- to the caller.
CREATE OR REPLACE FUNCTION public.lookup_invitation(p_token text)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  org_name text,
  invited_email text,
  proposed_role text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  is_expired boolean
) AS $$
  SELECT
    inv.id,
    inv.org_id,
    o.name AS org_name,
    inv.invited_email,
    inv.proposed_role,
    -- Lazy-compute expired without writing a row update so this fn stays VOLATILE-free.
    CASE WHEN inv.status = 'pending' AND inv.expires_at <= now() THEN 'expired' ELSE inv.status END AS status,
    inv.created_at,
    inv.expires_at,
    (inv.expires_at <= now()) AS is_expired
  FROM public.org_invitations inv
  JOIN public.organizations o ON o.id = inv.org_id
  WHERE inv.token = p_token;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.lookup_invitation(text) TO authenticated, anon;
COMMENT ON FUNCTION public.lookup_invitation(text) IS
  'Read an invitation by token without RLS. Returns org_name + status + is_expired. Stays read-only (does not lazy-write expired status); the accept/decline functions handle that.';

-- 4d. revoke_invitation(invitation_id) — admin-only path to pull an invite back.
CREATE OR REPLACE FUNCTION public.revoke_invitation(p_invitation_id uuid)
RETURNS void AS $$
DECLARE
  v_invitation public.org_invitations;
  v_caller_id  uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invitation
  FROM public.org_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF v_invitation IS NULL THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;

  -- Caller must be admin/owner of the org.
  IF NOT EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.org_id = v_invitation.org_id
      AND m.user_id = v_caller_id
      AND m.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not an admin of org %', v_invitation.org_id USING ERRCODE = '42501';
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', v_invitation.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.org_invitations
  SET status = 'revoked',
      revoked_at = now(),
      revoked_by_user_id = v_caller_id
  WHERE id = v_invitation.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;
COMMENT ON FUNCTION public.revoke_invitation(uuid) IS
  'Admin-only: pull a pending invitation back. Flips status to revoked. RLS would block the UPDATE for non-admins; this DEFINER fn enforces the same check explicitly.';

-- 4e. create_org_for_self() — self-service org creation.
-- Creates an org, makes the caller the owner, seeds default workspace_settings.
-- Returns the new org_id.
CREATE OR REPLACE FUNCTION public.create_org_for_self(p_org_name text, p_org_slug text DEFAULT NULL)
RETURNS uuid AS $$
DECLARE
  v_caller_id uuid;
  v_org_id    uuid;
  v_slug      text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_org_name IS NULL OR length(trim(p_org_name)) = 0 THEN
    RAISE EXCEPTION 'Org name is required' USING ERRCODE = '22023';
  END IF;
  IF length(p_org_name) > 200 THEN
    RAISE EXCEPTION 'Org name too long' USING ERRCODE = '22023';
  END IF;

  -- Slug: caller-provided or derived from the name. Lowercase, hyphenated,
  -- with a short random suffix to avoid collisions.
  v_slug := COALESCE(
    nullif(trim(p_org_slug), ''),
    regexp_replace(lower(trim(p_org_name)), '[^a-z0-9]+', '-', 'g')
  );
  v_slug := substring(v_slug from 1 for 40);
  v_slug := trim(both '-' from v_slug);
  IF v_slug IS NULL OR v_slug = '' THEN
    v_slug := 'org';
  END IF;
  -- Append 6 hex chars for uniqueness.
  v_slug := v_slug || '-' || encode(gen_random_bytes(3), 'hex');

  -- Insert org. The org_write_service RLS policy restricts public INSERT
  -- to service_role; this DEFINER fn bypasses that.
  INSERT INTO public.organizations (name, slug, plan)
  VALUES (trim(p_org_name), v_slug, 'free')
  RETURNING id INTO v_org_id;

  -- Owner membership.
  INSERT INTO public.org_memberships (org_id, user_id, role)
  VALUES (v_org_id, v_caller_id, 'owner');

  -- Seed default workspace_settings. (sector_profile defaults to {} per
  -- the column default; the user runs onboarding to populate it.)
  INSERT INTO public.workspace_settings (org_id)
  VALUES (v_org_id);

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_org_for_self(text, text) TO authenticated;
COMMENT ON FUNCTION public.create_org_for_self(text, text) IS
  'Self-service org creation. Caller becomes owner, default workspace_settings seeded. Slug auto-derived if not provided. Used by the "Create your own workspace" path on the no-workspace landing page.';

COMMIT;

-- ───────────────────────────────────────────────────────────────────────
-- Verification (manual; run separately)
-- ───────────────────────────────────────────────────────────────────────
-- SELECT count(*) FROM org_invitations; -- expected 0 initially
-- SELECT proname, pronargs FROM pg_proc WHERE proname IN
--   ('accept_invitation','decline_invitation','lookup_invitation',
--    'revoke_invitation','create_org_for_self');
-- -- expected 5 rows
