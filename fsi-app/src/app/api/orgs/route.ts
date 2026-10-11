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
