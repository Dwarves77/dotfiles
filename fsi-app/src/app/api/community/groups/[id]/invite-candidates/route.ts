// GET /api/community/groups/[id]/invite-candidates?q=<text>
//
// Search the profiles table for users matching `q`, excluding users
// already in the group and users with a pending invitation. Used by the
// Invite member modal to populate the candidate list.
//
// Admin-only (the POST .../invite route is admin-only; gating the search
// the same way keeps the surface coherent).
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

const MAX_RESULTS = 12;
const MIN_QUERY = 2;

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

  // Pre-check admin role (mirrors the .../invite POST handler).
  const { data: callerMembership } = await auth.supabase
    .from("community_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (callerMembership?.role !== "admin") {
    return NextResponse.json(
      { error: "Only group admins can search invite candidates" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) {
    return NextResponse.json(
      { candidates: [] },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Find members + pending invitees to exclude from candidate set.
  const [{ data: existingMembers }, { data: pendingInvites }] =
    await Promise.all([
      auth.supabase
        .from("community_group_members")
        .select("user_id")
        .eq("group_id", groupId),
      auth.supabase
        .from("community_group_invitations")
        .select("invitee_user_id")
        .eq("group_id", groupId)
        .eq("status", "pending"),
    ]);

  const excluded = new Set<string>();
  for (const m of existingMembers ?? []) excluded.add(m.user_id);
  for (const inv of pendingInvites ?? [])
    excluded.add(inv.invitee_user_id);
  // Never offer the caller as a candidate (they cannot invite themselves).
  excluded.add(auth.userId);

  // Search by full_name (case-insensitive). Profiles RLS allows
  // authenticated read across all rows (migration 075 / 027 lineage).
  const { data: profiles, error } = await auth.supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .ilike("full_name", `%${escapeLike(q)}%`)
    .limit(MAX_RESULTS * 2);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (profiles ?? [])
    .filter((p) => p.full_name && !excluded.has(p.id))
    .slice(0, MAX_RESULTS)
    .map((p) => ({
      user_id: p.id,
      name: p.full_name,
      headshot_url: p.avatar_url,
    }));

  return NextResponse.json(
    { candidates },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// Escape ILIKE wildcards in user input so a literal '%' or '_' is not
// interpreted as a pattern. Backslash is the escape character.
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}
