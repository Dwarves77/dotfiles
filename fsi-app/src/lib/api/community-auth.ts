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
  } catch (e) {
    // Fall through to Bearer, but say why: an infrastructure failure here reads to the caller as "not signed in".
    console.warn(`[api/community-auth] cookie-session auth threw (falling through to Bearer): ${e instanceof Error ? e.message : String(e)}`);
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
    } catch (e) {
      // Fall through to 401, but say why: an infrastructure failure here reads to the caller as "not signed in".
      console.warn(`[api/community-auth] bearer auth threw (falling through to 401): ${e instanceof Error ? e.message : String(e)}`);
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
