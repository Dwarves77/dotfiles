// src/app/api/orgs/route.ts
//
// POST /api/orgs: self-service org creation with the onboarding profile. Creates the organisation,
// makes the caller the owner, seeds workspace_settings, and records the sector, company size and
// region the person gave plus their job title (lane AUTH-2, 2026-10-06; logic in
// src/lib/orgs/create-org.mjs, which documents what is written and what is never taken from the body).
//
// Request body: { name: string, sectors?: string[], headcount_band?: string, regions?: string[],
//                 job_title?: string }. An organisation id, user id, role or slug in the body is ignored.
// Response: { org_id, slug, name, settings_saved, profile_saved }
//
// Workstream B (Multi-Tenant Foundation) 2026-05-15; extended by AUTH-2.

import { NextRequest, NextResponse } from "next/server";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { ALL_SECTORS } from "@/lib/constants";
import { ensureProfile } from "@/lib/auth/provision-personal-workspace";
import { createOrganisationForSelf, parseCreateOrgInput } from "@/lib/orgs/create-org.mjs";

export async function POST(request: NextRequest) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseCreateOrgInput(body, { validSectorIds: ALL_SECTORS.map((s) => s.id) });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let email: string | null = null;
  try {
    const { data } = await auth.supabase.auth.getUser();
    email = data.user?.email ?? null;
  } catch {
    email = null;
  }

  const created = await createOrganisationForSelf({
    supabase: auth.supabase,
    userId: auth.userId,
    email,
    input: parsed.input,
    ensureProfile,
  });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  // Fetch the slug + name for the response so the caller can route to
  // /admin or /onboarding without an extra round trip.
  const orgId = created.orgId;
  const { data: org } = await auth.supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", orgId)
    .maybeSingle();

  return NextResponse.json(
    {
      org_id: orgId,
      slug: org?.slug ?? null,
      name: org?.name ?? parsed.input.name,
      settings_saved: created.settingsSaved,
      profile_saved: created.profileSaved,
    },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}
