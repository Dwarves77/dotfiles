// PATCH /api/community/groups/[id]/star { starred: boolean }
//
// Toggle the per-user starred flag on community_group_members for the
// caller. Star/unstar drives sidebar pinning; it is purely a personal
// preference and does not affect group state for other members.
//
// RLS on community_group_members.UPDATE allows a user to update their
// own row (with role/joined_at unchanged). Updating just `starred` is
// within that policy — we use the caller's RLS-aware client so the
// row guard is enforced server-side, not just in our query.
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

export async function PATCH(
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

  let body: { starred?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.starred !== "boolean") {
    return NextResponse.json(
      { error: "starred (boolean) is required" },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("community_group_members")
    .update({ starred: body.starred })
    .eq("group_id", groupId)
    .eq("user_id", auth.userId)
    .select("group_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "You are not a member of this group" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { ok: true, starred: body.starred },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
