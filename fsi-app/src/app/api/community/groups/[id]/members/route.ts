// GET    /api/community/groups/[id]/members
// DELETE /api/community/groups/[id]/members   (leave the group)
//
// GET returns the member roster for a group. The community_group_members
// SELECT policy already gates visibility: rank-and-file members see only
// their own row; admins and moderators see the full roster. This route
// returns whatever rows RLS exposes to the caller, joined to profile
// metadata for display (name, headshot).
//
// DELETE removes the caller's own membership row (leave the group). The
// community_group_members DELETE policy permits self-delete, so we run
// the mutation under the caller's RLS-aware client.
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

interface MemberRow {
  user_id: string;
  role: "admin" | "moderator" | "member";
  joined_at: string;
}

const ROLE_ORDER: Record<string, number> = {
  admin: 0,
  moderator: 1,
  member: 2,
};

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

  // RLS-aware select. Caller will see their own row at minimum; admins
  // + moderators see the whole roster.
  //
  // We do two queries (members, then profiles for the resulting ids)
  // rather than a PostgREST embed because community_group_members.user_id
  // references auth.users, not profiles, and there is no FK that
  // PostgREST can hang an embed on. The same shape is used by
  // CouncilMembersRail for the same reason.
  const { data: rows, error } = await auth.supabase
    .from("community_group_members")
    .select("user_id, role, joined_at")
    .eq("group_id", groupId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const memberRows = (rows ?? []) as MemberRow[];
  const userIds = memberRows.map((m) => m.user_id);

  const { data: profiles } = userIds.length
    ? await auth.supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds)
    : { data: [] as ProfileShape[] };

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const)
  );

  const members = memberRows
    .map((m) => {
      const profile = profileById.get(m.user_id) ?? null;
      return {
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        name: profile?.full_name ?? null,
        headshot_url: profile?.avatar_url ?? null,
        is_self: m.user_id === auth.userId,
      };
    })
    .sort((a, b) => {
      const ra = ROLE_ORDER[a.role] ?? 9;
      const rb = ROLE_ORDER[b.role] ?? 9;
      if (ra !== rb) return ra - rb;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

  return NextResponse.json(
    { members },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function DELETE(
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

  // Sanity check the caller has a membership row. RLS would let the
  // DELETE no-op silently, but a 404 makes the UI behaviour explicit.
  const { data: existing } = await auth.supabase
    .from("community_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: "You are not a member of this group" },
      { status: 404 }
    );
  }

  // Guard rail: if the caller is the only admin, refuse to leave. The
  // group needs at least one admin or the surface becomes ungovernable.
  if (existing.role === "admin") {
    const { count: adminCount } = await auth.supabase
      .from("community_group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("role", "admin");
    if ((adminCount ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            "You are the only admin. Promote another member to admin before leaving.",
        },
        { status: 409 }
      );
    }
  }

  const { error } = await auth.supabase
    .from("community_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", auth.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
