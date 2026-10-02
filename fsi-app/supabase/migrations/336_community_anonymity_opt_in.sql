-- subject: Migration 336 (Lane W2-B COMMUNITY-IDENTITY, 2026-09-29). APPLIED 2026-09-30 by the
-- coordinator (confirmed by lane R4-5 MIGRATION-TRUTH-CATALOG-DROPS, 2026-10-01,
-- remediation-plan-2026-09-30.md Lane 4/5), ahead of this lane's own dependent code landing on master
-- (migration two-track policy: schema DDL applies before the dependent code commits). Additive only,
-- reversible: drop the two columns.
--
-- R8.7 amendment (spec 07 Community section, 2026-09-25; ADR-035's sibling identity ruling, operator
-- verbatim): "a room can and should know who you are when you talking. unless you choose to be
-- annonymous"; "people can be anonymous if they choose in a post or as a user." This SUPERSEDES spec
-- 07 item 1's prior default ("Not your name, not your company"). No community table carries an
-- anonymity or identity-display column today [CONFIRMED, wave2b-lanes-2026-09-29.md Facts checked].
--
-- TWO COLUMNS, one per opt-in granularity the amendment names ("per post or per user"):
--
--   1. community_posts.anonymous, PER-POST override. When true, this one post's identity is withheld
--      from the author-identity projection (src/lib/community/identity.mjs) even if the author's
--      account-wide default is to show identity; an anonymous post still keeps the verified-member
--      marker (the amendment's own carve-out: "an anonymous post keeps the verified-member marker so
--      the room can still trust the source without knowing who it is").
--   2. community_member_profiles.default_anonymous, PER-USER default, applied by the composer when
--      the caller does not explicitly set `anonymous` on a given post (POST /api/community/posts).
--      Lives on community_member_profiles (not `profiles`) because it is a COMMUNITY-scoped
--      preference, the same table migration 293 already uses for the member's other Community-only
--      self-service fields (org_type/role/sector/region), self-service writes to it already go
--      through sanitizeMemberWrite()'s allowlist (src/lib/community/profile-policy.mjs), which this
--      lane's code change extends to admit this one additional boolean.
--
-- Both default to false: NOT anonymous, matching the amendment's new default (identity shown unless
-- the user opts in). A pre-existing row backfills to the same default, so no historical post or
-- profile silently becomes anonymous the moment this migration lands.

-- Preconditions
DO $$
BEGIN
  IF to_regclass('public.community_posts') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.community_posts does not exist, migration 030 must be applied first';
  END IF;
  IF to_regclass('public.community_member_profiles') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.community_member_profiles does not exist, migration 293 must be applied first';
  END IF;
END $$;

-- 1. community_posts.anonymous (per-post opt-in)
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS anonymous boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.community_posts.anonymous IS
  'R8.7 amendment (spec 07 Community, 2026-09-25): per-post anonymity opt-in. false (default) shows '
  'the author''s identity per the new identity-by-default rule; true withholds it, the author-identity '
  'projection (identity.mjs) omits name/company but STILL carries the verified-member marker when the '
  'author is verified. Set by the caller on POST /api/community/posts, defaulting to the author''s own '
  'community_member_profiles.default_anonymous when not explicitly supplied.';

-- 2. community_member_profiles.default_anonymous (per-user default)
ALTER TABLE public.community_member_profiles
  ADD COLUMN IF NOT EXISTS default_anonymous boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.community_member_profiles.default_anonymous IS
  'R8.7 amendment (spec 07 Community, 2026-09-25): the member''s account-wide default for the '
  'per-post community_posts.anonymous flag, applied by POST /api/community/posts when a post does not '
  'explicitly set `anonymous`. Self-service via PUT /api/community/profile '
  '(sanitizeMemberWrite, profile-policy.mjs), same self-service posture as org_type/role/sector/region, '
  'never verification-sensitive, so it carries no RLS or REVOKE exception beyond migration 293''s '
  'existing community_member_profiles_update_own policy (self row only).';

-- Post-checks
DO $$
DECLARE
  n_posts_col int;
  n_profiles_col int;
BEGIN
  SELECT count(*) INTO n_posts_col
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'community_posts' AND column_name = 'anonymous';
  IF n_posts_col <> 1 THEN
    RAISE EXCEPTION 'ABORT: community_posts.anonymous did not land (found % matching columns)', n_posts_col;
  END IF;

  SELECT count(*) INTO n_profiles_col
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'community_member_profiles'
     AND column_name = 'default_anonymous';
  IF n_profiles_col <> 1 THEN
    RAISE EXCEPTION 'ABORT: community_member_profiles.default_anonymous did not land (found % matching columns)', n_profiles_col;
  END IF;

  RAISE NOTICE 'migration 336 OK: community_posts.anonymous and community_member_profiles.default_anonymous both landed, both NOT NULL DEFAULT false';
END $$;
