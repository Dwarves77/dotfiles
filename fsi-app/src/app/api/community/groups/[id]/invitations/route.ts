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
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { loadCommunityIdentities } from "@/lib/community/identity.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

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
  // SEC-5 (migration 372): the invitee is usually in another organisation, so the name and avatar come from the
  // community_identity RPC (a default-anonymous invitee arrives with both null).
  const { byId: identityById, error: identityErr } = await loadCommunityIdentities(auth.supabase, inviteeIds);
  if (identityErr) console.warn("community invitations route: identity lookup failed", identityErr);

  const invitations = rows.map((inv) => {
    const profile = identityById.get(inv.invitee_user_id) ?? null;
    return {
      id: inv.id,
      invitee_user_id: inv.invitee_user_id,
      inviter_user_id: inv.inviter_user_id,
      created_at: inv.created_at,
      invitee_name: profile?.display_name ?? null,
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
