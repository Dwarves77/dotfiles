// src/lib/api/community-auth.ts
//
// Community API auth helper.
//
// The community surface (CommunityShell, GroupCard, GroupHeader, the
// existing InvitationsPanel) uses plain `fetch(...)` without manually
// attaching a Bearer token. The session lives in HTTP-only cookies via
// @supabase/ssr, so the right-shaped guard for /api/community/* routes
// is one that authenticates via the cookie session AND, as a fallback,
// the Authorization: Bearer <jwt> header (matching requireAuth, in case
// a future caller goes via the explicit token path).
//
// Returns { userId, supabase } on success — the supabase client is the
// authenticated, RLS-aware client (cookie-bound) so route code can run
// queries that respect community RLS without a service-role escape.
// Returns a NextResponse on failure.
//
// Rate limiting is identical to the rest of the app (60 req/min/user),
// applied by the caller via checkRateLimit().
//
// PERF-7 (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §13, same defect class as PERF-2's
// proxy.ts / PERF-6's org.ts+auth.ts): both branches used to call `supabase.auth.getUser()` /
// `getUser(token)` — a network round trip to Supabase Auth's server — on every one of this function's
// 40 call sites (all app/api/community/*, app/api/orgs/*, app/api/invitations/* Route Handlers, whose
// own SQL is typically a single indexed query, so that round trip was the dominant cost). Both branches
// now share ONE resolver, resolveCommunityUserId() below, built on `getClaims()` (verifies the JWT
// locally against the project's cached JWKS instead of a server round trip — see proxy.ts's header for
// the JSDoc citation and the symmetric-secret-fallback caveat, which applies identically here).
//
// Fields: this function only ever returned `userId` (never a `user` object), so `claims.sub` — a
// required, non-optional string claim — is a drop-in replacement with no fallback needed. ONE consumer
// downstream (app/api/community/profile/verify/route.ts, not in this lane's write set) separately calls
// `auth.supabase.auth.getUser()` on the returned client to read `user.email` for corporate-domain
// verification; that call is unaffected by this change (the returned `supabase` client is unchanged,
// still a real authenticated client) and keeps paying its own getUser() round trip. `claims.email` is
// available on the standard claim set (verified against node_modules/@supabase/auth-js's installed
// JwtPayload type) and could retire that route's extra call too, but that file is outside this lane's
// write set — see docs/audits/perf-load-times-2026-09-03.md §13 for the one-line fix, decision-ready for
// whichever lane next touches that file.
//
// No cache() memoization here (unlike org.ts/server-bootstrap.ts, which PERF-6/PERF-7 wrap in React's
// cache()): every one of this function's 56 call sites is a distinct Route Handler export (GET/POST/
// PATCH/PUT/DELETE — grepped, confirmed one call per exported handler, never two within the same
// handler), and Route Handlers have no active React render dispatcher — org.ts's own header documents
// this exact runtime fact for its own Route Handler caller (app/api/listings/rest/route.ts via
// lib/data.ts): cache() outside a render "calls the underlying function directly with no memoization."
// Wrapping requireCommunityAuth in cache() here would therefore be a no-op on every one of its callers,
// not a "same defect class" fix — so it is deliberately omitted, with this file's own trail as the record
// of that check per CLAUDE.md rule 14 (measure, don't assume — a prior audit predicting a memoization win
// does not make it correct for a different call-site shape).

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";

export interface CommunityAuthResult {
  userId: string;
  supabase: SupabaseClient;
}

/** The subset of a Supabase client's auth surface resolveCommunityUserId needs — narrow enough to mock
 *  in community-auth.npmtest.mjs without constructing a real client. Mirrors auth.ts's ClaimsVerifier,
 *  widened to an optional jwt so the same core serves both the no-arg cookie-session branch and the
 *  explicit-token Bearer branch below. */
export interface ClaimsVerifier {
  auth: {
    getClaims: (jwt?: string) => Promise<{
      data: { claims: { sub: string } } | null;
      error: unknown;
    }>;
  };
}

/**
 * Resolve a userId via getClaims(), given anything shaped like a Supabase client's `.auth` surface.
 * Shared by both of requireCommunityAuth's branches (cookie session: no `jwt` arg, reads the session
 * cookie the client was constructed with; Authorization: Bearer: explicit `jwt`) so the getClaims()
 * contract — authenticated / unauthenticated / expired / malformed / symmetric-secret-fallback — is
 * proven once and reused, rather than duplicated per branch. Returns `null` when getClaims() reports an
 * error or an empty claims object; a getClaims() call that itself throws/rejects propagates to the
 * caller — each branch's own try/catch in requireCommunityAuth turns that into "fall through," matching
 * the prior getUser()/getUser(token) branches' contract exactly (same try/catch, same shape). Exported
 * for community-auth.npmtest.mjs.
 */
export async function resolveCommunityUserId(
  supabase: ClaimsVerifier,
  jwt?: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims(jwt);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

export async function requireCommunityAuth(
  request: NextRequest
): Promise<CommunityAuthResult | NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json(
      { error: "Authentication service not configured" },
      { status: 500 }
    );
  }

  // ── Path A: cookie session via @supabase/ssr ──────────────────────
  // The community UI's InvitationsPanel and GroupCard call fetch(...)
  // without an Authorization header. The cookie session is the only
  // signal we have, so check it first.
  try {
    const cookieClient = await createSupabaseServerClient();
    const userId = await resolveCommunityUserId(cookieClient);
    if (userId) {
      return { userId, supabase: cookieClient as unknown as SupabaseClient };
    }
  } catch {
    // fall through to Bearer
  }

  // ── Path B: Authorization: Bearer <jwt> ──────────────────────────
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const tokenClient = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const userId = await resolveCommunityUserId(tokenClient, token);
      if (userId) {
        return { userId, supabase: tokenClient };
      }
    } catch {
      // fall through to 401
    }
  }

  return NextResponse.json(
    { error: "Authentication required" },
    { status: 401 }
  );
}

export function isCommunityAuthError(
  result: CommunityAuthResult | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
