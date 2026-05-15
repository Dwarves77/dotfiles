// src/app/api/orgs/[org_id]/invitations/route.ts
//
// POST   /api/orgs/[org_id]/invitations — admin creates a new invitation.
// GET    /api/orgs/[org_id]/invitations — admin lists all invitations for the org.
//
// Email-stub model (per dispatch decision I.4): we do NOT send email.
// We INSERT the row, the token, and log the URL to console + return it
// in the response so the admin chrome can render a copy button.
//
// Authorization is enforced by the org_invitations RLS policies; the
// admin must be owner/admin of the org (the policy's USING/WITH CHECK
// clause runs on the RLS-aware client).
//
// Workstream B (Multi-Tenant Foundation) — 2026-05-15.

import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAuth, isCommunityAuthError } from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_VALUES = new Set(["admin", "member", "viewer"]);

interface RouteContext {
  params: Promise<{ org_id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { org_id } = await context.params;
  if (!UUID_RE.test(org_id)) {
    return NextResponse.json({ error: "Invalid org_id" }, { status: 400 });
  }

  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body?.email ?? "").trim().toLowerCase();
  const role = (body?.role ?? "member").trim();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!ROLE_VALUES.has(role)) {
    return NextResponse.json(
      { error: "role must be admin, member, or viewer" },
      { status: 400 }
    );
  }

  // RLS enforces that auth.uid() is admin/owner of org_id and that
  // invited_by_user_id == auth.uid(). The INSERT will fail with PGRST301
  // for non-admins.
  const { data, error } = await auth.supabase
    .from("org_invitations")
    .insert({
      org_id,
      invited_email: email,
      invited_by_user_id: auth.userId,
      proposed_role: role,
    })
    .select("id, token, invited_email, proposed_role, expires_at, status, created_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A pending invitation already exists for this email + org" },
        { status: 409 }
      );
    }
    if (error.code === "42501" || error.code === "PGRST301") {
      return NextResponse.json(
        { error: "Only org admins can invite members" },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Insert returned no row (RLS may have rejected the write)" },
      { status: 403 }
    );
  }

  // Email stub: log the URL so an admin running the dev server sees it.
  // Real email delivery is out of scope per dispatch I.4.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    request.headers.get("origin") ||
    "";
  const inviteUrl = `${baseUrl}/invitations/${data.token}`;
  // eslint-disable-next-line no-console
  console.log(
    `[invitation] org=${org_id} email=${email} role=${role} url=${inviteUrl}`
  );

  return NextResponse.json(
    {
      invitation: {
        id: data.id,
        invited_email: data.invited_email,
        proposed_role: data.proposed_role,
        expires_at: data.expires_at,
        status: data.status,
        created_at: data.created_at,
        invite_url: inviteUrl,
      },
    },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { org_id } = await context.params;
  if (!UUID_RE.test(org_id)) {
    return NextResponse.json({ error: "Invalid org_id" }, { status: 400 });
  }

  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  // RLS enforces visibility (admin/owner of org_id only).
  const { data, error } = await auth.supabase
    .from("org_invitations")
    .select(
      "id, invited_email, proposed_role, status, created_at, expires_at, accepted_at, declined_at, revoked_at, invited_by_user_id"
    )
    .eq("org_id", org_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Lazy-expiry: items with status=pending and expires_at in the past
  // surface as 'expired' to the caller (the actual row update happens
  // inside accept/decline functions; admin listings can render the
  // computed status without a write).
  const now = Date.now();
  const list = (data ?? []).map((inv) => ({
    ...inv,
    status:
      inv.status === "pending" && new Date(inv.expires_at).getTime() <= now
        ? "expired"
        : inv.status,
  }));

  return NextResponse.json(
    { invitations: list },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
