import { NextRequest, NextResponse } from "next/server";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { sendInvitationEmail } from "@/lib/email/send-invitation-email";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";

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

  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

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

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    request.headers.get("origin") ||
    "";
  const inviteUrl = `${baseUrl}/invitations/${data.token}`;
  // No email, no URL, no token in the function log: the URL carries the bearer token (SEC-10, B-0004).
  console.log(`[invitation] org=${org_id} invitation=${data.id} role=${role}`);

  // Email delivery through the single seam. The result is returned to the
  // inviter verbatim — a failed or unconfigured send is a visible state the
  // admin acts on (copy the link), never a silent drop.
  const emailDelivery = await sendInvitationEmail({
    to: email,
    inviteUrl,
    proposedRole: role,
  });

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
      email_delivery: emailDelivery,
    },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { org_id } = await context.params;
  if (!UUID_RE.test(org_id)) {
    return NextResponse.json({ error: "Invalid org_id" }, { status: 400 });
  }

  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

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
