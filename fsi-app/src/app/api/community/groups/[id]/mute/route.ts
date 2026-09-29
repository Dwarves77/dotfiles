// PATCH /api/community/groups/[id]/mute { muted: boolean }
//
// Toggle the per-user muted flag on community_group_members for the
// caller. Mute/unmute is purely a personal notification preference and
// does not affect group state for other members. Mirrors the sibling
// /star route exactly (same table, same self-only RLS-scoped write, same
// response shape), see that route's own header for the RLS reasoning,
// carried here verbatim rather than re-derived.
//
// RLS on community_group_members.UPDATE allows a user to update their
// own row (with role/joined_at unchanged). Updating just `muted` is
// within that policy, we use the caller's RLS-aware client so the
// row guard is enforced server-side, not just in our query.
//
// Auth: cookie session.
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { validateMemberPrefToggle } from "@/lib/community/index.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  const { id: groupId } = await params;
  if (!groupId || !UUID_RE.test(groupId)) {
    return NextResponse.json({ error: "Valid group id required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const validated = validateMemberPrefToggle(body, "muted");
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("community_group_members")
    .update({ muted: validated.value })
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
    { ok: true, muted: validated.value },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
