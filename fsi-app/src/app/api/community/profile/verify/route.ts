import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { getServiceSupabase } from "@/lib/supabase-service";
import { resolveOrganisationSalt } from "@/lib/community/organisation-salt";
import {
  domainFromEmail,
  isCorporateDomain,
  deriveOrganisationKey,
} from "@/lib/community/index.mjs";

export async function POST(request: NextRequest) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  // PERF-7 (2026-09-04, audit §13.5): the account email is on the standard Supabase JWT claim set, so
  // read it from the locally verified claims (getClaims(), JWKS) instead of a second Auth-server round
  // trip on top of requireCommunityAuth's; a symmetric-secret project falls back inside getClaims().
  const { data: claimsData } = await auth.supabase.auth.getClaims();
  const email = claimsData?.claims?.email ?? null;
  const domain = domainFromEmail(email);

  if (!domain) {
    return NextResponse.json(
      { error: "Your account has no email on file to verify against." },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!isCorporateDomain(domain)) {
    return NextResponse.json(
      {
        error:
          `"${domain}" is a free-mail domain, not a corporate identity. Corporate-email verification ` +
          "requires a company email address on your account.",
      },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { salt } = resolveOrganisationSalt();
  const keyResult = deriveOrganisationKey({ domain, verified: true, salt: salt ?? undefined });
  if (keyResult.refused || !keyResult.organisationKey) {
    return NextResponse.json(
      { error: `Could not verify: ${keyResult.reason}` },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const nowIso = new Date().toISOString();
  const service = getServiceSupabase();

  const { data: existing, error: existingErr } = await service
    .from("community_member_profiles")
    .select("user_id, org_type, role, sector, region")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const verificationFields = {
    verified: true,
    verified_at: nowIso,
    verification_method: "corporate-email" as const,
    organisation_key: keyResult.organisationKey,
  };

  const write = existing
    ? service
        .from("community_member_profiles")
        .update(verificationFields)
        .eq("user_id", auth.userId)
    : service
        .from("community_member_profiles")
        .insert({ user_id: auth.userId, org_type: "other", ...verificationFields });

  const { data, error } = await write
    .select("org_type, role, sector, region, verified, verified_at, verification_method")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      profile: {
        orgType: data?.org_type ?? null,
        role: data?.role ?? null,
        sector: data?.sector ?? null,
        region: data?.region ?? null,
        verified: true,
        verifiedAt: nowIso,
        verificationMethod: "corporate-email",
      },
    },
    { status: 200, headers: rateLimitHeaders(auth.userId) }
  );
}
