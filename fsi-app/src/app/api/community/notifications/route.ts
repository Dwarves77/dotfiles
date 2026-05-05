// GET  /api/community/notifications
// POST /api/community/notifications
//
// List the caller's in-app notifications, or perform a bulk action
// (currently mark_all_read).
//
// Schema reference (migration 032):
//   notifications(id, user_id, kind, payload, read_at, created_at)
//   kind ∈ {mention, reply, promote, invite, moderation}
//
// Auth:    cookie session via requireCommunityAuth.
// Limits:  60 req/min/user via checkRateLimit.
// RLS:     SELECT/UPDATE self-only — no service role used here. Callers
//          can never read another user's notifications even if they try.
//
// Query params (GET):
//   unread_only   — "true"|"1" (optional). When set, filters read_at IS NULL.
//   limit         — 1..100, default 20.
//   before        — ISO timestamp; returns rows with created_at < before.
//                   Used to paginate ("Load older").
//
// POST body:
//   { action: "mark_all_read" }   — sets read_at=now() on all caller's
//                                   currently-unread rows. Returns
//                                   { updated: N }.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export async function GET(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const url = new URL(request.url);
  const unreadOnlyRaw = url.searchParams.get("unread_only");
  const unreadOnly =
    unreadOnlyRaw === "true" || unreadOnlyRaw === "1";

  const limitRaw = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitRaw) {
    const n = parseInt(limitRaw, 10);
    if (Number.isFinite(n) && n > 0) {
      limit = Math.min(n, MAX_LIMIT);
    }
  }

  const before = url.searchParams.get("before"); // ISO string cursor

  // RLS-aware client. Caller can only see their own notifications by
  // policy (notifications_select_self), so we don't need an explicit
  // .eq('user_id', ...) filter, but adding it is harmless and makes
  // the query plan obvious.
  let query = auth.supabase
    .from("notifications")
    .select("id, kind, payload, read_at, created_at", { count: "exact" })
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }
  if (before) {
    // Validate ISO so a malformed cursor doesn't bypass to all rows.
    if (Number.isNaN(Date.parse(before))) {
      return NextResponse.json(
        { error: "before must be an ISO timestamp" },
        { status: 400 }
      );
    }
    query = query.lt("created_at", before);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Always-current unread total (independent of pagination cursor) so
  // the bell badge is correct even when the dropdown is paged.
  const { count: unreadCount, error: unreadErr } = await auth.supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId)
    .is("read_at", null);
  if (unreadErr) {
    return NextResponse.json({ error: unreadErr.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      notifications: data ?? [],
      total_matching: count ?? 0,
      unread_count: unreadCount ?? 0,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (body.action !== "mark_all_read") {
    return NextResponse.json(
      { error: "action must be 'mark_all_read'" },
      { status: 400 }
    );
  }

  // RLS-aware update: with `user_id = auth.uid()` enforced by the
  // notifications_update_self_read policy, no row from any other user
  // can be touched even if our WHERE clause were wrong.
  const { data, error } = await auth.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", auth.userId)
    .is("read_at", null)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, updated: data?.length ?? 0 },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
