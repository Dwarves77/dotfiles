// POST /api/community/groups/[id]/invite { invitee_user_id }
//
// Invite another user to a community group. Caller must be an admin
// or moderator of the group; we verify via SELECT before insert.
//
// Inserts a row into community_group_invitations with status='pending'.
// The partial unique index (group_id, invitee_user_id) WHERE status =
// 'pending' prevents duplicates — we map that 23505 error to a 409
// "Invitation already pending" rather than a 500.
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

  const { id: groupId } = await params;
  if (!groupId || !UUID_RE.test(groupId)) {
    return NextResponse.json({ error: "Valid group id required" }, { status: 400 });
  }

  let body: { invitee_user_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const inviteeId = body?.invitee_user_id;
  if (!inviteeId || !UUID_RE.test(inviteeId)) {
    return NextResponse.json(
      { error: "invitee_user_id (uuid) is required" },
      { status: 400 }
    );
  }
  if (inviteeId === auth.userId) {
    return NextResponse.json(
      { error: "Cannot invite yourself" },
      { status: 400 }
    );
  }

  // Verify caller is admin or moderator of this group. RLS on
  // community_group_members already gates SELECT to admins/moderators
  // (see migration 029) so a non-privileged caller will see 0 rows.
  const { data: callerMembership } = await auth.supabase
    .from("community_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (
    !callerMembership ||
    !["admin", "moderator"].includes(callerMembership.role)
  ) {
    return NextResponse.json(
      { error: "Only group admins or moderators can invite members" },
      { status: 403 }
    );
  }

  // RLS on community_group_invitations.INSERT additionally requires the
  // caller to be an ADMIN (not moderator). We mirror that here so a
  // moderator gets a clean 403 rather than a generic RLS reject.
  if (callerMembership.role !== "admin") {
    return NextResponse.json(
      { error: "Only group admins can send invitations" },
      { status: 403 }
    );
  }

  // Insert via the caller's RLS-aware client. RLS WITH CHECK requires
  // inviter_user_id = auth.uid() AND admin membership — both satisfied.
  const { data: inserted, error: insErr } = await auth.supabase
    .from("community_group_invitations")
    .insert({
      group_id: groupId,
      inviter_user_id: auth.userId,
      invitee_user_id: inviteeId,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json(
        { error: "Invitation already pending for this user" },
        { status: 409 }
      );
    }
    if (insErr.code === "23503") {
      // FK violation — invitee_user_id does not match an auth.users row.
      return NextResponse.json(
        { error: "Invitee user not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, invitation_id: inserted?.id ?? null },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
