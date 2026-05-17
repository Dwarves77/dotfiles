# Sprint 1 Phase 1: Two-Admin-Signals Resolution

**Date:** 2026-05-16
**Phase:** 1 of 11 (READ-ONLY)
**Status:** decision document; awaiting operator approval of resolution A, B, or C before Phase 2
**Branch:** feat/sprint-1-chrome-remediation (off master; PRs #117/#118 unaffected)

## Two admin signals on disk

### Signal 1: `org_memberships.role`

**Schema source of truth:** `fsi-app/supabase/migrations/006_multi_tenant.sql:40-48`

```sql
CREATE TABLE org_memberships (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL,
  role                     TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);
```

**Semantics (per code use):** "admin of an organization" (org-level). Values that grant admin gate: `owner` OR `admin`. Read everywhere as `role === 'owner' || role === 'admin'`.

### Signal 2: `profiles.is_platform_admin`

**Schema source of truth:** `fsi-app/supabase/migrations/075_profiles_consolidation_phase1.sql:74-103`

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_platform_admin IS
  'Caro''s Ledge internal staff flag. Service-role-only writeable. Read by requirePlatformAdmin to gate /admin routes. Migrated from user_profiles.is_platform_admin in 075.';
```

Migrated from `user_profiles.is_platform_admin` (migration 027, now deprecated per 075:330: `'DEPRECATED. Use profiles.is_platform_admin.'`). RLS forbids self-promotion (027:103-107).

**Semantics (per migration comment):** "Caro's Ledge internal staff flag" (platform-level, distinct from any org-level role).

## Consumer inventory

### Consumers of `org_memberships.role` for admin gating

These check `role === 'owner' || role === 'admin'` and treat that as the admin signal:

| File | Lines | Consumer kind | Purpose |
|---|---|---|---|
| `fsi-app/src/lib/auth/admin.ts` | 21-37 | helper `isPlatformAdmin()` | Canonical (misnamed) helper. Imported by 4 admin API routes below. |
| `fsi-app/src/app/admin/page.tsx` | 17-28 | route guard | `/admin` page redirect: non-owner/admin → `/`. |
| `fsi-app/src/app/api/admin/attention/route.ts` | 112 | API gate | Calls `isPlatformAdmin()`. |
| `fsi-app/src/app/api/admin/sources/bulk-import/route.ts` | 331 | API gate | Calls `isPlatformAdmin()`. |
| `fsi-app/src/app/api/admin/sources/verify/route.ts` | 104 | API gate | Calls `isPlatformAdmin()`. |
| `fsi-app/src/app/api/admin/sources/discover/route.ts` | 108 | API gate | Calls `isPlatformAdmin()`. |
| `fsi-app/src/app/api/admin/sources/recently-auto-approved/route.ts` | 53 | API gate | Calls `isPlatformAdmin()`. |
| `fsi-app/src/app/api/admin/integrity-flags/route.ts` | 32-52 | in-file `requireAdminRole()` | Duplicates the helper's logic instead of importing it. |
| `fsi-app/src/app/api/admin/integrity-flags/[id]/regenerate/route.ts` | 43-49 | inline check | Duplicates the helper's logic. |
| `fsi-app/src/app/api/admin/integrity-flags/[id]/resolve/route.ts` | 56-62 | inline check | Duplicates the helper's logic. |
| `fsi-app/src/app/api/admin/coverage/route.ts` | 85-104 | in-file `requireAdminRole()` | Duplicates the helper's logic. |
| `fsi-app/src/lib/supabase-server.ts` | 1736, 1816-1830 | inline `isPlatformAdminInline()` | Fourth duplicate of the helper, used by `fetchAwaitingReview()` (the AWAITING REVIEW STALE widget on dashboard). |
| `fsi-app/src/components/admin/AdminDashboard.tsx` | 508 | display | Renders the role string in the members list. |
| `fsi-app/src/components/admin/OrganizationsTable.tsx` | 89-91 | display | Counts owners/admins per org for the orgs table. |

**Total: 14 sites read `org_memberships.role` for admin-gating purposes (1 canonical helper + 5 import sites + 4 inline duplicates + 1 separate inline duplicate for fetchAwaitingReview + 2 page guards + 2 display consumers).**

### Consumers of `profiles.is_platform_admin`

| File | Lines | Consumer kind | Purpose |
|---|---|---|---|
| `fsi-app/src/app/api/community/posts/[id]/promote/route.ts` | 264-277 | API gate | `direct` promotion requires `profiles.is_platform_admin = true`. THE ONLY API GATE USING `is_platform_admin`. |
| `fsi-app/src/app/community/page.tsx` | 126, 235 | data read | Pulls `is_platform_admin` from profiles, passes as `isPlatformAdmin` prop to Post components. |
| `fsi-app/src/app/community/[slug]/page.tsx` | 164, 269 | data read | Same pattern. |
| `fsi-app/src/app/community/browse/page.tsx` | 203, 320 | data read | Same pattern. |
| `fsi-app/src/app/community/moderation/page.tsx` | 148, 172 | data read | Same pattern. |
| `fsi-app/src/components/community/Post.tsx` | 41, 51, 374 | prop consumer | Passes `isPlatformAdmin` down to `PromotePostButton` / `PromotePostDialog`. |
| `fsi-app/src/components/community/PromotePostButton.tsx` | 62 | UI gate | `canPromote = currentUser.isGroupAdmin || currentUser.isPlatformAdmin`. |
| `fsi-app/src/components/community/PromotePostDialog.tsx` | 365, 376, 382 | UI gate | `direct` promotion radio gated to `currentUser.isPlatformAdmin`. |
| `fsi-app/src/components/community/types.ts` | 70-74 | type definition | Defines the `isPlatformAdmin` prop boundary. |

**Migration consumers:** `fsi-app/supabase/migrations/027_user_profiles.sql:37, 47, 58-59, 85-95, 103-107, 112` (original schema + RLS gate that forbids self-promotion); `032_community_notifications_moderation.sql:246, 272` (RLS in community moderation tables); `041_post_promotions.sql:144` (RLS for promotion); `075_profiles_consolidation_phase1.sql:65, 74-103, 125, 160, 174, 208, 221, 235, 268, 276, 289, 303, 330, 382` (the migration from user_profiles to profiles plus dual-write triggers).

**Total: 9 src sites + 4 migrations read `profiles.is_platform_admin`.**

## Comparison: where signals agree, disagree, or are missing

### Where the signals agree by accident

For most operator accounts, the two signals will collinearly grant or deny admin access because:

- Most platform staff (Jason) are also `org_memberships.role = 'owner'` on the Dietl/Rockit org AND `profiles.is_platform_admin = true`. Both gates pass.
- Most non-staff customers will be `role = 'member'` or `'viewer'` AND `is_platform_admin = false`. Both gates deny.

### Where the signals diverge (the load-bearing case)

| User shape | org admin gates pass? | community direct-promote gate passes? |
|---|---|---|
| Customer org owner: `role='owner', is_platform_admin=false` | ✅ YES (sees /admin, can manage their org's integrity flags, can bulk-import sources) | ❌ NO (cannot direct-promote community posts) |
| Caro's Ledge staff without an org: `is_platform_admin=true`, no `org_memberships` row | ❌ NO (/admin redirects them; helper returns false because the .from('org_memberships').limit(1) returns null) | ✅ YES (can direct-promote community posts via API) |
| Caro's Ledge staff with org: `role='admin', is_platform_admin=true` | ✅ YES | ✅ YES |
| Customer org member: `role='member', is_platform_admin=false` | ❌ NO | ❌ NO |

**The first row is the operator-visible problem.** A customer who happens to be an `owner` of their own organization currently has access to:
- The full `/admin` dashboard
- Provisional source bulk-import
- Source discovery and verification
- Integrity-flag triage and regeneration
- Coverage gaps administration

These are all Caro's Ledge internal-staff surfaces. A customer should not see them, but the current `isPlatformAdmin()` helper says yes because they're an `owner` of their own org.

### Where neither signal is checked but should be (Chrome audit RC-1)

The dashboard widgets the Chrome audit flagged as leaking admin chrome render unconditionally:

- `HomeSurface.tsx:218-251` (Supersessions / REPLACED ss1-ss5 block)
- `DashboardCoverageGaps.tsx:36-121` (Suggest a source / Add to registry CTAs)
- The OPEN ADMIN QUEUE CTA visible to non-admin users
- `ResearchView.tsx:337` (Phase D leak)

These do not consult `isPlatformAdmin()`, do not consult `profiles.is_platform_admin`, do not check `org_memberships.role`. They render unconditionally to any authenticated user.

`fetchAwaitingReview()` (supabase-server.ts:1730) does gate at the DATA layer (returns `[]` for non-admins per its `isPlatformAdminInline` check), but the consuming chrome (the AWAITING REVIEW widget container) does not gate at the COMPONENT layer. Per the Chrome audit, the widget still renders chrome with an empty state for non-admins. The gate exists at one layer; the chrome leak persists at another.

## Cross-cutting finding: TypeScript type drift on role enum

- `fsi-app/supabase/migrations/006_multi_tenant.sql:45` CHECK: `('owner', 'admin', 'member', 'viewer')`
- `fsi-app/src/lib/api/server-bootstrap.ts:34` types as: `"owner" | "admin" | "editor" | "viewer"` (NOTE: `editor` instead of `member`)
- `fsi-app/src/components/auth/AuthProvider.tsx:29` types as: `"owner" | "admin" | "editor" | "viewer"` (same drift)

The TS types include `editor` (not in DB) and exclude `member` (the DB default). The CHECK constraint prevents `editor` from ever being written, so this is a typing bug rather than a runtime bug, but the type system is lying about what the DB accepts. Worth fixing in whichever migration touches the role column.

## Three resolution options

### Option A: `org_memberships.role` becomes canonical; `is_platform_admin` deprecated

Platform admin is reduced to a special role assignment on an org. The platform itself owns a "platform" org; `org_memberships.role = 'admin'` on that org means platform admin.

**Migrations required:**
1. Create a platform-owned organization seed row (if it does not already exist) with a stable known id (e.g., `org_id = '00000000-0000-0000-0000-000000000001'`).
2. For each user with `profiles.is_platform_admin = true`, INSERT or UPDATE an `org_memberships` row with `role = 'admin'` on the platform org_id.
3. Drop `profiles.is_platform_admin` column (after a Phase 4 deprecation cycle to satisfy any RLS policy that still references it).
4. Update RLS policies at `032_community_notifications_moderation.sql:246, 272` and `041_post_promotions.sql:144` to check `org_memberships.role` against the platform org instead of `profiles.is_platform_admin`.

**Code changes:**
- `fsi-app/src/lib/auth/admin.ts:21-37` — keep helper but rewrite to check `role = 'admin'` on the platform org specifically, not the first-org-by-created_at.
- 4 inline duplicates of the helper (integrity-flags, integrity-flags/regenerate, integrity-flags/resolve, coverage, supabase-server.ts:fetchAwaitingReview) — replace with imports of the canonical helper.
- `fsi-app/src/app/api/community/posts/[id]/promote/route.ts:264-277` — replace `profiles.is_platform_admin` read with the canonical helper.
- 5 community pages (page.tsx, [slug]/page.tsx, browse/page.tsx, moderation/page.tsx + Post.tsx prop pipeline) — replace `profiles.is_platform_admin` reads with the canonical helper.
- All TypeScript `Sidebar` / `UserMenu` / `AppShell` role gates already check `role === 'owner' || role === 'admin'`; reading from the platform org instead of the user's first-by-created_at org will narrow the admin set correctly.

**User-facing implications:**
- A customer org owner will lose `/admin` access on day one (correct).
- Existing Caro's Ledge staff who have `is_platform_admin = true` need migration to membership of the platform org (one-time migration script).
- The "platform org" concept becomes a first-class data primitive. Future "platform user" features (cross-tenant admin tooling, staff-only views) anchor here.
- The `org_memberships.role` semantics now do double duty: "admin of this customer's org" AND "Caro's Ledge platform admin if assigned to the platform org". The semantic overload is acceptable if the special org id is well-documented.

### Option B: `profiles.is_platform_admin` becomes canonical for platform admin; `org_memberships.role` reduced to per-org permissions

Platform admin is a profile-level claim. Org membership role is for org-internal admin only (e.g., who can invite members to *their own* org).

**Migrations required:**
1. None on the schema (both columns already exist). Migration writes a comment to `org_memberships.role` explaining that `'admin'` value here means "admin within this customer org" (not "platform admin").
2. Backfill: for every user currently treated as platform admin via `org_memberships.role = 'admin'` (~14 sites), determine whether they should also have `profiles.is_platform_admin = true`. If yes, set it. If no, document why their org-level admin role does not grant platform admin.

**Code changes:**
- `fsi-app/src/lib/auth/admin.ts:21-37` — rewrite to read `profiles.is_platform_admin` instead of `org_memberships.role`.
- `fsi-app/src/lib/supabase-server.ts:1816-1830` — rewrite `isPlatformAdminInline` similarly.
- `fsi-app/src/app/admin/page.tsx:17-28` — rewrite the route guard to read `profiles.is_platform_admin`.
- 4 inline duplicates of the helper (integrity-flags x3, coverage) — rewrite to read `profiles.is_platform_admin`, or replace with imports of the canonical helper.
- `fsi-app/src/app/api/community/posts/[id]/promote/route.ts` — already uses `profiles.is_platform_admin`; no change.
- Community pages already read `profiles.is_platform_admin`; no change.

**User-facing implications:**
- A customer org owner who has `is_platform_admin = false` (the default) will lose `/admin` access on day one (correct).
- Caro's Ledge staff whose `profiles.is_platform_admin = true` retain platform-admin access whether or not they are members of any org.
- Existing customer org admins who are NOT Caro's Ledge staff need their `profiles.is_platform_admin` confirmed as `false` (likely already the case since the column defaults to `false` and self-promotion is RLS-forbidden, but verify via a one-time query).
- The `org_memberships.role` semantics simplify: it is purely about org-internal permissions.
- The migration is essentially zero-schema; mostly code rewrites + a backfill verification query.

### Option C: Both signals kept with explicit semantics

`org_memberships.role` gates org-internal admin actions (e.g., who can invite members to their own customer org, who can adjust their own org's workspace_settings). `profiles.is_platform_admin` gates platform-wide admin surfaces (admin queue, supersession board, integrity flags, source registry, coverage gaps). `isPlatformAdmin()` is renamed and split into two helpers: `requireOrgAdmin()` (org-level) and `requirePlatformAdmin()` (platform-level). Each caller decides which is required.

**Migrations required:**
1. None on the schema (both columns already exist). Migration writes COMMENT ON COLUMN to document the dual-signal semantics on both columns:
   - `org_memberships.role`: "Org-internal role. Values: owner (creator), admin (org admin, can invite/remove), member (default), viewer (read-only). Does NOT grant platform-admin access; for that, see profiles.is_platform_admin."
   - `profiles.is_platform_admin`: "Caro's Ledge internal staff flag. Service-role-only writeable. Grants access to platform-wide admin surfaces (/admin, integrity flags, source registry, supersession board). Does NOT grant access to other orgs' workspace data; for that, the user needs an org_memberships row in the target org."

**Code changes:**
- `fsi-app/src/lib/auth/admin.ts:21-37` — rename `isPlatformAdmin()` to clarify it currently checks org role. Add new function `requirePlatformAdmin()` that reads `profiles.is_platform_admin`. Each caller chooses.
- 5 admin API routes (attention, sources/bulk-import, sources/verify, sources/discover, sources/recently-auto-approved) currently call `isPlatformAdmin()` (which checks org role). Audit each: does the route really need platform-admin (Caro's Ledge staff) or org-admin (customer admin of their own org)? For platform-wide admin surfaces, switch to `requirePlatformAdmin()`.
- 4 inline duplicates (integrity-flags x3, coverage) — same audit; switch as needed.
- `fsi-app/src/app/admin/page.tsx:17-28` — `/admin` is platform-wide, switch to `requirePlatformAdmin()`.
- `fsi-app/src/lib/supabase-server.ts:1816-1830` — `fetchAwaitingReview()` reads platform-admin data; switch to `requirePlatformAdmin()`.
- `fsi-app/src/app/api/community/posts/[id]/promote/route.ts` — already uses `profiles.is_platform_admin`; no change.
- Community pages already read `profiles.is_platform_admin`; no change.

**User-facing implications:**
- A customer org owner who has `is_platform_admin = false` (the default) will lose `/admin` access on day one (correct).
- A customer org owner retains their org-internal admin powers (inviting members to their own org, configuring their own workspace_settings).
- Caro's Ledge staff get platform-admin via `is_platform_admin = true` regardless of org membership.
- The semantic distinction is explicit and named. Future contributors choose the right gate by function name.
- The most code-touched of the three options because every caller is re-audited; but no migration risk because the schema does not change.

## Recommendation

The audit's bias is toward Option C, on three grounds:

1. **Option C makes the semantic distinction explicit at the API surface.** The current helper is misnamed (`isPlatformAdmin()` checks org role); the gap between name and behavior is what produced the customer-can-see-admin bug. Option A keeps the misnamed-helper risk by overloading `role` to mean two things; Option B simplifies but commits to a single signal that may not capture every use case; Option C names the two distinct concepts and lets each caller pick.

2. **Option C has no migration risk.** Schema does not change. The work is code reorganization and per-caller decisions. Compare Option A which requires migrating staff users to a platform org and updating RLS policies; if either step is botched, admin access flickers in production. Option B requires backfilling `is_platform_admin` for the existing 14 admin-gated sites, which means deciding per-user whether their `org_memberships.role = 'admin'` should also grant platform admin; that decision risks mis-tagging.

3. **Option C is the framing the existing migration 075 comment already states.** The COMMENT ON COLUMN at 075:102-103 says "Caro's Ledge internal staff flag. Read by requirePlatformAdmin to gate /admin routes." The migration anticipated this distinction; the code did not catch up. Option C aligns code to the documented intent.

The remaining open question is the per-caller audit (which routes need platform admin vs org admin). The audit recommends platform admin for: /admin route, integrity-flags routes, coverage route, source registry routes (bulk-import, verify, discover, recently-auto-approved), fetchAwaitingReview, community direct-promote. The audit does NOT recommend changing any community-group admin gate (those stay on `community_group_members.role`).

## What changes if operator picks A or B instead

- **If A:** Phase 4 migration creates the platform org seed, backfills staff memberships, drops `profiles.is_platform_admin`, and updates 3 RLS policies. Phase 7 code changes simplify (one canonical helper). Risk: production access flicker during the backfill window.
- **If B:** Phase 4 migration adds COMMENT ON COLUMN documentation only; no DDL. Phase 7 code changes simplify (rewrite helper to read profiles). Risk: backfill verification query must confirm no production user is mis-tagged.
- **If C:** Phase 4 migration adds COMMENT ON COLUMN documentation only; no DDL. Phase 7 code changes are wider (per-caller audit + split helpers). Risk: the audit may miss a route, and a misjudged caller flag carries over.

## Cross-cutting fix to bundle regardless of A/B/C

Fix the TypeScript type drift: `fsi-app/src/lib/api/server-bootstrap.ts:34` and `fsi-app/src/components/auth/AuthProvider.tsx:29` type `role` as `"owner" | "admin" | "editor" | "viewer"`. The DB CHECK at migration `006_multi_tenant.sql:45` is `('owner', 'admin', 'member', 'viewer')`. `editor` does not exist in the DB; `member` is missing from the TS type. The type system is lying about what the DB accepts. Fix in Phase 4 alongside the chosen A/B/C migration.

## Source-of-claim citations

Every claim in this doc reads either:
- A migration file path with line numbers (e.g., `migrations/006_multi_tenant.sql:40-48`)
- A src file path with line numbers (e.g., `src/lib/auth/admin.ts:21-37`)
- Or is an inference labeled as such

No claim reads from TypeScript type names alone. The role CHECK constraint values are read from the migration, not from `server-bootstrap.ts:34`. The `is_platform_admin` semantics are read from migration 075's `COMMENT ON COLUMN`, not from variable names in the consuming code.

## Verification gate

Phase 1 deliverable complete. Decision pending.

**Operator action required:** pick A, B, or C. Then either confirm "proceed to Phase 2" or amend Phase 2 scope based on the resolution.

No code modified. No migrations written. No PR opened. Sprint 1 branch `feat/sprint-1-chrome-remediation` exists locally with only this doc.
