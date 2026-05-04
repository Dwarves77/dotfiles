// POST /api/community/invitations/[id]/decline
//
// Decline a pending community group invitation. Single-statement
// status update gated by the invitee-update RLS policy
// (status pending -> declined, allowed when invitee_user_id = auth.uid()).
//
// Auth: cookie session.
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id: invitationId } = await params;
  if (!invitationId || !UUID_RE.test(invitationId)) {
    return NextResponse.json(
      { error: "Valid invitation id required" },
      { status: 400 }
    );
  }

  const { data: inv } = await auth.supabase
    .from("community_group_invitations")
    .select("id, invitee_user_id, status")
    .eq("id", invitationId)
    .maybeSingle();

  if (!inv) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (inv.invitee_user_id !== auth.userId) {
    return NextResponse.json(
      { error: "Only the invitee can decline this invitation" },
      { status: 403 }
    );
  }
  if (inv.status !== "pending") {
    return NextResponse.json(
      { error: `Invitation is ${inv.status}, not pending` },
      { status: 409 }
    );
  }

  const { error } = await auth.supabase
    .from("community_group_invitations")
    .update({ status: "declined" })
    .eq("id", invitationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
