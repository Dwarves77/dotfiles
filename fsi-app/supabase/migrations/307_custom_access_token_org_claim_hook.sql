-- 307 — custom_access_token_hook: org_id as a JWT custom claim
--
-- PERF-12 lane (2026-09-04, ADR-027 §5 "D5: JWT custom claim via Supabase Auth Hook", line 76-84
-- and the summary table's row 5, docs/decisions/ADR-027-standard-fast-page-architecture.md).
--
-- WRITTEN, NOT APPLIED, AND NOT SELF-ACTIVATING — unlike every other migration in this lane
-- (305/306), a migration alone does NOT turn this on. Creating this SQL function is necessary but
-- not sufficient: Supabase Auth Hooks require a SEPARATE, DASHBOARD-ONLY (or Management-API-only)
-- wiring step that no migration file can perform — there is no `CREATE HOOK` SQL statement, only a
-- project-level Auth configuration pointing at this function. This migration creates the function
-- and its permissions; the operator instructions at the bottom of this file are what actually
-- activates it. Explicitly "do not block on it" (this lane's own brief) — every other PERF-12
-- deliverable (cursor pagination, virtualization, the X-Org-Id verification header) works
-- identically whether or not this hook is ever wired, both before AND after, because the two
-- callers ADR-027 D5 names (`resolveOrgIdFromCookies` / `org.ts`'s `resolveOrgIdFromAuthenticatedClient`,
-- `proxy.ts`'s `getClaims()` call) fail soft to their EXISTING org_memberships lookup whenever the
-- claim is absent — see the "MAKING THE CODE READ THE CLAIM" section below for why that follow-on
-- code change is deliberately NOT made by this migration either.
--
-- THE PROBLEM THIS ADDRESSES (ADR-027 §5, D5): every server-side org resolution today
-- (`resolveOrgIdFromAuthenticatedClient`, `resolveViewerIdentityFromAuthenticatedClient` —
-- src/lib/api/org.ts) is TWO sequential round trips: `supabase.auth.getClaims()` (verify the JWT),
-- THEN a fresh `org_memberships` SELECT keyed off `claims.sub`. A JWT custom claim collapses that
-- to ONE round trip (getClaims() alone) by having org_id ALREADY be part of the verified token —
-- the org lookup happens ONCE, at sign-in/token-refresh time (this hook), not on every subsequent
-- request that needs the org id.
--
-- THE HOOK CONTRACT (supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook,
-- confirmed 2026-09-04 by prior reading, no live Management API access from this lane's container
-- to re-verify the exact wire format against a live project — the JSON shape below matches the
-- documented contract: `event` carries `user_id` (text, NOT `event->>'sub'` — Supabase's own
-- example uses `user_id`) and `claims` (jsonb, the token's current claim set); the function must
-- return the FULL modified `event` object, not just the claims). `stable` (reads a table, writes
-- nothing) is more permissive than Supabase's own `custom_access_token_hook` examples typically
-- need (some mark it `volatile` defensively) — `stable` is correct here since this function does
-- not write.
--
-- MULTI-ORG POLICY: same "oldest membership wins" policy as `resolveOrgIdFromUserId`/
-- `resolveOrgIdFromAuthenticatedClient` (org.ts's own documented policy) — this hook is NOT a new
-- policy decision, it is the SAME existing resolution, moved to run once at token-issuance instead
-- of on every request. If/when an org switcher is ever built, both this hook AND every
-- `ORDER BY created_at ASC LIMIT 1` call site in org.ts change together (org.ts's own comment
-- already names itself as "the seam to swap").
--
-- SECURITY DEFINER, NOT AN RLS POLICY CHANGE: Supabase's own Auth Hook guide shows two ways for
-- the hook (running as the `supabase_auth_admin` role) to read a table protected by RLS — grant
-- `supabase_auth_admin` a dedicated SELECT policy, or make the function SECURITY DEFINER. This
-- migration uses SECURITY DEFINER (owned by `postgres`, which bypasses RLS) specifically so it
-- touches ZERO existing `org_memberships` RLS policies — this lane's write set does not include
-- auditing every existing policy on that table for a safe additional grant, and SECURITY DEFINER
-- needs none. `set search_path = public, pg_temp` pins the search path (Postgres security best
-- practice for SECURITY DEFINER functions — an unpinned search_path is the classic SECURITY
-- DEFINER privilege-escalation vector via a same-named object earlier in a caller-controlled path).
--
-- IDEMPOTENT: `CREATE OR REPLACE FUNCTION` on a function this lane defines from scratch (no prior
-- migration touches `custom_access_token_hook`) — this DO block's own pre-check simply confirms
-- the function does not already exist with a DIFFERENT, unexpected body before creating it, so a
-- second application (or a body written by some other, uncoordinated process) is never silently
-- overwritten.
do $do_307$
declare
  v_existing_def text;
begin
  select pg_get_functiondef(p.oid) into v_existing_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'custom_access_token_hook';

  if v_existing_def is not null and v_existing_def not like '%org_memberships%' then
    raise exception 'ABORT 307: public.custom_access_token_hook already exists with an unexpected body (does not reference org_memberships) — refusing to overwrite; review manually before re-running.';
  end if;
end;
$do_307$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $hook$
declare
  v_claims jsonb;
  v_org_id uuid;
begin
  select org_id into v_org_id
  from public.org_memberships
  where user_id = (event->>'user_id')::uuid
  order by created_at asc
  limit 1;

  v_claims := coalesce(event->'claims', '{}'::jsonb);
  v_claims := jsonb_set(v_claims, '{org_id}', to_jsonb(v_org_id));

  return jsonb_set(event, '{claims}', v_claims);
end;
$hook$;

comment on function public.custom_access_token_hook(jsonb) is
  'ADR-027 D5 / migration 307 (PERF-12, 2026-09-04): injects org_id into the access token at '
  'sign-in/refresh (oldest org_memberships row wins, same policy as resolveOrgIdFromUserId). '
  'Activated ONLY via Authentication > Hooks in the Supabase dashboard — see this migration file''s '
  'own header for the exact operator click-through steps. Read by getClaims() callers once wired; '
  'until then this function exists but is never invoked.';

-- Only supabase_auth_admin (the role Supabase's Auth server actually runs hooks as) may call this
-- — never authenticated/anon/public, which would let a signed-in user forge a call to a function
-- that reads (though does not write) another user's org membership by supplying an arbitrary
-- `user_id` in a hand-built event payload.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- OPERATOR ACTIVATION STEPS (Supabase Dashboard) — do this AFTER this migration itself is applied.
-- Exact click-through, confirmed against Supabase's documented Auth Hooks UI (2026-09-04 reading;
-- this lane's container has no live dashboard access to screenshot-verify against this exact
-- project, so verify the menu path still matches before following it):
--
--   1. Open the Supabase dashboard for this project.
--   2. Left sidebar → Authentication → Hooks (URL pattern: /project/<ref>/auth/hooks).
--   3. Under "Customize Access Token (JWT) Claims hook", click "Add hook" (or "Enable" if a slot
--      already exists from a prior, unrelated hook — DO NOT overwrite an existing Access Token
--      hook without reading what it currently does first; this app has no other Access Token hook
--      as of this lane, per a repo-wide grep for `custom_access_token_hook` finding zero prior
--      references).
--   4. Hook type: "Postgres Function".
--   5. Schema: "public". Function: "custom_access_token_hook" (the exact name this migration
--      creates — it will appear in the dropdown once migration 307 is applied).
--   6. Save / Enable the hook.
--   7. VERIFY: sign out and back in (or wait for a natural token refresh — Supabase access tokens
--      are typically short-lived, ~1h), then decode the new access token (jwt.io, or
--      `supabase.auth.getSession()` → `session.access_token`) and confirm it now carries an
--      `org_id` claim matching the signed-in user's `org_memberships` row.
--   8. ROLLBACK, if needed: return to Authentication → Hooks and disable/remove the Access Token
--      hook — tokens immediately stop carrying the claim (no code depends on it existing yet, see
--      below, so disabling is safe at any time with zero app-level fallout).
--
-- MAKING THE CODE ACTUALLY READ THE CLAIM — DELIBERATELY NOT DONE BY THIS MIGRATION OR THIS LANE:
-- once the hook is wired and verified (step 7 above), `resolveOrgIdFromAuthenticatedClient` /
-- `resolveViewerIdentityFromAuthenticatedClient` (src/lib/api/org.ts) become eligible for a
-- follow-up change — read `data.claims.org_id` directly after `getClaims()` succeeds, falling back
-- to the existing `org_memberships` SELECT only when the claim is absent (a user who signed in
-- before the hook was wired, or whose token has not yet refreshed) — collapsing D5's two round
-- trips to one. This lane does not make that code change: per ADR-027 D5's own two-step framing
-- ("put the org id in a JWT custom claim... or resolve it once... do not re-derive it per
-- loader") and this lane's brief ("write it as migration/config notes... do not block on it"), the
-- hook must be LIVE AND VERIFIED (step 7) before any code trusts the claim's presence — shipping a
-- code path that reads a claim from a hook that is not yet (or not reliably) wired would silently
-- degrade every org resolution to `org_id: null` for any session whose token predates activation,
-- which is a correctness regression, not a performance win. That code change is the direct
-- follow-up once an operator completes and confirms the activation steps above.
