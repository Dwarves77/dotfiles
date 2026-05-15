-- Migration 075 — Consolidate user_profiles into profiles (Phase 1)
--
-- Date: 2026-05-15
-- Workstream: Multi-Tenant Foundation A (schema cleanup)
-- Pre-work: docs/multi-tenant-foundation-prework-2026-05-15.md
--
-- Background
-- ----------
-- The schema has two parallel person-identity tables:
--   * `profiles` (27 cols, introduced 001 + extended 027): canonical
--     person identity. Holds auth/display fields, LinkedIn verification,
--     community contribution score, membership tier. ALL community FKs
--     point here (forum_threads.author_id, forum_replies.author_id,
--     case_studies.submitter_id, case_study_endorsements.endorser_id,
--     vendor_endorsements.endorser_id, notification_subscriptions.user_id,
--     notification_deliveries.user_id).
--   * `user_profiles` (13 cols, introduced 027): per-user profile overlay.
--     Holds name/headshot/bio/timezone, sectors[], jurisdictions[],
--     transport_modes[], verifier_status, is_platform_admin. NO inbound
--     FKs. user_profiles.user_id FK -> auth.users(id) ON DELETE CASCADE.
--
-- The split is operator-acknowledged tech debt. The product audit S11/S12
-- and the Section 6.8 spec both call it out: name/headshot/bio/timezone
-- belong on the canonical person; sectors[]/jurisdictions[] are PER-USER
-- OVERRIDES of the workspace-level sector_profile/jurisdiction_weights
-- in workspace_settings (the two layers compose into the per-render
-- relevance ranking the audit describes).
--
-- This migration is Phase 1 of a 3-phase rollout (per dispatch):
--   Phase 1 (this migration):
--     * ADD COLUMN to profiles for the new fields with safe defaults.
--     * BACKFILL from user_profiles into the new profiles columns.
--     * INSTALL DUAL-WRITE TRIGGERS so writes to either table mirror to
--       the other for the overlapping columns. Lets readers migrate one
--       at a time without dual-write rot.
--     * MARK user_profiles columns deprecated via COMMENT ON COLUMN.
--     * ADD FK org_memberships.user_id -> profiles.id (was missing).
--   Phase 2 (in this PR, code changes only):
--     * Migrate every .from('user_profiles') reader to .from('profiles').
--   Phase 3 (deferred follow-up PR after Phase 1+2 stable):
--     * Drop the dual-write triggers.
--     * Drop user_profiles.
--
-- Idempotent. ADD COLUMN IF NOT EXISTS, CREATE TRIGGER guarded by
-- DROP TRIGGER IF EXISTS, BACKFILL is upsert-style (UPDATE only when
-- the destination is still its default, never overwrites edits made
-- after this migration).

BEGIN;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Add destination columns to profiles
-- ───────────────────────────────────────────────────────────────────────
-- Most of the user_profiles fields already have a destination column on
-- profiles. The mapping:
--   user_profiles.name              -> profiles.full_name (already exists)
--   user_profiles.headshot_url      -> profiles.avatar_url (already exists)
--   user_profiles.bio               -> profiles.bio (already exists)
--   user_profiles.timezone          -> profiles.timezone (NEW)
--   user_profiles.sectors           -> profiles.sector_overrides (NEW; per-user override layer over workspace_settings.sector_profile)
--   user_profiles.jurisdictions     -> profiles.jurisdiction_overrides (NEW; per-user override layer over workspace_settings.jurisdiction_weights)
--   user_profiles.transport_modes   -> profiles.transport_mode_overrides (NEW; no current org-level mode store)
--   user_profiles.verifier_status   -> profiles.verifier_status (NEW)
--   user_profiles.verifier_since    -> profiles.verifier_since (NEW)
--   user_profiles.is_platform_admin -> profiles.is_platform_admin (NEW)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS sector_overrides text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS jurisdiction_overrides text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS transport_mode_overrides text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verifier_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS verifier_since timestamptz NULL,
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- Re-assert the verifier_status CHECK on profiles (mirrors user_profiles).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_verifier_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_verifier_status_check
      CHECK (verifier_status IN ('none', 'pending', 'active', 'revoked'));
  END IF;
END$$;

COMMENT ON COLUMN public.profiles.timezone IS
  'IANA tz string. Migrated from user_profiles.timezone in 075.';
COMMENT ON COLUMN public.profiles.sector_overrides IS
  'Per-user sector override array. Composes with workspace_settings.sector_profile (the workspace-level default) to produce per-render relevance ranking per Section 6.8 of the v2 audit. Empty = use workspace defaults. Migrated from user_profiles.sectors in 075.';
COMMENT ON COLUMN public.profiles.jurisdiction_overrides IS
  'Per-user jurisdiction override array. Composes with workspace_settings.jurisdiction_weights for ranking. Empty = use workspace defaults. Migrated from user_profiles.jurisdictions in 075.';
COMMENT ON COLUMN public.profiles.transport_mode_overrides IS
  'Per-user transport-mode override array. No org-level equivalent currently exists; reserved for future. Migrated from user_profiles.transport_modes in 075.';
COMMENT ON COLUMN public.profiles.verifier_status IS
  'Editorial-board verifier credential lifecycle: none -> pending -> active -> revoked. Migrated from user_profiles.verifier_status in 075.';
COMMENT ON COLUMN public.profiles.verifier_since IS
  'Timestamp at which verifier_status entered the active state. Migrated from user_profiles.verifier_since in 075.';
COMMENT ON COLUMN public.profiles.is_platform_admin IS
  'Caro''s Ledge internal staff flag. Service-role-only writeable. Read by requirePlatformAdmin to gate /admin routes. Migrated from user_profiles.is_platform_admin in 075.';

-- ───────────────────────────────────────────────────────────────────────
-- 2. Backfill from user_profiles -> profiles
-- ───────────────────────────────────────────────────────────────────────
-- Convention: profiles.id == user_profiles.user_id == auth.users.id.
-- Where the destination column on profiles is still its default value
-- AND the source on user_profiles has a non-default value, copy. We do
-- NOT overwrite existing profiles edits (e.g. profiles.full_name was
-- already set by signup; user_profiles.name might be NULL — don't
-- overwrite full_name with NULL).

-- Safe overwrite: scalar columns where the source is non-NULL and the
-- destination is NULL (or the type's defined empty/default).
UPDATE public.profiles p
SET
  full_name              = COALESCE(p.full_name, up.name),
  avatar_url             = COALESCE(p.avatar_url, up.headshot_url),
  bio                    = COALESCE(p.bio, up.bio),
  timezone               = CASE WHEN p.timezone = 'UTC' AND up.timezone IS NOT NULL AND up.timezone <> 'UTC' THEN up.timezone ELSE p.timezone END,
  verifier_status        = CASE WHEN p.verifier_status = 'none' AND up.verifier_status IS NOT NULL THEN up.verifier_status ELSE p.verifier_status END,
  verifier_since         = COALESCE(p.verifier_since, up.verifier_since),
  is_platform_admin      = (p.is_platform_admin OR COALESCE(up.is_platform_admin, false))
FROM public.user_profiles up
WHERE p.id = up.user_id;

-- Array columns: copy if source non-empty AND destination still empty.
UPDATE public.profiles p
SET sector_overrides = up.sectors
FROM public.user_profiles up
WHERE p.id = up.user_id
  AND p.sector_overrides = '{}'::text[]
  AND up.sectors IS NOT NULL
  AND array_length(up.sectors, 1) > 0;

UPDATE public.profiles p
SET jurisdiction_overrides = up.jurisdictions
FROM public.user_profiles up
WHERE p.id = up.user_id
  AND p.jurisdiction_overrides = '{}'::text[]
  AND up.jurisdictions IS NOT NULL
  AND array_length(up.jurisdictions, 1) > 0;

UPDATE public.profiles p
SET transport_mode_overrides = up.transport_modes
FROM public.user_profiles up
WHERE p.id = up.user_id
  AND p.transport_mode_overrides = '{}'::text[]
  AND up.transport_modes IS NOT NULL
  AND array_length(up.transport_modes, 1) > 0;

-- Insert a profiles row for any user_profiles row that has no matching
-- profiles row. (Belt-and-suspenders: in production today every user
-- has both, but be defensive about partial rollouts on dev / staging.)
INSERT INTO public.profiles (
  id, full_name, avatar_url, bio, timezone,
  sector_overrides, jurisdiction_overrides, transport_mode_overrides,
  verifier_status, verifier_since, is_platform_admin,
  created_at, updated_at
)
SELECT
  up.user_id,
  up.name,
  up.headshot_url,
  up.bio,
  COALESCE(up.timezone, 'UTC'),
  COALESCE(up.sectors, '{}'::text[]),
  COALESCE(up.jurisdictions, '{}'::text[]),
  COALESCE(up.transport_modes, '{}'::text[]),
  COALESCE(up.verifier_status, 'none'),
  up.verifier_since,
  COALESCE(up.is_platform_admin, false),
  COALESCE(up.created_at, now()),
  COALESCE(up.updated_at, now())
FROM public.user_profiles up
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = up.user_id
)
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────
-- 3. Dual-write triggers (Phase 1 -> Phase 2 transition aid)
-- ───────────────────────────────────────────────────────────────────────
-- During Phase 2, readers migrate from user_profiles -> profiles one
-- file at a time. Until the cutover is complete, BOTH tables are read.
-- Writes happen at:
--   * /onboarding (writes user_profiles)
--   * /profile editor (writes user_profiles)
--   * Service-role admin paths (writes either)
-- Without dual-write triggers, a user editing their bio via /profile
-- writes user_profiles.bio but the readers that already migrated to
-- profiles.bio see the stale value.
--
-- Triggers are dropped in Phase 3 once user_profiles is dropped entirely.

-- 3a. user_profiles -> profiles
CREATE OR REPLACE FUNCTION public._mirror_user_profiles_to_profiles()
RETURNS TRIGGER AS $$
BEGIN
  -- Mirror to profiles. Use UPDATE if the row exists, else INSERT (the
  -- profile row should always exist by the time onboarding writes
  -- user_profiles, but be defensive).
  INSERT INTO public.profiles (
    id, full_name, avatar_url, bio, timezone,
    sector_overrides, jurisdiction_overrides, transport_mode_overrides,
    verifier_status, verifier_since, is_platform_admin,
    created_at, updated_at
  ) VALUES (
    NEW.user_id,
    NEW.name,
    NEW.headshot_url,
    NEW.bio,
    COALESCE(NEW.timezone, 'UTC'),
    COALESCE(NEW.sectors, '{}'::text[]),
    COALESCE(NEW.jurisdictions, '{}'::text[]),
    COALESCE(NEW.transport_modes, '{}'::text[]),
    COALESCE(NEW.verifier_status, 'none'),
    NEW.verifier_since,
    COALESCE(NEW.is_platform_admin, false),
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name                = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url               = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    bio                      = COALESCE(EXCLUDED.bio, public.profiles.bio),
    timezone                 = COALESCE(EXCLUDED.timezone, public.profiles.timezone),
    sector_overrides         = COALESCE(EXCLUDED.sector_overrides, public.profiles.sector_overrides),
    jurisdiction_overrides   = COALESCE(EXCLUDED.jurisdiction_overrides, public.profiles.jurisdiction_overrides),
    transport_mode_overrides = COALESCE(EXCLUDED.transport_mode_overrides, public.profiles.transport_mode_overrides),
    verifier_status          = COALESCE(EXCLUDED.verifier_status, public.profiles.verifier_status),
    verifier_since           = COALESCE(EXCLUDED.verifier_since, public.profiles.verifier_since),
    is_platform_admin        = EXCLUDED.is_platform_admin,
    updated_at               = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS user_profiles_mirror_to_profiles ON public.user_profiles;
CREATE TRIGGER user_profiles_mirror_to_profiles
  AFTER INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public._mirror_user_profiles_to_profiles();

COMMENT ON FUNCTION public._mirror_user_profiles_to_profiles() IS
  'Phase 1 dual-write: user_profiles INSERT/UPDATE mirrors to profiles. Dropped in Phase 3 alongside user_profiles itself.';

-- 3b. profiles -> user_profiles
-- Symmetric mirror so /profile editor changes that go to profiles also
-- show up on user_profiles for the readers that haven't migrated yet.
-- Avoids infinite trigger recursion via a row-comparison guard: only
-- mirror if the user_profiles row would actually change.
CREATE OR REPLACE FUNCTION public._mirror_profiles_to_user_profiles()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip the mirror if no overlap-column actually changed.
  IF (
    NEW.full_name              IS NOT DISTINCT FROM OLD.full_name AND
    NEW.avatar_url             IS NOT DISTINCT FROM OLD.avatar_url AND
    NEW.bio                    IS NOT DISTINCT FROM OLD.bio AND
    NEW.timezone               IS NOT DISTINCT FROM OLD.timezone AND
    NEW.sector_overrides       IS NOT DISTINCT FROM OLD.sector_overrides AND
    NEW.jurisdiction_overrides IS NOT DISTINCT FROM OLD.jurisdiction_overrides AND
    NEW.transport_mode_overrides IS NOT DISTINCT FROM OLD.transport_mode_overrides AND
    NEW.verifier_status        IS NOT DISTINCT FROM OLD.verifier_status AND
    NEW.verifier_since         IS NOT DISTINCT FROM OLD.verifier_since AND
    NEW.is_platform_admin      IS NOT DISTINCT FROM OLD.is_platform_admin
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_profiles (
    user_id, name, headshot_url, bio, timezone,
    sectors, jurisdictions, transport_modes,
    verifier_status, verifier_since, is_platform_admin,
    created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.full_name,
    NEW.avatar_url,
    NEW.bio,
    COALESCE(NEW.timezone, 'UTC'),
    COALESCE(NEW.sector_overrides, '{}'::text[]),
    COALESCE(NEW.jurisdiction_overrides, '{}'::text[]),
    COALESCE(NEW.transport_mode_overrides, '{}'::text[]),
    COALESCE(NEW.verifier_status, 'none'),
    NEW.verifier_since,
    COALESCE(NEW.is_platform_admin, false),
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    name              = COALESCE(EXCLUDED.name, public.user_profiles.name),
    headshot_url      = COALESCE(EXCLUDED.headshot_url, public.user_profiles.headshot_url),
    bio               = COALESCE(EXCLUDED.bio, public.user_profiles.bio),
    timezone          = COALESCE(EXCLUDED.timezone, public.user_profiles.timezone),
    sectors           = COALESCE(EXCLUDED.sectors, public.user_profiles.sectors),
    jurisdictions     = COALESCE(EXCLUDED.jurisdictions, public.user_profiles.jurisdictions),
    transport_modes   = COALESCE(EXCLUDED.transport_modes, public.user_profiles.transport_modes),
    verifier_status   = COALESCE(EXCLUDED.verifier_status, public.user_profiles.verifier_status),
    verifier_since    = COALESCE(EXCLUDED.verifier_since, public.user_profiles.verifier_since),
    is_platform_admin = EXCLUDED.is_platform_admin,
    updated_at        = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_mirror_to_user_profiles ON public.profiles;
CREATE TRIGGER profiles_mirror_to_user_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._mirror_profiles_to_user_profiles();

COMMENT ON FUNCTION public._mirror_profiles_to_user_profiles() IS
  'Phase 1 dual-write: profiles UPDATE mirrors to user_profiles. Skipped if no overlap-column changed (prevents recursion). Dropped in Phase 3.';

-- ───────────────────────────────────────────────────────────────────────
-- 4. Mark user_profiles columns deprecated
-- ───────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.user_profiles IS
  'DEPRECATED 2026-05-15 (migration 075). Phase 1 of consolidation: data lives on profiles now; this table is kept and dual-written for one deploy cycle so readers can migrate one at a time. Dropped in Phase 3 follow-up PR.';

COMMENT ON COLUMN public.user_profiles.name IS              'DEPRECATED. Use profiles.full_name.';
COMMENT ON COLUMN public.user_profiles.headshot_url IS      'DEPRECATED. Use profiles.avatar_url.';
COMMENT ON COLUMN public.user_profiles.bio IS               'DEPRECATED. Use profiles.bio.';
COMMENT ON COLUMN public.user_profiles.timezone IS          'DEPRECATED. Use profiles.timezone.';
COMMENT ON COLUMN public.user_profiles.sectors IS           'DEPRECATED. Use profiles.sector_overrides.';
COMMENT ON COLUMN public.user_profiles.jurisdictions IS     'DEPRECATED. Use profiles.jurisdiction_overrides.';
COMMENT ON COLUMN public.user_profiles.transport_modes IS   'DEPRECATED. Use profiles.transport_mode_overrides.';
COMMENT ON COLUMN public.user_profiles.is_platform_admin IS 'DEPRECATED. Use profiles.is_platform_admin.';

-- ───────────────────────────────────────────────────────────────────────
-- 5. Add missing FK org_memberships.user_id -> profiles.id
-- ───────────────────────────────────────────────────────────────────────
-- org_memberships.user_id has NO FK constraint today (verified via
-- pg_constraint). The convention is that user_id == auth.users.id and
-- profiles.id also == auth.users.id, but no constraint enforces this.
-- Adding the FK to profiles.id (NOT auth.users.id) lets PostgREST
-- resolve embeds like `user:profiles!user_id(...)` automatically and
-- catches orphan inserts at the DB layer.
--
-- The backfill above guarantees every existing org_memberships.user_id
-- has a matching profiles.id, so the FK adds cleanly.
--
-- ON DELETE CASCADE matches the semantics of user_profiles->auth.users:
-- if the person is gone, their memberships go too.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'org_memberships_user_id_fkey'
      AND conrelid = 'public.org_memberships'::regclass
  ) THEN
    -- Sanity check: every existing org_memberships.user_id has a profile.
    -- If not, abort (the backfill should have created them).
    IF EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = m.user_id
      )
    ) THEN
      RAISE EXCEPTION 'org_memberships rows reference user_ids with no matching profiles row; aborting FK addition';
    END IF;
    ALTER TABLE public.org_memberships
      ADD CONSTRAINT org_memberships_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END$$;

-- Helpful index for the FK (PostgREST embeds + membership lookups).
CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id
  ON public.org_memberships (user_id);

COMMIT;

-- ───────────────────────────────────────────────────────────────────────
-- Verification (manual; run separately)
-- ───────────────────────────────────────────────────────────────────────
-- SELECT id, full_name, avatar_url, timezone, sector_overrides,
--        jurisdiction_overrides, transport_mode_overrides,
--        verifier_status, is_platform_admin
-- FROM public.profiles;
--
-- Should show the data migrated from user_profiles. The Jason row should
-- have sector_overrides = ARRAY['fine-art', 'live-events', ...].
--
-- After this migration applies, code Phase 2 in the same PR migrates
-- readers from user_profiles to profiles. Phase 3 follow-up PR drops
-- user_profiles entirely.
