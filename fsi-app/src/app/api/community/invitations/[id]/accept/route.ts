// POST /api/community/invitations/[id]/accept
//
// Accept a pending community group invitation.
//
// Performs two writes that must succeed together:
//   1. UPDATE community_group_invitations SET status='accepted'
//      WHERE id = :id AND invitee_user_id = auth.uid() AND status = 'pending'
//   2. INSERT community_group_members (group_id, user_id, role='member')
//
// Postgres does not give us a single-statement transaction primitive
// over the REST API; the conventional pattern in this codebase is to
// run the writes sequentially and roll back manually on the second
// failure. Step 2 uses the service-role client because RLS on
// community_group_members.INSERT requires an existing admin (not the
// invitee). Step 1 is gated by the invitee_user_id = auth.uid() RLS
// policy on the invitations table, which is the integrity check we
// trust here.
//
// Idempotency: if a membership row already exists, we still accept the
// invitation (status -> 'accepted') and short-circuit the insert.
//
// Auth: cookie session.
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

  // 1. Read the invitation via the caller's RLS-aware client. RLS
  //    restricts SELECT to invitee/inviter/admin/owner, so a stranger
  //    sees null — same shape as a non-existent invitation.
  const { data: inv, error: readErr } = await auth.supabase
    .from("community_group_invitations")
    .select("id, group_id, invitee_user_id, status")
    .eq("id", invitationId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!inv) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (inv.invitee_user_id !== auth.userId) {
    return NextResponse.json(
      { error: "Only the invitee can accept this invitation" },
      { status: 403 }
    );
  }
  if (inv.status !== "pending") {
    return NextResponse.json(
      { error: `Invitation is ${inv.status}, not pending` },
      { status: 409 }
    );
  }

  // 2. Mark invitation accepted via caller's RLS client (covered by
  //    the invitee-update policy that allows pending -> accepted).
  const { error: updErr } = await auth.supabase
    .from("community_group_invitations")
    .update({ status: "accepted" })
    .eq("id", invitationId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // 3. Insert membership via service-role (RLS INSERT policy requires
  //    an admin; the invitee accepting their own invitation is the
  //    single legitimate non-admin INSERT path, gated by step 2).
  const service = getServiceClient();
  const { error: insErr } = await service
    .from("community_group_members")
    .insert({
      group_id: inv.group_id,
      user_id: auth.userId,
      role: "member",
    });

  if (insErr && insErr.code !== "23505") {
    // Membership insert failed for a non-duplicate reason — roll back
    // the invitation status so the user can retry.
    await service
      .from("community_group_invitations")
      .update({ status: "pending" })
      .eq("id", invitationId);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, group_id: inv.group_id },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
