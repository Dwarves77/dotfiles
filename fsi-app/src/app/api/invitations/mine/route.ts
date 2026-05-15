// src/app/api/invitations/mine/route.ts
//
// GET /api/invitations/mine — list all pending invitations addressed to
// the caller's email. Used by the no-workspace landing page banner and
// by the Profile invitations rail.
//
// Workstream B (Multi-Tenant Foundation) — 2026-05-15.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCommunityAuth, isCommunityAuthError } from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  // Resolve caller's email via service role so we can compare against
  // org_invitations.invited_email. The RLS-aware client doesn't have
  // visibility into the invitations addressed to their email unless they
  // happen to also be an admin of the inviting org, so the listing has
  // to come from the service role.
  const service = getServiceClient();
  const { data: { user }, error: userErr } = await service.auth.admin.getUserById(auth.userId);
  if (userErr || !user?.email) {
    return NextResponse.json({ invitations: [] });
  }
  const email = user.email.toLowerCase();

  const { data, error } = await service
    .from("org_invitations")
    .select(
      "id, org_id, invited_email, proposed_role, status, created_at, expires_at, organizations(name, slug), token"
    )
    .eq("invited_email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const list = (data ?? []).filter((inv) => {
    return new Date(inv.expires_at).getTime() > now;
  });

  return NextResponse.json(
    {
      invitations: list.map((inv) => ({
        id: inv.id,
        org_id: inv.org_id,
        org_name: (inv.organizations as { name?: string } | null)?.name ?? null,
        org_slug: (inv.organizations as { slug?: string } | null)?.slug ?? null,
        proposed_role: inv.proposed_role,
        status: inv.status,
        created_at: inv.created_at,
        expires_at: inv.expires_at,
        token: inv.token,
      })),
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
