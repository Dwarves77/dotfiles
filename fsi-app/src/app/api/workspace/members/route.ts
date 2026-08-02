import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";

// /api/workspace/members — the CALLER-SCOPED roster read (Phase 1 ownership,
// migration 234).
//
// GET → { members: [{ user_id, role, display_name, avatar_url }] } for the
// caller's own org. Exists so the assignee picker (OwnerTeamCard) never needs
// to know an org_id client-side: /api/orgs/[org_id]/members is the GOVERNED
// members surface (community-auth, role mutations, bans); this route is the
// read-only "who can I assign?" list resolved from the caller's session —
// same resolveOrgIdFromUserId seam every workspace route uses.
//
// Display-name resolution mirrors the governed route: profiles.full_name →
// display_name → email → truncated uuid.

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);
  if (!orgId) {
    return NextResponse.json(
      { error: "User has no organization membership" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("org_memberships")
    .select(
      "user_id, role, created_at, user:profiles!user_id(full_name, display_name, email, avatar_url)"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const rows = (data || []) as Array<{
    user_id: string;
    role: string;
    user: {
      full_name?: string | null;
      display_name?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    } | null;
  }>;

  return NextResponse.json(
    {
      members: rows.map((r) => ({
        user_id: r.user_id,
        role: r.role,
        display_name:
          r.user?.full_name ??
          r.user?.display_name ??
          r.user?.email ??
          `${String(r.user_id).slice(0, 8)}...`,
        avatar_url: r.user?.avatar_url ?? null,
      })),
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
