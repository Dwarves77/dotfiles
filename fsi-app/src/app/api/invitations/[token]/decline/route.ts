// src/app/api/invitations/[token]/decline/route.ts
//
// POST /api/invitations/[token]/decline
//
// Calls decline_invitation() RPC. Email match is enforced inside the RPC.
//
// Workstream B (Multi-Tenant Foundation) — 2026-05-15.

import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAuth, isCommunityAuthError } from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const TOKEN_RE = /^[0-9a-f]{64}$/i;

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
  }

  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { error } = await auth.supabase.rpc("decline_invitation", {
    p_token: token,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "Not authorized to decline this invitation" },
        { status: 403 }
      );
    }
    if (error.code === "P0002") {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }
    if (error.code === "22023") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, status: "declined" },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
