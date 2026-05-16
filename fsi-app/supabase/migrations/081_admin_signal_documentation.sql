-- Migration 081 — Admin signal documentation (Option C resolution)
--
-- Date: 2026-05-16
-- Workstream: Sprint 1 Phase 1 carryforward (admin signal canonicalization)
-- Pre-work: docs/sprint-1/phase-1-admin-signals.md
-- Operator decision: Option C (split helpers, both signals kept with explicit
-- semantics)
--
-- Background
-- ----------
-- Two admin signals exist:
--   * org_memberships.role (CHECK: owner/admin/member/viewer, per migration
--     006:45). Org-level: who can administer THIS org.
--   * profiles.is_platform_admin (boolean, per migration 075:74). Platform-
--     level: Caro's Ledge internal staff flag.
--
-- The application currently misnames the org-level helper as
-- isPlatformAdmin() (src/lib/auth/admin.ts:21-37). Phase 1 confirmed this
-- conflation produces the customer-as-owner = full-platform-admin bug:
-- a customer who creates their own org gets role='owner' which the
-- misnamed helper treats as platform admin, granting access to /admin and
-- internal staff surfaces. Phase 7 splits the helper into
-- requirePlatformAdmin() (reads is_platform_admin) and
-- requireOrgAdmin(orgId) (reads org_memberships.role).
--
-- This migration documents the canonical semantics of both signals via
-- COMMENT ON COLUMN so future readers see the distinction at the schema
-- layer (where it's hardest to drift) and not only in the application
-- code (where it already drifted once).
--
-- No DDL change. COMMENT ON COLUMN is metadata-only.
--
-- Reversibility
-- -------------
-- COMMENT ON COLUMN is idempotent and reversible by resetting to NULL.

BEGIN;

COMMENT ON COLUMN public.org_memberships.role IS
  'Org-internal role. CHECK constraint values: owner | admin | member | viewer (per migration 006:45). owner = org creator; admin = org administrator (can invite/remove members, edit workspace_settings); member = default (read intelligence, assign actions on own watchlist); viewer = read-only. This signal does NOT grant platform-admin access. Customer org owners and admins administer their own org only. For Caro''s Ledge internal staff status, see profiles.is_platform_admin. Phase 7 introduces requireOrgAdmin(org_id) helper that reads this column scoped to a specific org_id; the legacy isPlatformAdmin() helper at src/lib/auth/admin.ts is misnamed (reads this column) and is being split per docs/sprint-1/phase-1-admin-signals.md Option C.';

COMMENT ON COLUMN public.profiles.is_platform_admin IS
  'Caro''s Ledge internal staff flag. Service-role-only writeable per migration 027/075 RLS posture (users cannot self-promote). Grants access to platform-wide admin surfaces: /admin route, integrity flags triage, source registry hygiene, supersession board, the jurisdiction triage queue (added in Sprint 1 Phase 7), the fetchAwaitingReview widget, and community direct-promote. Does NOT grant access to other orgs'' workspace data; cross-org access still requires an org_memberships row in the target org. The Phase 7 requirePlatformAdmin() helper reads this column; the legacy isPlatformAdmin() name in src/lib/auth/admin.ts is misleading (it reads org_memberships.role; being split per docs/sprint-1/phase-1-admin-signals.md Option C).';

COMMIT;
