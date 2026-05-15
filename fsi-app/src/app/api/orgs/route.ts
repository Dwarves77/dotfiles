// src/app/api/orgs/route.ts
//
// POST /api/orgs — self-service org creation. Creates the organization,
// makes the caller the owner, seeds default workspace_settings.
//
// Request body: { name: string, slug?: string }
// Response: { org_id: string, slug: string, name: string }
//
// All work happens inside the create_org_for_self() RPC (migration 076)
// so the row inserts run as a single transaction with consistent
// authorization (the RPC checks auth.uid() and bypasses the
// organizations RLS that blocks public INSERT).
//
// Workstream B (Multi-Tenant Foundation) — 2026-05-15.

import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAuth, isCommunityAuthError } from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: { name?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body?.name ?? "").trim();
  const slug = (body?.slug ?? "").trim() || null;
  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }
  if (name.length > 200) {
    return NextResponse.json(
      { error: "name must be 200 characters or fewer" },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase.rpc("create_org_for_self", {
    p_org_name: name,
    p_org_slug: slug,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Fetch the slug + name for the response so the caller can route to
  // /admin or /onboarding without an extra round trip.
  const orgId = data as string;
  const { data: org } = await auth.supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", orgId)
    .maybeSingle();

  return NextResponse.json(
    {
      org_id: orgId,
      slug: org?.slug ?? null,
      name: org?.name ?? name,
    },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}
