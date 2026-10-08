import { NextRequest, NextResponse } from "next/server";

import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";



// POST /api/admin/users — create a user and assign to org
export async function POST(request: NextRequest) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

  try {
    const { email, password, role, org_id } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      );
    }

    // Create the user via Supabase Auth Admin API
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for admin-created users
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    const newUserId = userData.user.id;

    // Resolve target org from caller's auth context unless caller explicitly
    // supplies one. No silent fallback to a dev org — if neither is available,
    // 403 so we never accidentally cross-contaminate orgs.
    const targetOrg = org_id || (await resolveOrgIdFromUserId(supabase, auth.userId));
    if (!targetOrg) {
      return NextResponse.json(
        { error: "Caller has no org membership and no org_id was supplied" },
        { status: 403 }
      );
    }
    const { error: memberError } = await supabase.from("org_memberships").insert({
      org_id: targetOrg,
      user_id: newUserId,
      role: role || "member",
    });

    if (memberError) {
      return NextResponse.json(
        { error: `User created but org assignment failed: ${memberError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        user: { id: newUserId, email },
        org_id: targetOrg,
        role: role || "member",
      },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// GET /api/admin/users: list org members (every organisation; platform admin only). SEC-5 (migration 372): the
// member rows carry the profile embed (name, email, avatar) the admin member list renders. A signed-in session can
// no longer read other users' profiles or any email, so the admin dashboard's browser refresh calls this route,
// which reads through the service client behind the platform-admin gate (requireAdminRoute).
export async function GET(request: NextRequest) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

  try {
    const { data, error } = await supabase
      .from("org_memberships")
      .select("id, org_id, user_id, role, created_at, user:profiles!user_id(full_name, display_name, email, avatar_url)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { members: data },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
