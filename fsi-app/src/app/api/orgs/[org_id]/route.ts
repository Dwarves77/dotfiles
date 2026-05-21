// /api/orgs/[org_id]
//
// Per-org GET + PATCH for the UserProfilePage Organization tab.
//
// GET — returns org identity + derived stats (owner display, member
// count) for the caller's own org. Caller must be a member; the
// auth check uses community-auth (cookie session) to keep parity
// with the rest of the user-facing org surface.
//
// PATCH — updates name and/or slug. OWNER-ONLY per the three-layer
// tenant model (ADR-001: owners control workspace identity). slug
// validation: lowercase letters, digits, hyphens, 2-60 chars,
// uniqueness enforced by the existing organizations.slug UNIQUE
// constraint.
//
// Service-role writes only via server routes per operator binding
// rule (never client-side).

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

async function getMembership(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<{ role: string } | null> {
  const { data } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role: string } | null) ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ org_id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { org_id } = await params;
  if (!org_id) {
    return NextResponse.json(
      { error: "org_id required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const service = getServiceClient();

  // Membership gate — caller must be a member of this org.
  const membership = await getMembership(service, org_id, auth.userId);
  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of this organization" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data: org, error: orgError } = await service
    .from("organizations")
    .select("id, name, slug, plan, created_at")
    .eq("id", org_id)
    .maybeSingle();
  if (orgError || !org) {
    return NextResponse.json(
      { error: orgError?.message || "org not found" },
      { status: 404, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Resolve the owner (earliest 'owner' membership for the org) + a
  // display name from profiles. There can be multiple owners; we show
  // the first by created_at and let the Members tab list the rest.
  const { data: ownerRow } = await service
    .from("org_memberships")
    .select("user_id, created_at, user:profiles!user_id(full_name, avatar_url)")
    .eq("org_id", org_id)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const ownerProfile = (ownerRow?.user || null) as { full_name?: string | null } | null;

  const { count: memberCount } = await service
    .from("org_memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org_id);

  return NextResponse.json(
    {
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        created_at: org.created_at,
      },
      caller_role: membership.role,
      owner: ownerRow
        ? {
            user_id: ownerRow.user_id,
            display_name:
              ownerProfile?.full_name ?? `${String(ownerRow.user_id).slice(0, 8)}...`,
            owner_since: ownerRow.created_at,
          }
        : null,
      member_count: memberCount ?? 0,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

interface PatchBody {
  name?: string;
  slug?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ org_id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { org_id } = await params;
  if (!org_id) {
    return NextResponse.json(
      { error: "org_id required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const service = getServiceClient();

  const membership = await getMembership(service, org_id, auth.userId);
  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of this organization" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (membership.role !== "owner") {
    return NextResponse.json(
      { error: "Owner role required to edit organization" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const patch: { name?: string; slug?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "name must be non-empty" },
        { status: 400, headers: rateLimitHeaders(auth.userId) }
      );
    }
    if (trimmed.length > 200) {
      return NextResponse.json(
        { error: "name must be 200 characters or fewer" },
        { status: 400, headers: rateLimitHeaders(auth.userId) }
      );
    }
    patch.name = trimmed;
  }

  if (typeof body.slug === "string") {
    const trimmed = body.slug.trim().toLowerCase();
    if (trimmed.length < 2 || trimmed.length > 60) {
      return NextResponse.json(
        { error: "slug must be 2-60 characters" },
        { status: 400, headers: rateLimitHeaders(auth.userId) }
      );
    }
    if (!SLUG_RE.test(trimmed)) {
      return NextResponse.json(
        {
          error:
            "slug must contain only lowercase letters, digits, or hyphens; cannot start or end with a hyphen",
        },
        { status: 400, headers: rateLimitHeaders(auth.userId) }
      );
    }
    patch.slug = trimmed;
  }

  // Nothing to update beyond updated_at means the caller sent an empty
  // patch; reject so the surface gets a clean error rather than a silent
  // bump of updated_at.
  if (patch.name === undefined && patch.slug === undefined) {
    return NextResponse.json(
      { error: "Provide at least one of name or slug" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data, error } = await service
    .from("organizations")
    .update(patch)
    .eq("id", org_id)
    .select("id, name, slug, plan, created_at, updated_at")
    .maybeSingle();

  if (error) {
    // Surface the unique-constraint message verbatim so the operator
    // sees "slug already taken" rather than a generic 500.
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { error: error.message },
      { status, headers: rateLimitHeaders(auth.userId) }
    );
  }

  return NextResponse.json(
    { org: data },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
