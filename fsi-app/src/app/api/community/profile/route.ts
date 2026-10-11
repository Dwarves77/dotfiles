import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { sanitizeMemberWrite, projectOwnProfile } from "@/lib/community/index.mjs";

const PROFILE_COLUMNS =
  "org_type, role, sector, region, verified, verified_at, verification_method, default_anonymous";

export async function GET(request: NextRequest) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  const { data, error } = await auth.supabase
    .from("community_member_profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { profile: projectOwnProfile(data) },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function PUT(request: NextRequest) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sanitized = sanitizeMemberWrite(body);
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }

  // sanitized.data carries ONLY org_type/role/sector/region — verified/verified_at/
  // verification_method/organisation_key are never present here (sanitizeMemberWrite's allowlist —
  // see its header), so this write structurally cannot touch them regardless of what the request body
  // contained. RLS (community_member_profiles_upsert_own / _update_own) additionally confines the
  // write to the caller's own row.
  const { data, error } = await auth.supabase
    .from("community_member_profiles")
    .upsert({ user_id: auth.userId, ...sanitized.data }, { onConflict: "user_id" })
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST301") {
      return NextResponse.json({ error: "Not permitted to write this profile" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { profile: projectOwnProfile(data) },
    { status: 200, headers: rateLimitHeaders(auth.userId) }
  );
}
