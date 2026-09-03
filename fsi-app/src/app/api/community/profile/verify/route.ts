// POST /api/community/profile/verify
//
// Corporate-email verification (spec 05 §2, required component 1). WHAT "VERIFIED" MEANS TODAY, stated
// plainly because it is a deliberate scope decision, not an oversight: the platform already knows the
// caller's account email (Supabase auth.users.email, set at signup and confirmed by Supabase's own
// email-confirmation flow) — a CORPORATE domain on that already-confirmed account address IS the
// verification (verification_method = 'corporate-email'). This route does not send a second
// confirmation email, and does not implement spec 05 §2's fuller "corroborated against Gartner profiles
// or LinkedIn" (migration 293's other two verification_method values, 'linkedin' and 'write-in', are
// reserved for that future upgrade path — this route is the corporate-email path only, and is the
// entire verification surface this lane builds).
//
// Refuses when: the account has no email on file, or the email's domain is free-mail
// (src/lib/community/organisation-key.mjs isCorporateDomain/FREE_MAIL_DOMAINS). This is the exact
// refusal BenchmarksPanel points a member at ("verify a corporate email first", linking here) when the
// response route refuses an unverified submission.
//
// On success, writes verified=true, verified_at, verification_method='corporate-email' AND
// organisation_key IN THE SAME WRITE. Migration 293's own CHECK constraint
// (community_member_profiles_verified_has_method) requires all three-plus-organisation_key together —
// verified=true demands verified_at, verification_method AND organisation_key all non-null at once, so
// a partially verified row is impossible by construction; this route either sets all four or none.
// organisation_key itself is derived by src/lib/community/organisation-key.mjs deriveOrganisationKey()
// from the account email's DOMAIN ONLY (never the full address) plus a server-side salt resolved by
// src/lib/community/organisation-salt.ts (COMMUNITY_ORG_SALT when set, else derived from WORKER_SECRET via
// HKDF, 2026-09-03) — the derived key is written to the database and NEVER included in
// this route's own JSON response (see the response shape below: no organisationKey field at all).
//
// Always via the SERVICE-ROLE client, never the caller's own RLS-scoped client — this is the ONE route
// that writes verified/verified_at/verification_method/organisation_key (migration 293's own header),
// and a member's own INSERT/UPDATE policies do not (and must not) cover those columns.
//
// A member's org_type is NOT NULL in the schema (migration 293), so a caller who verifies before ever
// setting a profile (via PUT /api/community/profile) gets a sensible default (org_type='other', UX law
// 13 — "safest and most common option... easy to change") rather than a confusing "set your profile
// first" detour; a caller who already has a profile row keeps their own org_type/role/sector/region
// untouched (this route only ever writes the four verification-related columns onto an existing row).
//
// Auth: cookie session. Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { getServiceSupabase } from "@/lib/supabase-service";
import { resolveOrganisationSalt } from "@/lib/community/organisation-salt";
import {
  domainFromEmail,
  isCorporateDomain,
  deriveOrganisationKey,
} from "@/lib/community/index.mjs";

export async function POST(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const {
    data: { user },
  } = await auth.supabase.auth.getUser();
  const email = user?.email ?? null;
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
