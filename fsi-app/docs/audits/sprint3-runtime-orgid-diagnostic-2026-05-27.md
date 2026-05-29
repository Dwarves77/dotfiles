# Runtime orgId Resolution — Diagnostic Correction

**Date:** 2026-05-27
**Status:** Operator framing was wrong on the cookie path. Real bug is user_id mismatch between seed org_membership row and the production-authenticated user. Both Option A and Option B as operator described would NOT fix this.

## Operator's framing (per the paste-back)

> "resolveOrgIdFromCookies returns null because no org_id cookie exists."

This is incorrect. `resolveOrgIdFromCookies` does NOT read an `org_id` cookie. It reads the Supabase AUTH cookie, calls `supabase.auth.getUser()`, then queries `org_memberships` directly. No org_id cookie exists OR is needed.

## Actual code path

`src/lib/api/org.ts:44-60`:

```typescript
export async function resolveOrgIdFromCookies(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.org_id ?? null;
  } catch {
    return null;
  }
}
```

`createSupabaseServerClient()` (in `src/lib/supabase-server-client.ts`) uses `@supabase/ssr` createServerClient with `next/headers` cookies — it correctly reads the `sb-kwrsbpiseruzbfwjpvsp-auth-tok…` auth cookie operator observed in DevTools.

The function returns `null` in three scenarios:
1. supabase.auth.getUser() returns null (auth token invalid/expired)
2. The user IS authenticated, but org_memberships query returns no row
3. Exception is thrown and caught (silent null)

## Likely actual bug: user_id mismatch

The seed/migration history:
- Seed scripts created Dietl/Rockit org (`a0000000-0000-0000-0000-000000000001`)
- Seed inserted ONE row in `org_memberships`: user_id = `2b7d21eb-8ea0-4b8d-a313-744aa3789c75`
- A3 backfill targeted THAT user_id, populating profiles.org_id

When jasonlosh signs up in production via Supabase Auth, they get a NEW auth.users.id. Production app's signup flow (per grep of `src/app/signup`, `src/app/auth`, `src/app/onboarding`) does NOT auto-create an org_membership row — it relies on either:
- Invitation-accept flow (`src/app/invitations/[token]`)
- POST `/api/orgs` → calls `create_org_for_self` RPC (migration 076) — creates a NEW org for the caller
- Manual admin add via admin tooling

**So jasonlosh's production auth.users.id likely ≠ 2b7d21eb-…** The seed's org_membership row points at the seed user_id; jasonlosh's actual production user_id has no row → query returns null → resolveOrgIdFromCookies returns null → runCategoryRpc early-returns empty → 0 items rendered.

## Why operator's Options A + B both miss

**Option A** (set org_id cookie post-auth): the function doesn't read an org_id cookie. Setting one would do nothing. Even if you added cookie-reading code, the upstream bug — no membership row for jasonlosh — would still null-out the resolved org.

**Option B** (derive orgId from authenticated session): this is what the code already does. supabase.auth.getUser() IS reading from the session. The failure is downstream of that — at the org_memberships query.

Both options assume the function is broken. It's not — the data is incomplete (no membership row for the production user).

## Real fix shape

### Diagnostic query (operator runs against production)

```sql
-- Find jasonlosh's actual production user_id
SELECT id, email, created_at FROM auth.users
WHERE email ILIKE '%jasonlosh%' OR email ILIKE '%jason%'
ORDER BY created_at DESC;

-- See what's in org_memberships
SELECT user_id, org_id, role, created_at FROM org_memberships ORDER BY created_at;

-- See what's in profiles
SELECT id, email, full_name, org_id, workspace_role FROM profiles
ORDER BY created_at DESC;
```

Expected finding: jasonlosh's auth.users.id is a NEW UUID, not 2b7d21eb. org_memberships has only the 2b7d21eb seed row. profiles has the 2b7d21eb seed row plus possibly a new row for jasonlosh's production user.

### Fix Option 1 — Update the seed row to match production user_id (simplest)

```sql
-- Replace SEED_USER_ID with 2b7d21eb-8ea0-4b8d-a313-744aa3789c75
-- Replace PROD_USER_ID with the result of the auth.users query above

BEGIN;

-- Repoint the seed org_membership to the real production user
UPDATE org_memberships
SET user_id = '<PROD_USER_ID>'
WHERE user_id = '2b7d21eb-8ea0-4b8d-a313-744aa3789c75';

-- Repoint the seed profile too, OR delete it and let the production
-- profile carry the A3 backfill — operator decides
-- Option a: repoint profile
UPDATE profiles
SET id = '<PROD_USER_ID>'
WHERE id = '2b7d21eb-8ea0-4b8d-a313-744aa3789c75';
-- (won't work — id is PK; can't simply update. Need approach b.)

-- Option b: delete the seed profile (A3 backfill values lost — re-run A3 against PROD_USER_ID)
DELETE FROM profiles WHERE id = '2b7d21eb-8ea0-4b8d-a313-744aa3789c75';
-- Production profile for PROD_USER_ID already exists (auto-created on signup);
-- A3 backfill needs to re-run against that profile.

COMMIT;
```

This is messy because profile.id is the PK and can't be UPDATEd. The cleaner fix is Option 2 below.

### Fix Option 2 — Add new org_membership row for production user (cleanest)

```sql
-- Replace PROD_USER_ID with the result of the auth.users query

BEGIN;

INSERT INTO org_memberships (org_id, user_id, role)
VALUES (
  'a0000000-0000-0000-0000-000000000001',  -- Dietl/Rockit
  '<PROD_USER_ID>',
  'owner'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

-- Backfill profiles for the production user (A3 was run against 2b7d21eb)
UPDATE profiles
SET
  org_id = 'a0000000-0000-0000-0000-000000000001',
  workspace_role = 'owner',
  sector = ARRAY['fine-art','live-events','luxury-goods','film-tv','automotive','humanitarian']
WHERE id = '<PROD_USER_ID>'
  AND org_id IS NULL;

COMMIT;
```

This adds jasonlosh's production user_id to Dietl/Rockit AND populates their profile projection. The seed's 2b7d21eb row stays in place but becomes dead (no auth user behind it).

Either Option 1 or Option 2 is operator-decidable. Option 2 is cleaner; Option 1 fully cleans up the seed leftover.

## A code-side fix worth considering separately (not blocking)

Production-app should auto-provision a default org for users who sign up without an invitation. Currently the signup → onboarding flow doesn't appear to create an org_membership unless the user explicitly creates an org via `/api/orgs`. The onboarding wizard at `/onboarding` may have this gap.

This is a deeper architectural issue: every authenticated user should always have at least one org_membership. The C1 multi-org-switcher dispatch addresses this implicitly (it can't switch among orgs if there are zero), but the underlying gap should be filled at signup time.

Sprint 4 candidate: AUTO-PROVISION-ORG-ON-SIGNUP dispatch. Hooks into the auth callback or onboarding completion to ensure org_memberships always has a row.

## Why operator's "no org_id cookie" framing led astray

Without reading the code, "no cookie named org_id exists" is observationally true (DevTools confirms only the auth cookie is set). The mistake was assuming the function NEEDS that cookie. The function actually uses the auth cookie + DB query. Code-side reading of `resolveOrgIdFromCookies` resolves this in one step.

This is a case where the variable NAME (`resolveOrgIdFromCookies`) misled both operator and me earlier. The function name suggests "reads org_id from cookies," but the implementation reads the auth cookie + queries the DB. A more accurate name would be `resolveOrgIdForSession()` or `resolveCallerOrgId()`.

Not a blocker for the immediate fix, but worth noting as a Sprint 4 cleanup candidate.

## Pre-fix steps reported

- Step 1: cookie name → not a cookie. resolveOrgIdFromCookies reads auth cookie + queries org_memberships.
- Step 2: no middleware.ts in the project. Auth handling is purely in server components + auth/callback route.
- Step 3: auth callback (src/app/auth/callback/route.ts) uses @supabase/ssr exchangeCodeForSession — correctly sets the auth cookie. Does NOT set an org cookie (because the function doesn't need one).
- Step 4: runCategoryRpc has two gates — `!orgId` early-return, and RPC error catch. With a valid orgId, service-role bypasses migration 077's auth check and the RPC runs.

## Recommended next action

Operator runs the diagnostic query against production to confirm:
1. jasonlosh's actual production auth.users.id
2. Whether org_memberships has a row for that user_id
3. Whether profiles has a row for that user_id

Then operator picks Fix Option 1 (repoint seed, complex) or Fix Option 2 (add membership for production user, cleaner). I propose the SQL for whichever option operator chooses.

A1 stays APPLIED-PENDING-PRODUCTION-VERIFICATION. The force-dynamic patch + migrations 098/100 were correct steps but couldn't have resolved this — the bug was upstream of the page render.
