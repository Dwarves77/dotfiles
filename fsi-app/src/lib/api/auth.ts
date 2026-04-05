import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Verify the request is authenticated via Supabase JWT.
 * Returns the authenticated user ID or a 401 response.
 *
 * All API routes MUST call this before processing.
 * Unauthenticated public routes require explicit justification
 * and must be documented in CLAUDE.md.
 */
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

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    return { userId: user.id };
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
