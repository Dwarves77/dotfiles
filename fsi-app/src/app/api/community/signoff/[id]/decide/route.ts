// POST /api/community/signoff/[id]/decide
//
// Record a verifier's decision on a sign-off request (community-schema-
// mapping.md §3.1). Body: { decision: "signed_off" | "declined",
// primary_doc_url?, decision_note? }.
//
// Authorization is enforced by migration-153 RLS (signoff_decide): only a
// profile with verifier_status = 'active' (or is_platform_admin) may UPDATE a
// request row. We perform the decision UPDATE with the caller's RLS-aware
// client, so the DB is the auth boundary — the caller-role read below is only
// for a precise error message, never the gate.
//
// On a 'signed_off' decision the post becomes citable: we stamp
// community_posts.signed_off_at / signed_off_by. That column is author-or-admin
// writable under RLS (migration 030), and a verifier is generally neither, so
// the companion stamp is written with a service-role client AFTER the
// RLS-gated decision succeeds — the same validate-then-materialize shape the
// promote route uses. The stamp is a downstream effect of an already-authorized
// decision, not a second authorization path.
//
// The UPDATE targets status = 'pending' only, so a request cannot be decided
// twice (a withdrawn/declined/signed_off request is inert).
//
// Auth: cookie session via requireCommunityAuth.
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_NOTE_LEN = 2000;

const DECISIONS = ["signed_off", "declined"] as const;
type Decision = (typeof DECISIONS)[number];

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

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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

  // ── Parse + validate body ─────────────────────────────────────────
  let body: { decision?: string; primary_doc_url?: string; decision_note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const decision = body?.decision;
  if (typeof decision !== "string" || !DECISIONS.includes(decision as Decision)) {
    return NextResponse.json(
      { error: `decision must be one of: ${DECISIONS.join(", ")}` },
      { status: 400 }
    );
  }

  let primaryDocUrl: string | null = null;
  if (body.primary_doc_url !== undefined && body.primary_doc_url !== null) {
    if (typeof body.primary_doc_url !== "string") {
      return NextResponse.json(
        { error: "primary_doc_url must be a string" },
        { status: 400 }
      );
    }
    const trimmed = body.primary_doc_url.trim();
    if (trimmed) {
      if (!isHttpUrl(trimmed)) {
        return NextResponse.json(
          { error: "primary_doc_url must be an http(s) URL" },
          { status: 400 }
        );
      }
      primaryDocUrl = trimmed;
    }
  }

  let decisionNote: string | null = null;
  if (body.decision_note !== undefined && body.decision_note !== null) {
    if (typeof body.decision_note !== "string") {
      return NextResponse.json(
        { error: "decision_note must be a string" },
        { status: 400 }
      );
    }
    const trimmed = body.decision_note.trim();
    if (trimmed.length > MAX_NOTE_LEN) {
      return NextResponse.json(
        { error: `decision_note must be ${MAX_NOTE_LEN} characters or fewer` },
        { status: 400 }
      );
    }
    decisionNote = trimmed || null;
  }

  // ── Caller-role read (for a precise 403 only; RLS is the true gate) ──
  const { data: meProfile } = await auth.supabase
    .from("profiles")
    .select("verifier_status, is_platform_admin")
    .eq("id", auth.userId)
    .maybeSingle();
  const isActiveVerifier =
    (meProfile as { verifier_status?: string | null } | null)?.verifier_status ===
    "active";
  const isAdmin =
    (meProfile as { is_platform_admin?: boolean | null } | null)
      ?.is_platform_admin === true;
  if (!isActiveVerifier && !isAdmin) {
    return NextResponse.json(
      { error: "Only active verifiers may record a sign-off decision." },
      { status: 403 }
    );
  }

  // ── Record the decision (RLS-gated to active verifiers/admins) ──────
  const decidedAt = new Date().toISOString();
  const { data: updated, error: updErr } = await auth.supabase
    .from("community_post_signoff_requests")
    .update({
      status: decision,
      verifier_id: auth.userId,
      decided_at: decidedAt,
      primary_doc_url: primaryDocUrl,
      decision_note: decisionNote,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select(SELECT_COLS)
    .maybeSingle();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  if (!updated) {
    // No row updated: either the request no longer exists, or it is no longer
    // pending. A verifier can read all requests (signoff_select), so a
    // follow-up read distinguishes the two for a clear message.
    const { data: existing } = await auth.supabase
      .from("community_post_signoff_requests")
      .select("id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json(
        { error: "Sign-off request not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        error: `This request has already been ${(existing as { status: string }).status.replace("_", " ")}.`,
        code: "not_pending",
      },
      { status: 409, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const row = updated as SignoffRow;

  // ── On sign-off, stamp the post so it earns the citable/verified read ──
  if (decision === "signed_off") {
    const service = getServiceClient();
    const { error: stampErr } = await service
      .from("community_posts")
      .update({ signed_off_at: decidedAt, signed_off_by: auth.userId })
      .eq("id", row.post_id);
    if (stampErr) {
      // The decision row is authoritative; surface the stamp failure so an
      // admin can reconcile the post's signed_off_at rather than silently
      // leaving the post un-stamped after a recorded sign-off.
      return NextResponse.json(
        {
          request: row,
          warning: `Decision recorded, but the post citable-stamp failed: ${stampErr.message}`,
        },
        { status: 200, headers: rateLimitHeaders(auth.userId) }
      );
    }
  }

  return NextResponse.json(
    { request: row },
    { status: 200, headers: rateLimitHeaders(auth.userId) }
  );
}
