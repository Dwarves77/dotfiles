-- 046_community_rls_recursion_fix.sql
--
-- Migration 029's RLS policy `community_group_members_select_self_or_admin`
-- did `EXISTS (SELECT 1 FROM community_group_members m2 ...)` directly. The
-- subquery re-triggers the same RLS policy, which Postgres detects as
-- infinite recursion and aborts. This blocks the moderation list endpoint
-- (and any code path that joins community_group_members through RLS in a
-- way that exercises the self-reference).
--
-- Fix: SECURITY DEFINER helper functions that bypass RLS. Use them from
-- RLS policies on community_groups, community_group_members,
-- community_posts so policies don't recursively trigger themselves.

CREATE OR REPLACE FUNCTION user_is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION user_is_group_admin(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_group_members
    WHERE group_id = _group_id AND user_id = _user_id
      AND role IN ('admin', 'moderator')
  );
$$;

CREATE OR REPLACE FUNCTION user_owns_group(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_groups
    WHERE id = _group_id AND owner_user_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION user_is_group_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION user_is_group_admin(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION user_owns_group(uuid, uuid) TO authenticated, anon;

-- Replace the recursive SELECT policy on community_group_members.
DROP POLICY IF EXISTS "community_group_members_select_self_or_admin" ON community_group_members;
CREATE POLICY "community_group_members_select_self_or_admin"
  ON community_group_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR user_is_group_admin(group_id, auth.uid())
    OR user_owns_group(group_id, auth.uid())
  );

-- Replace the recursive DELETE policy on community_group_members.
DROP POLICY IF EXISTS "community_group_members_delete_self_or_admin" ON community_group_members;
CREATE POLICY "community_group_members_delete_self_or_admin"
  ON community_group_members
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR user_is_group_admin(group_id, auth.uid())
    OR user_owns_group(group_id, auth.uid())
  );

-- Refresh community_groups SELECT policy to use the helper instead of inline EXISTS.
DROP POLICY IF EXISTS "community_groups_select_public_or_member" ON community_groups;
CREATE POLICY "community_groups_select_public_or_member"
  ON community_groups
  FOR SELECT
  USING (
    privacy = 'public'
    OR user_is_group_member(id, auth.uid())
  );

DROP POLICY IF EXISTS "community_groups_update_owner_or_admin" ON community_groups;
CREATE POLICY "community_groups_update_owner_or_admin"
  ON community_groups
  FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    OR user_is_group_admin(id, auth.uid())
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR user_is_group_admin(id, auth.uid())
  );

DROP POLICY IF EXISTS "community_groups_delete_owner_or_admin" ON community_groups;
CREATE POLICY "community_groups_delete_owner_or_admin"
  ON community_groups
  FOR DELETE
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM community_group_members m
      WHERE m.group_id = community_groups.id
        AND m.user_id = auth.uid()
        AND m.role = 'admin'
    )
  );

-- community_posts policies that reference community_group_members likely
-- have the same recursion shape — refresh them to use the helper.
DO $$
DECLARE
  has_select_policy bool;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'community_posts'::regclass AND polname = 'community_posts_select_member')
  INTO has_select_policy;
  IF has_select_policy THEN
    DROP POLICY "community_posts_select_member" ON community_posts;
    CREATE POLICY "community_posts_select_member" ON community_posts FOR SELECT
      USING (user_is_group_member(group_id, auth.uid()));
  END IF;
END $$;

COMMENT ON FUNCTION user_is_group_member IS 'SECURITY DEFINER helper to bypass RLS recursion on community_group_members membership checks.';
COMMENT ON FUNCTION user_is_group_admin IS 'SECURITY DEFINER helper for admin/moderator role checks. Bypasses RLS recursion.';
COMMENT ON FUNCTION user_owns_group IS 'SECURITY DEFINER helper for group ownership check. Bypasses RLS recursion.';
