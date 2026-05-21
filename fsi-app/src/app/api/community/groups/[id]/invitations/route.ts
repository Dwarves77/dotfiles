// GET /api/community/groups/[id]/invitations
//
// List pending invitations for a group, visible to admins/moderators
// (the SELECT policy on community_group_invitations already enforces
// visibility). Joined to invitee profile metadata so the Invite UI can
// surface names instead of bare UUIDs.
//
// Auth:    cookie session via requireCommunityAuth.
// Limits:  60 req/min/user via checkRateLimit.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProfileShape {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface InvitationRow {
  id: string;
  invitee_user_id: string;
  inviter_user_id: string | null;
  status: string;
  created_at: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id: groupId } = await params;
  if (!groupId || !UUID_RE.test(groupId)) {
    return NextResponse.json(
      { error: "Valid group id required" },
      { status: 400 }
    );
  }

  // Pre-check: only admins/moderators/owners see invitations. RLS
  // already enforces this; the early 403 keeps the surface explicit.
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
      { error: "Only group admins or moderators can view invitations" },
      { status: 403 }
    );
  }

  const { data, error } = await auth.supabase
    .from("community_group_invitations")
    .select("id, invitee_user_id, inviter_user_id, status, created_at")
    .eq("group_id", groupId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as InvitationRow[];
  const inviteeIds = Array.from(
    new Set(rows.map((r) => r.invitee_user_id))
  );

  // Second query for profile metadata. invitee_user_id references
  // auth.users not profiles, so there is no PostgREST embed; same
  // pattern as CouncilMembersRail.
  const { data: profiles } = inviteeIds.length
    ? await auth.supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", inviteeIds)
    : { data: [] as ProfileShape[] };

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const)
  );

  const invitations = rows.map((inv) => {
    const profile = profileById.get(inv.invitee_user_id) ?? null;
    return {
      id: inv.id,
      invitee_user_id: inv.invitee_user_id,
      inviter_user_id: inv.inviter_user_id,
      created_at: inv.created_at,
      invitee_name: profile?.full_name ?? null,
      invitee_avatar: profile?.avatar_url ?? null,
      can_revoke:
        inv.inviter_user_id === auth.userId ||
        callerMembership.role === "admin",
    };
  });

  return NextResponse.json(
    { invitations },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
