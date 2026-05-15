// src/app/api/orgs/[org_id]/invitations/[id]/route.ts
//
// DELETE /api/orgs/[org_id]/invitations/[id] — admin revokes a pending
// invitation. Implemented as an UPDATE to status='revoked' (not a row
// delete), so the audit trail of who revoked when survives.
//
// Workstream B (Multi-Tenant Foundation) — 2026-05-15.

import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAuth, isCommunityAuthError } from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ org_id: string; id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { org_id, id } = await context.params;
  if (!UUID_RE.test(org_id) || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id format" }, { status: 400 });
  }

  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  // revoke_invitation() RPC enforces admin role + state validity and
  // returns the appropriate error.
  const { error } = await auth.supabase.rpc("revoke_invitation", {
    p_invitation_id: id,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "Only org admins can revoke invitations" },
        { status: 403 }
      );
    }
    if (error.code === "P0002") {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }
    if (error.code === "22023") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sanity-check: the invitation still belongs to org_id (defense-in-depth
  // against URL tampering — the RPC above only checks admin status against
  // the invitation's own org_id).
  const { data: inv } = await auth.supabase
    .from("org_invitations")
    .select("org_id, status")
    .eq("id", id)
    .maybeSingle();
  if (inv && inv.org_id !== org_id) {
    return NextResponse.json(
      { error: "Invitation does not belong to org" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { ok: true, status: "revoked" },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
