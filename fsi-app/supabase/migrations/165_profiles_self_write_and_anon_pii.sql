-- Migration 165 (Wave-α Track B2) — profiles: self INSERT/UPDATE policies + anon PII column restriction
--
-- AUTHOR-ONLY / OPERATOR DDL WINDOW (RLS + column-privilege change = break-risky class, ADR-011).
-- Authored, apply via the DDL protocol — DO NOT apply inline.
--
-- WHY (master-gap-register P1 #3 + #4; DB-4 F1/F2; X.4):
--   `profiles` has had EXACTLY ONE policy since migration 002: `"Public read"` FOR SELECT USING (true)
--   to role {public}. Two live defects follow:
--     (P1 #3) NO INSERT/UPDATE policy has ever existed. The browser (authenticated) client UPDATEs in
--             UserProfilePage.tsx:142 and OnboardingWizard.tsx:196 match 0 rows with NO error — the UI
--             reports "saved" while nothing persists. Profile self-edit + the onboarding identity step
--             are silently no-ops.
--     (P1 #4) The USING(true) SELECT policy + a table-wide anon SELECT grant expose EVERY column to the
--             anon role, including `email`, `linkedin_sub`, and `is_platform_admin` — PII + an admin flag
--             readable by an unauthenticated client.
--
-- FIX:
--   1. Self INSERT + UPDATE policies to `authenticated` gated on `auth.uid() = id` (a user may write only
--      their own row). Existing service-role writers (provision-personal-workspace.ts:79, linkedin
--      callback:226) are unaffected — the `service_role` key bypasses RLS.
--   2. Column-privilege restriction on the anon role (the mechanism Postgres supports cleanly for
--      column-level read control): REVOKE the table-wide SELECT from anon, then GRANT SELECT back on the
--      34 non-PII columns only. The three sensitive columns (email, linkedin_sub, is_platform_admin) are
--      NOT re-granted, so an anon query touching them errors instead of returning the value.
--      * The `"Public read"` row policy is LEFT INTACT — anon still sees profile ROWS, just not the 3
--        sensitive COLUMNS. Community author joins (display_name, avatar_url, full_name, headline, …) keep
--        working; only email/linkedin_sub/is_platform_admin become anon-inaccessible.
--      * `authenticated` keeps its full column grant (self-reads of own email + the admin gate for a
--        logged-in user still work); `service_role` bypasses grants entirely (the admin gate that reads
--        is_platform_admin runs through the service client — see staged-updates/route.ts).
--
--   Live reader enumeration (grep `.from("profiles")` + CODE-3 select-map): community page/route author
--   joins (safe columns), lib/auth/admin.ts (service/authenticated), server-bootstrap, settingsStore,
--   provision-personal-workspace, linkedin callback. None reads email/linkedin_sub/is_platform_admin off
--   the ANON client — verified against the select-map. The get_workspace_members RPC returns email but is
--   SECURITY DEFINER (runs as definer, bypasses caller column grants).
--
-- POST-APPLY PROOF (see track-b-proofs.md B2):
--   * As the row owner (authenticated): UPDATE own profiles row -> 1 row affected, value round-trips.
--   * As authenticated for a DIFFERENT id: UPDATE -> 0 rows (self-only holds).
--   * As anon: SELECT email FROM profiles -> permission denied for column email.
--   * As anon: SELECT display_name, avatar_url FROM profiles -> succeeds (community join intact).
-- Reversible: rollbacks/165_profiles_self_write_and_anon_pii_rollback.sql.

BEGIN;

-- ── 1. Self-write policies (authenticated, own row only) ────────────────────
DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
CREATE POLICY profiles_self_insert
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 2. Anon column restriction (PII off the anon read path) ─────────────────
-- Drop the table-wide anon SELECT, re-grant only the 34 non-PII columns.
REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (
  id, display_name, role, settings, created_at, updated_at, full_name, headline,
  bio, avatar_url, organization, job_title, linkedin_url, linkedin_verified,
  linkedin_identity_verified, linkedin_workplace_verified,
  linkedin_verification_checked_at, verification_tier, affiliation_type, region,
  topic_interests, membership_tier, contribution_score, notification_preferences,
  last_active_at, timezone, sector_overrides, jurisdiction_overrides,
  transport_mode_overrides, verifier_status, verifier_since, org_id,
  workspace_role, sector
) ON public.profiles TO anon;

COMMIT;
