// /api/orgs/[org_id]/members
//
// GET — list org_memberships for the caller's org. Caller must be a
// member. Returns id, user_id, role, joined timestamp, and the joined
// profile.full_name / avatar_url for display.
//
// PATCH — change a member's role. Owner-only. Body: { membership_id,
// role }. Role must be one of the role-CHECK values; cannot demote
// the only owner (server checks that count(owner) > 1 before allowing
// an owner -> non-owner change on the only owner).
//
// DELETE — revoke a membership. Owner-only. Cannot revoke self
// (owner cannot remove their own membership; explicit guard with a
// 403 to make the operator surface unambiguous).
//
// Service-role writes only via this server route per operator binding
// rule.

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

const VALID_ROLES = new Set(["owner", "admin", "member", "viewer"]);

async function getMembership(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<{ membership: { id: string; role: string } | null; error: string | null }> {
  const { data, error } = await supabase
    .from("org_memberships")
    .select("id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  // RETURN-TYPE (0.5a): the {membership,error} shape STRUCTURALLY forces every caller (current and
  // future) to handle the DB-error case to reach membership — error -> 500 (DB failure), null -> 403
  // (not a member). The type makes the split mechanical, not a wrap a future caller must remember.
  return { membership: (data as { id: string; role: string } | null) ?? null, error: error ? error.message : null };
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

  const { membership: callerMembership, error: callerErr } = await getMembership(service, org_id, auth.userId);
  if (callerErr) {
    return NextResponse.json(
      { error: callerErr },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!callerMembership) {
    return NextResponse.json(
      { error: "Not a member of this organization" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data, error } = await service
    .from("org_memberships")
    .select(
      "id, user_id, role, created_at, user:profiles!user_id(full_name, display_name, email, avatar_url)"
    )
    .eq("org_id", org_id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Resolve auth.users emails via the admin API so the operator UI can
  // show recognizable identities for members without a profile row.
  // Avoid one-shot admin.listUsers for large orgs; instead query for
  // exactly the user_ids on this org.
  const rows = (data || []) as Array<{
    id: string;
    user_id: string;
    role: string;
    created_at: string;
    user: { full_name?: string | null; display_name?: string | null; email?: string | null; avatar_url?: string | null } | null;
  }>;

  return NextResponse.json(
    {
      members: rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        role: r.role,
        joined_at: r.created_at,
        display_name:
          r.user?.full_name ?? r.user?.display_name ?? r.user?.email ?? `${String(r.user_id).slice(0, 8)}...`,
        avatar_url: r.user?.avatar_url ?? null,
      })),
      caller_role: callerMembership.role,
      caller_membership_id: callerMembership.id,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

interface PatchBody {
  membership_id?: string;
  role?: string;
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

  const membershipId = typeof body.membership_id === "string" ? body.membership_id : null;
  const role = typeof body.role === "string" ? body.role : null;

  if (!membershipId) {
    return NextResponse.json(
      { error: "membership_id is required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!role || !VALID_ROLES.has(role)) {
    return NextResponse.json(
      { error: "role must be one of: owner, admin, member, viewer" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const service = getServiceClient();

  const { membership: callerMembership, error: callerErr } = await getMembership(service, org_id, auth.userId);
  if (callerErr) {
    return NextResponse.json(
      { error: callerErr },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!callerMembership) {
    return NextResponse.json(
      { error: "Not a member of this organization" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (callerMembership.role !== "owner") {
    return NextResponse.json(
      { error: "Owner role required to change member roles" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Read the target membership inside the same org for the demotion guard.
  const { data: target, error: targetErr } = await service
    .from("org_memberships")
    .select("id, user_id, role, org_id")
    .eq("id", membershipId)
    .maybeSingle();
  if (targetErr) {
    // FAIL-CLOSED: a DB error is not "not found" — a 404 would mask the failure.
    return NextResponse.json(
      { error: targetErr.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!target || target.org_id !== org_id) {
    return NextResponse.json(
      { error: "membership not found in this org" },
      { status: 404, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Demotion guard: if the target is currently the only owner and the
  // patch demotes them, refuse. The org must always have at least one
  // owner.
  if (target.role === "owner" && role !== "owner") {
    const { count: ownerCount, error: ownerCountErr } = await service
      .from("org_memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org_id)
      .eq("role", "owner");
    if (ownerCountErr || ownerCount == null) {
      // FAIL-CLOSED: a swallowed count error + `?? 0` would let the last-owner guard silently pass
      // and demote the only owner. Refuse on an unverifiable count.
      return NextResponse.json(
        { error: ownerCountErr?.message ?? "owner count unavailable" },
        { status: 500, headers: rateLimitHeaders(auth.userId) }
      );
    }
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the only owner. Promote another member to owner first." },
        { status: 409, headers: rateLimitHeaders(auth.userId) }
      );
    }
  }

  const { data, error } = await service
    .from("org_memberships")
    .update({ role })
    .eq("id", membershipId)
    .select("id, role")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  return NextResponse.json(
    { membership: data },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

interface PostBody {
  membership_id?: string;
  reason?: string;
}

// POST — org-scoped BAN. Owner-only. Body: { membership_id, reason? }. Records
// a row in org_member_bans (block-rejoin) AND removes the membership. Cannot
// ban self; cannot ban the only owner. This is NOT a platform-wide account ban
// — the account is only blocked from THIS workspace (operator ruling
// 2026-07-07; enforced on rejoin by accept_invitation, migration 156).
export async function POST(
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

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  const membershipId = typeof body.membership_id === "string" ? body.membership_id : null;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 2000) : null;
  if (!membershipId) {
    return NextResponse.json(
      { error: "membership_id is required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const service = getServiceClient();

  const { membership: callerMembership, error: callerErr } = await getMembership(service, org_id, auth.userId);
  if (callerErr) {
    return NextResponse.json(
      { error: callerErr },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!callerMembership) {
    return NextResponse.json(
      { error: "Not a member of this organization" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (callerMembership.role !== "owner") {
    return NextResponse.json(
      { error: "Owner role required to ban members" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data: target, error: targetErr } = await service
    .from("org_memberships")
    .select("id, user_id, role, org_id")
    .eq("id", membershipId)
    .maybeSingle();
  if (targetErr) {
    return NextResponse.json(
      { error: targetErr.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!target || target.org_id !== org_id) {
    return NextResponse.json(
      { error: "membership not found in this org" },
      { status: 404, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (target.user_id === auth.userId) {
    return NextResponse.json(
      { error: "You cannot ban yourself" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }
  // Last-owner guard: never ban the only owner (would leave the org ownerless).
  if (target.role === "owner") {
    const { count: ownerCount, error: ownerCountErr } = await service
      .from("org_memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org_id)
      .eq("role", "owner");
    if (ownerCountErr || ownerCount == null) {
      return NextResponse.json(
        { error: ownerCountErr?.message ?? "owner count unavailable" },
        { status: 500, headers: rateLimitHeaders(auth.userId) }
      );
    }
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot ban the only owner. Promote another member to owner first." },
        { status: 409, headers: rateLimitHeaders(auth.userId) }
      );
    }
  }

  // Record the ban FIRST (block-rejoin), then remove the membership. Ordering
  // matters: if the delete succeeded first and the ban insert failed, the user
  // could rejoin. Ban-then-delete fails closed.
  const { error: banErr } = await service
    .from("org_member_bans")
    .upsert(
      { org_id, user_id: target.user_id, banned_by: auth.userId, reason },
      { onConflict: "org_id,user_id" }
    );
  if (banErr) {
    return NextResponse.json(
      { error: banErr.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { error: delErr } = await service
    .from("org_memberships")
    .delete()
    .eq("id", membershipId);
  if (delErr) {
    return NextResponse.json(
      { error: delErr.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  return NextResponse.json(
    { success: true, banned_user_id: target.user_id, membership_id: membershipId },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function DELETE(
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

  const url = new URL(request.url);
  const membershipId = url.searchParams.get("membership_id");
  if (!membershipId) {
    return NextResponse.json(
      { error: "membership_id query parameter required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const service = getServiceClient();

  const { membership: callerMembership, error: callerErr } = await getMembership(service, org_id, auth.userId);
  if (callerErr) {
    return NextResponse.json(
      { error: callerErr },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!callerMembership) {
    return NextResponse.json(
      { error: "Not a member of this organization" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (callerMembership.role !== "owner") {
    return NextResponse.json(
      { error: "Owner role required to revoke members" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data: target, error: targetErr } = await service
    .from("org_memberships")
    .select("id, user_id, role, org_id")
    .eq("id", membershipId)
    .maybeSingle();
  if (targetErr) {
    // FAIL-CLOSED: a DB error is not "not found".
    return NextResponse.json(
      { error: targetErr.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!target || target.org_id !== org_id) {
    return NextResponse.json(
      { error: "membership not found in this org" },
      { status: 404, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Owner cannot revoke self. Surface as 403 with an explicit message
  // rather than letting the request succeed and the operator lock
  // themselves out of the org.
  if (target.user_id === auth.userId) {
    return NextResponse.json(
      { error: "Owners cannot revoke their own membership" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // If the target is an owner, guard last-owner removal the same way
  // PATCH does.
  if (target.role === "owner") {
    const { count: ownerCount, error: ownerCountErr } = await service
      .from("org_memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org_id)
      .eq("role", "owner");
    if (ownerCountErr || ownerCount == null) {
      // FAIL-CLOSED: a swallowed count error + `?? 0` would let the last-owner guard silently pass
      // and lock the org out of its only owner. Refuse on an unverifiable count.
      return NextResponse.json(
        { error: ownerCountErr?.message ?? "owner count unavailable" },
        { status: 500, headers: rateLimitHeaders(auth.userId) }
      );
    }
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot revoke the only owner. Promote another member to owner first." },
        { status: 409, headers: rateLimitHeaders(auth.userId) }
      );
    }
  }

  const { error } = await service
    .from("org_memberships")
    .delete()
    .eq("id", membershipId);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  return NextResponse.json(
    { success: true, membership_id: membershipId },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
