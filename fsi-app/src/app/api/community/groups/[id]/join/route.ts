// POST /api/community/groups/[id]/join
//
// Self-join a public community group.
//
// Behaviour:
//   - Inserts (group_id=id, user_id=current, role='member') into
//     community_group_members.
//   - For PRIVATE groups: RLS rejects the INSERT (only existing group
//     admins may insert membership rows). We translate that into a
//     403 with "Private group requires invitation".
//   - For PUBLIC groups: Phase C does NOT yet have a public-self-join
//     RLS policy; the insert relies on a service-role write after we
//     verify privacy='public' here. This keeps the surface explicit
//     (no hidden auto-join paths) and matches the C4 task spec.
//   - Idempotent: if the user is already a member, returns ok with
//     state='already-member' rather than 409. Pending invitations are
//     auto-cleared on join.
//
// Auth: cookie session (community-auth helper).
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

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

  const { id: groupId } = await params;
  if (!groupId) {
    return NextResponse.json({ error: "group id required" }, { status: 400 });
  }

  // 1. Read group via the caller's RLS-aware client. Private groups the
  //    caller cannot see return null — same shape as a non-existent
  //    group, by design.
  const { data: group, error: readErr } = await auth.supabase
    .from("community_groups")
    .select("id, privacy")
    .eq("id", groupId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // 2. Public-only self-join. Reject private groups with the canonical
  //    403 message — invitation is the only path in.
  if (group.privacy !== "public") {
    return NextResponse.json(
      { error: "Private group requires invitation" },
      { status: 403 }
    );
  }

  // 3. Already-a-member short-circuit (idempotent).
  const { data: existing } = await auth.supabase
    .from("community_group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { ok: true, state: "already-member" },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  // 4. Insert the membership row. RLS on community_group_members.INSERT
  //    requires the caller to be an existing admin of the group, which
  //    is not the case for a self-join. We use the service-role client
  //    AFTER explicitly validating privacy='public' above.
  const service = getServiceClient();
  const { error: insErr } = await service
    .from("community_group_members")
    .insert({
      group_id: groupId,
      user_id: auth.userId,
      role: "member",
    });

  if (insErr) {
    // Unique-violation (already a member) — treat as success.
    if (insErr.code === "23505") {
      return NextResponse.json(
        { ok: true, state: "already-member" },
        { headers: rateLimitHeaders(auth.userId) }
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 5. Auto-clear any pending invitation for this (group, invitee). Not
  //    strictly required (the partial unique index allows only one
  //    pending row anyway), but cleaner than leaving stale 'pending' rows
  //    behind once the user is a member.
  await service
    .from("community_group_invitations")
    .update({ status: "accepted" })
    .eq("group_id", groupId)
    .eq("invitee_user_id", auth.userId)
    .eq("status", "pending");

  return NextResponse.json(
    { ok: true, state: "joined" },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
