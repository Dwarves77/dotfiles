// src/app/api/invitations/[token]/route.ts
//
// GET /api/invitations/[token] — lookup an invitation by its bearer token.
// Returns the org name, the proposed role, the email it was sent to, and
// the lazy-computed status (pending/accepted/declined/revoked/expired).
//
// Authentication: the token IS the credential. We require the caller be
// an authenticated user (so we can avoid leaking metadata to anonymous
// scrapers) but we don't require they be the invitee — the accept/decline
// endpoints enforce email match.
//
// Workstream B (Multi-Tenant Foundation) — 2026-05-15.

import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAuth, isCommunityAuthError } from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const TOKEN_RE = /^[0-9a-f]{64}$/i; // 32-byte hex

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
  }

  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  // lookup_invitation() is SECURITY DEFINER and granted to authenticated.
  // It returns the lazy-computed status (no write).
  const { data, error } = await auth.supabase.rpc("lookup_invitation", {
    p_token: token,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    org_id: string;
    org_name: string;
    invited_email: string;
    proposed_role: string;
    status: string;
    created_at: string;
    expires_at: string;
    is_expired: boolean;
  }>;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  return NextResponse.json(
    { invitation: rows[0] },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
