import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/admin/users — create a user and assign to org
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  try {
    const { email, password, role, org_id } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/admin/users — list org members
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  try {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("org_memberships")
      .select("id, org_id, user_id, role, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { members: data },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
