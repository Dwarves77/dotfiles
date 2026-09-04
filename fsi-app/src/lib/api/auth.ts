import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Verify the request is authenticated via Supabase JWT.
 * Returns the authenticated user ID or a 401 response.
 *
 * All API routes MUST call this before processing.
 * Unauthenticated public routes require explicit justification
 * and must be documented in CLAUDE.md.
 *
 * PERF-6 (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §10, same
 * defect class as PERF-2's proxy.ts fix): this used to call
 * `supabase.auth.getUser(token)`, a network round trip to Supabase Auth's
 * server on EVERY call to this function — paid by /api/user/list-order,
 * /api/workspace/personal-state, and every other route in its 47-file
 * caller list, whose own SQL is a single indexed query each, so that round
 * trip was the dominant cost. `getClaims(token)` verifies the JWT locally
 * against the project's cached JWKS instead (proxy.ts's header carries the
 * JSDoc citation and the symmetric-secret-fallback caveat, which applies
 * identically here: node_modules/@supabase/auth-js's installed
 * GoTrueClient.getClaims implementation falls back to calling getUser(jwt)
 * itself when the JWT isn't asymmetrically signed, so the worst case is a
 * wash, never a regression). Passing `token` explicitly (not omitted) means
 * getClaims() validates that exact JWT's `exp` claim directly — the same
 * "expired token → error" behavior getUser(token) had, with no session
 * auto-refresh (auto-refresh in getClaims() only happens on the
 * no-argument path, which pulls from getSession() first; irrelevant here
 * since this function always passes an explicit token). Every one of this
 * function's 47 callers destructures only `{ userId }` off the returned
 * `{ userId: string } | NextResponse` shape (grepped, none reach into a
 * `user` object field this function doesn't already narrow to userId), so
 * no caller needed a getUser() fallback for a field getClaims() doesn't
 * carry — `claims.sub` is a required, non-optional string claim, verified
 * against auth-js's installed JwtPayload/RequiredClaims types.
 */

/** The subset of a Supabase client's auth surface requireAuth needs — narrow
 *  enough to mock in auth.npmtest.mjs without constructing a real client. */
export interface ClaimsVerifier {
  auth: {
    getClaims: (jwt: string) => Promise<{
      data: { claims: { sub: string } } | null;
      error: unknown;
    }>;
  };
}

/**
 * Resolve a userId from a bearer token via getClaims(), given anything
 * shaped like a Supabase client's `.auth` surface. Split out from
 * requireAuth so the getClaims() call — authenticated / unauthenticated /
 * expired / symmetric-secret-fallback — can be unit tested with a mocked
 * client instead of a live Supabase Auth server. Returns `null` when
 * getClaims() reports an error or an empty claims object; a getClaims()
 * call that itself throws/rejects propagates to the caller — requireAuth's
 * own try/catch turns that into the "Authentication failed" 401, matching
 * getUser(token)'s prior contract exactly (same try/catch, same shape).
 */
export async function resolveUserIdFromToken(
  supabase: ClaimsVerifier,
  token: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

export async function requireAuth(
  request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { error: "Authentication service not configured" },
      { status: 500 }
    );
  }

  // Extract token from Authorization header
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  try {
    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const userId = await resolveUserIdFromToken(supabase, token);

    if (!userId) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    return { userId };
  } catch {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 }
    );
  }
}

/**
 * Check if a requireAuth result is an error response.
 */
export function isAuthError(
  result: { userId: string } | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
