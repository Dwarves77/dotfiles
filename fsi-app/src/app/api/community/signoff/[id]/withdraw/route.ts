// POST /api/community/signoff/[id]/withdraw
//
// The requester withdraws their own OPEN (pending) sign-off request
// (community-schema-mapping.md §3.1). Sets status = 'withdrawn', which frees
// the partial unique index so a fresh request can later be opened on the post.
//
// Authorization: migration 153 shipped only signoff_decide (an active-verifier
// UPDATE policy) — there is NO RLS path for a plain requester to update their
// own row, so withdraw is authorized by the ADDITIVE policy in migration 154
// (signoff_withdraw_own): requested_by = auth.uid() AND status = 'pending' AND
// the new status is 'withdrawn'. We do NOT re-implement authorization in app
// code; the caller's RLS-aware client is the auth boundary. Until migration 154
// is applied, this UPDATE matches 0 rows and returns a 404 (the request is
// invisible-for-write to the requester), so the route is safe pre-apply.
//
// Auth: cookie session via requireCommunityAuth.
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SignoffRow {
  id: string;
  post_id: string;
  requested_by: string;
  status: string;
  verifier_id: string | null;
  primary_doc_url: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
}

const SELECT_COLS =
  "id, post_id, requested_by, status, verifier_id, primary_doc_url, decision_note, created_at, decided_at";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id: requestId } = await params;
  if (!requestId || !UUID_RE.test(requestId)) {
    return NextResponse.json(
      { error: "Valid sign-off request id required" },
      { status: 400 }
    );
  }

  // RLS (signoff_withdraw_own, migration 154) enforces requested_by = caller +
  // status = 'pending'; the explicit filters here keep the write intent clear
  // and idempotent-safe (a second call matches 0 rows).
  const { data: updated, error: updErr } = await auth.supabase
    .from("community_post_signoff_requests")
    .update({ status: "withdrawn", decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("requested_by", auth.userId)
    .eq("status", "pending")
    .select(SELECT_COLS)
    .maybeSingle();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      {
        error:
          "No open sign-off request of yours was found to withdraw.",
        code: "no_open_request",
      },
      { status: 404, headers: rateLimitHeaders(auth.userId) }
    );
  }

  return NextResponse.json(
    { request: updated as SignoffRow },
    { status: 200, headers: rateLimitHeaders(auth.userId) }
  );
}
