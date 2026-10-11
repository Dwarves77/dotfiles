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
  const service = getServiceSupabase();
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
