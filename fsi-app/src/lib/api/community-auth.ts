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

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";

export interface CommunityAuthResult {
  userId: string;
  supabase: SupabaseClient;
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
    const { data: { user } } = await cookieClient.auth.getUser();
    if (user) {
      return { userId: user.id, supabase: cookieClient as unknown as SupabaseClient };
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
      const { data: { user }, error } = await tokenClient.auth.getUser(token);
      if (!error && user) {
        return { userId: user.id, supabase: tokenClient };
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
