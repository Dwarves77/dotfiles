import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  const { id: invitationId } = await params;
  if (!invitationId || !UUID_RE.test(invitationId)) {
    return NextResponse.json(
      { error: "Valid invitation id required" },
      { status: 400 }
    );
  }

  // Read the invitation via caller's RLS client. SELECT policy already
  // restricts visibility to invitee/inviter/admin/owner — a stranger
  // sees null (404).
  const { data: inv } = await auth.supabase
    .from("community_group_invitations")
    .select("id, group_id, inviter_user_id, status")
    .eq("id", invitationId)
    .maybeSingle();

  if (!inv) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (inv.status !== "pending") {
    return NextResponse.json(
      { error: `Invitation is ${inv.status}, not pending` },
      { status: 409 }
    );
  }

  // Check whether caller is inviter or current admin of the group.
  const isInviter = inv.inviter_user_id === auth.userId;

  let isAdmin = false;
  if (!isInviter) {
    const { data: m } = await auth.supabase
      .from("community_group_members")
      .select("role")
      .eq("group_id", inv.group_id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    isAdmin = m?.role === "admin";
  }

  if (!isInviter && !isAdmin) {
    return NextResponse.json(
      {
        error:
          "Only the inviter or a group admin can revoke this invitation",
      },
      { status: 403 }
    );
  }

  // Service-role write — covers both the admin path (whose RLS UPDATE
  // policy is satisfied) and the inviter-only path (no RLS policy
  // permits arbitrary inviter UPDATE, so we authorise out-of-band
  // after verifying inviter_user_id above).
  const service = getServiceSupabase();
  const { error } = await service
    .from("community_group_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
