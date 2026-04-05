import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

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

    // Assign to organization
    const targetOrg = org_id || "a0000000-0000-0000-0000-000000000001"; // Default to dev org
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
