// /api/community/profile
//
// GET  — the caller's own community_member_profiles projection: org_type, role, sector, region, plus
//        THEIR OWN verification status (verified, verified_at, verification_method — see
//        src/lib/community/profile-policy.mjs projectOwnProfile). A member who has not yet created a
//        profile row gets the empty/unverified shape (200, not 404) — the row is created the first time
//        they PUT.
// PUT  { org_type, role?, sector?, region? } — self-service upsert of the caller's own four declarable
//        fields (spec 05 §2, §5 component 1). verified/verified_at/verification_method/
//        organisation_key are ALWAYS stripped from the write before it reaches the database — migration
//        293's own header comment on community_member_profiles_update_own demands exactly this
//        ("the application route... MUST strip verified/verified_at/verification_method from a
//        member-originated PATCH before writing... this table has no per-column RLS"). See
//        sanitizeMemberWrite() for the allowlist that does the stripping; it is applied unconditionally,
//        so a request body carrying those fields (deliberately or not) is silently ignored for them,
//        never merged in.
//
// Auth: cookie session (community-auth helper). This route uses the caller's own RLS-scoped client for
// both read and write — RLS policies community_member_profiles_select_authenticated /
// _upsert_own / _update_own (migration 293) — never a service-role escape, because nothing this route
// can write is verification-sensitive: sanitizeMemberWrite() guarantees a member can never reach
// verified/verification_method/organisation_key through this route regardless of what RLS would
// otherwise permit. Verification itself is a separate route (POST /api/community/profile/verify),
// which does use the service-role client, precisely because it writes those columns.
//
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { sanitizeMemberWrite, projectOwnProfile } from "@/lib/community/index.mjs";

const PROFILE_COLUMNS = "org_type, role, sector, region, verified, verified_at, verification_method";

export async function GET(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

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
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

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
