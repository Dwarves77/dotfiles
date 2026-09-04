import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";

/**
 * Resolve the active org_id for a known user id, using a service-role
 * Supabase client (bypasses RLS).
 *
 * Use from API routes that have already authenticated the request via
 * requireAuth() — pass auth.userId in.
 *
 * Returns null if the user has no org membership (caller should typically
 * 403 in that case).
 *
 * Multi-org policy: returns the oldest membership. We do not yet have a
 * notion of "active org" beyond first-membership; if/when we add an org
 * switcher, this resolver becomes the seam to swap.
 */
export async function resolveOrgIdFromUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(`[api/org] resolveOrgIdFromUserId read failed (caller will see no-membership): ${error.message}`);
    return null;
  }
  return data?.org_id ?? null;
}

/** Role values enforced by the org_memberships.role CHECK constraint (migration 006). */
export type OrgRole = "owner" | "admin" | "member" | "viewer";

export interface OrgMembership {
  orgId: string;
  role: OrgRole;
}

/**
 * Resolve the active org membership (org_id + role) for a known user id,
 * using a service-role Supabase client (bypasses RLS).
 *
 * Same contract and multi-org policy (oldest membership) as
 * resolveOrgIdFromUserId — this variant additionally returns the caller's
 * role so routes can gate on org authority without a second query.
 *
 * Returns null if the user has no org membership (caller should typically
 * 403 in that case, matching the workspace/* routes' convention).
 *
 * This is the seam for the planned requireOrgAuth() guard (org-autonomy
 * hardening): a route that must be org-scoped resolves membership
 * server-side from org_memberships — never from a client-supplied org_id.
 */
export async function resolveOrgMembershipFromUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<OrgMembership | null> {
  const { data, error } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(`[api/org] resolveOrgMembershipFromUserId read failed (caller will see no-membership): ${error.message}`);
    return null;
  }
  if (!data?.org_id) return null;
  return { orgId: data.org_id, role: data.role as OrgRole };
}

/**
 * Pure core of resolveOrgIdFromCookies: given an already-authenticated
 * Supabase client, resolve the caller's org_id. Split out so it can be unit
 * tested with a mocked client — the wrapper below value-imports
 * next/headers (via createSupabaseServerClient) and so cannot be loaded
 * outside Next's bundler; this function has no such dependency. Exported
 * for org.npmtest.mjs.
 *
 * PERF-6 (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §10, same
 * defect class as PERF-2's proxy.ts fix): this used to call
 * `supabase.auth.getUser()`, a network round trip to Supabase Auth's server
 * on every call — paid by every getAppData/getResourcesOnly/getListingsOnly
 * call in lib/data.ts and every detail-page render (lib/detail/load-detail-
 * core.ts's runViewerScoped), even on a warm unstable_cache hit, because the
 * org lookup itself was never cached. `getClaims()` verifies the session
 * JWT locally against the project's cached JWKS instead (see proxy.ts's
 * header for the JSDoc citation and the symmetric-secret-fallback caveat,
 * which applies identically here). The only field this function — or any of
 * its 15 callers — ever read off the old `user` object was `user.id`;
 * `claims.sub` carries the identical value (verified against
 * node_modules/@supabase/auth-js's installed JwtPayload type: `sub` is a
 * required, non-optional string claim), so no caller needed a getUser()
 * fallback for a field getClaims() doesn't carry.
 */
export async function resolveOrgIdFromAuthenticatedClient(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const userId = data.claims.sub;
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return membership?.org_id ?? null;
}

/**
 * Resolve the active org_id from the request's auth cookies, for use in
 * Server Components (page.tsx, layout.tsx, server-side data fetchers).
 *
 * Reads the Supabase session from cookies, then queries org_memberships
 * via the same authenticated client (so RLS scopes the query to the
 * user's own memberships).
 *
 * Returns null if the user is not signed in OR has no org membership.
 * Server components should treat this as "render the public/seed view"
 * (consistent with existing fallback behaviour in fetchDashboardData).
 *
 * PERF-6: wrapped in React's cache() — the same request-scoped memoization
 * pattern server-bootstrap.ts's resolveServerBootstrap already uses for an
 * equivalent getUser()+org_memberships pass. Consumer evidence for why this
 * matters (not just theoretical): lib/detail/load-detail-core.ts's
 * runViewerScoped() calls this function via deps.resolveOrgId() AND (through
 * getRelevance -> lib/workspace/viewer-relevance.ts's getViewerRelevanceForItem)
 * a second, independent time, SEQUENTIALLY, on every regulations and market
 * detail-page render — two full org-resolution passes per click before this
 * change. cache() collapses that to one. Safety of using cache() outside a
 * React render (e.g. the app/api/listings/rest/route.ts Route Handler caller,
 * via lib/data.ts): read from the installed react package
 * (node_modules/react/cjs/react.react-server.development.js, `exports.cache`)
 * — when there is no active render dispatcher, the wrapper calls the
 * underlying function directly with no memoization and no cross-request
 * state; it can only memoize INSIDE an active per-request render, never leak
 * across separate requests. Confirmed by the same file's exact wording as
 * server-bootstrap.ts's own justification for using cache() here.
 */
export const resolveOrgIdFromCookies = cache(async (): Promise<string | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    return await resolveOrgIdFromAuthenticatedClient(supabase);
  } catch {
    return null;
  }
});

/** userId + orgId, the exact pair a watch-membership lookup needs — nothing else. */
export interface ViewerIdentity {
  userId: string | null;
  orgId: string | null;
}

const EMPTY_VIEWER_IDENTITY: ViewerIdentity = { userId: null, orgId: null };

/**
 * Pure core of resolveViewerIdentityFromCookies — same split rationale as
 * resolveOrgIdFromAuthenticatedClient just above (mockable with a plain
 * fake client, no next/headers dependency). Exported for org.npmtest.mjs.
 *
 * PERF-9 (2026-09-04, item 4, docs/decisions/ADR-026-detail-cache-and-viewer-state-split.md
 * §3): [CONFIRMED, all four detail pages read identically] each of
 * regulations|market|operations|research's `[slug]/page.tsx` runs a
 * `watchMembershipPromise` that calls the FULL `resolveServerBootstrap()`
 * (server-bootstrap.ts) — three SEQUENTIAL round trips (getClaims →
 * org_memberships + profiles in parallel → THEN workspace_settings, which
 * depends on the org_id the second stage resolves) — to read only
 * `bootstrap.user?.id` and `bootstrap.orgId`. `workspaceSectors` (the field
 * that third, sequential-only stage exists to fetch) is never read by any
 * watch-membership caller. On a DOCUMENT load this is free — the root
 * layout's own resolveServerBootstrap() call (BootstrapResolver,
 * layout.tsx) is React `cache()`-memoized per request, so a second caller
 * shares the same in-flight promise. On an RSC (client-side) NAVIGATION —
 * exactly the "click an item in the ledger" path the perf brief measured at
 * 4.25 s server render for an 18 KB payload — the root layout's own
 * `isRscNavigation` check (rsc-navigation.ts) skips calling
 * resolveServerBootstrap() entirely, so the detail page's watchMembershipPromise
 * becomes the ONLY caller and pays the full three-stage cost fresh, on the
 * critical path, for a field it throws away. This function is the two-stage
 * (getClaims → org_memberships) alternative — the same shape
 * resolveOrgIdFromAuthenticatedClient already uses, extended to also return
 * `userId` (already resolved from `claims.sub` internally; the prior
 * function simply didn't return it) — so the wrapper below removes exactly
 * that one wasted sequential round trip from every item click, on all four
 * surfaces, with no behavior change to what watch-membership renders.
 */
export async function resolveViewerIdentityFromAuthenticatedClient(
  supabase: SupabaseClient
): Promise<ViewerIdentity> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return EMPTY_VIEWER_IDENTITY;
  const userId = data.claims.sub as string;
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return { userId, orgId: membership?.org_id ?? null };
}

/**
 * Resolve `{ userId, orgId }` from the request's auth cookies — the
 * cache()-wrapped, cookie-driven wrapper around
 * resolveViewerIdentityFromAuthenticatedClient above. Same request-scoped
 * memoization pattern as resolveOrgIdFromCookies/resolveServerBootstrap;
 * same fail-soft-to-empty contract on any error (a caller with no session
 * or no membership renders its public/seed view, never throws).
 */
export const resolveViewerIdentityFromCookies = cache(async (): Promise<ViewerIdentity> => {
  try {
    const supabase = await createSupabaseServerClient();
    return await resolveViewerIdentityFromAuthenticatedClient(supabase);
  } catch {
    return EMPTY_VIEWER_IDENTITY;
  }
});
