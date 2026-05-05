// /api/community/moderation/reports
//
// GET  — list moderation reports (group admin/mod sees their group's posts'
//        reports; platform admin sees all). RLS on moderation_reports
//        enforces this; we additionally honour the optional ?group_id and
//        ?status filters.
// POST — file a new report. Any authenticated group member can report a
//        post in a group they belong to.
//
// Schema reality (migration 032) — the table uses target_kind / target_id
// (not target_post_id) and resolved_at / resolved_by_user_id (not
// reviewed_at / reviewed_by). There is no action_taken column and the
// reason column is open text (no enum check). We standardise the reason
// vocabulary at the application layer:
//   spam | harassment | misinformation | off-topic | self-harm | other
//
// Auth: cookie session (RLS-aware client).
// Rate limit: 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_REASONS = new Set([
  "spam",
  "harassment",
  "misinformation",
  "off-topic",
  "self-harm",
  "other",
]);

const ALLOWED_STATUS = new Set(["open", "resolved", "dismissed"]);

// Encoded reason envelope — stuffs the freeform body into the reason
// column because the migration shipped without a body column. Format:
//   <reason-key>|<optional body text>
// On read we split the column into its two parts.
function encodeReason(reason: string, body?: string | null): string {
  return body && body.trim() ? `${reason}|${body.trim().slice(0, 2000)}` : reason;
}

function decodeReason(stored: string | null): {
  reason: string;
  body: string | null;
} {
  if (!stored) return { reason: "other", body: null };
  const idx = stored.indexOf("|");
  if (idx < 0) return { reason: stored, body: null };
  return {
    reason: stored.slice(0, idx),
    body: stored.slice(idx + 1),
  };
}

// ───────────────────────────────────────────────────────────────────
// GET — list reports
// ───────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const groupId = url.searchParams.get("group_id");
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.max(
    1,
    Math.min(100, limitRaw ? parseInt(limitRaw, 10) || 20 : 20)
  );

  if (status && !ALLOWED_STATUS.has(status)) {
    return NextResponse.json(
      { error: `status must be one of ${[...ALLOWED_STATUS].join(", ")}` },
      { status: 400 }
    );
  }
  if (groupId && !UUID_RE.test(groupId)) {
    return NextResponse.json(
      { error: "group_id must be a uuid" },
      { status: 400 }
    );
  }

  // Initial page — RLS gates visibility. We pull reports with the target
  // post embedded so the queue can render an excerpt without a follow-up
  // round trip. (target_id is a soft FK so we cannot join via FK syntax;
  // we hydrate posts in a second query below.)
  let q = auth.supabase
    .from("moderation_reports")
    .select(
      "id, target_kind, target_id, reporter_user_id, reason, status, " +
        "created_at, resolved_at, resolved_by_user_id"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);

  type ReportRow = {
    id: string;
    target_kind: string;
    target_id: string;
    reporter_user_id: string | null;
    reason: string | null;
    status: string;
    created_at: string;
    resolved_at: string | null;
    resolved_by_user_id: string | null;
  };
  const { data: rawReports, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const reports = (rawReports ?? []) as unknown as ReportRow[];

  // Hydrate post bodies for target_kind=post (the dominant case in C8).
  const postIds = reports
    .filter((r) => r.target_kind === "post")
    .map((r) => r.target_id);

  // group_id filter applies via posts.group_id — we filter in JS after
  // hydration to keep the RLS logic simple.
  let postsById = new Map<
    string,
    {
      id: string;
      group_id: string;
      author_user_id: string | null;
      title: string | null;
      body: string;
      created_at: string;
    }
  >();
  if (postIds.length > 0) {
    type PostRow = {
      id: string;
      group_id: string;
      author_user_id: string | null;
      title: string | null;
      body: string;
      created_at: string;
    };
    const { data: rawPosts, error: pErr } = await auth.supabase
      .from("community_posts")
      .select("id, group_id, author_user_id, title, body, created_at")
      .in("id", postIds);
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
    const posts = (rawPosts ?? []) as unknown as PostRow[];
    postsById = new Map(posts.map((p) => [p.id, p]));
  }

  const decorated = reports
    .map((r) => {
      const post =
        r.target_kind === "post" ? postsById.get(r.target_id) ?? null : null;
      const { reason, body } = decodeReason(r.reason);
      return {
        id: r.id,
        target_kind: r.target_kind,
        target_id: r.target_id,
        reporter_user_id: r.reporter_user_id,
        reason,
        body,
        status: r.status,
        created_at: r.created_at,
        resolved_at: r.resolved_at,
        resolved_by_user_id: r.resolved_by_user_id,
        post: post
          ? {
              id: post.id,
              group_id: post.group_id,
              author_user_id: post.author_user_id,
              title: post.title,
              excerpt: (post.body || "").slice(0, 280),
              created_at: post.created_at,
            }
          : null,
      };
    })
    .filter((r) => {
      // Optional group_id narrow — only meaningful for post reports.
      if (!groupId) return true;
      if (r.target_kind === "post") return r.post?.group_id === groupId;
      if (r.target_kind === "group") return r.target_id === groupId;
      return false;
    });

  return NextResponse.json(
    { reports: decorated, count: decorated.length },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// ───────────────────────────────────────────────────────────────────
// POST — file a new report
// ───────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let payload: { post_id?: string; reason?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const postId = payload.post_id;
  const reason = (payload.reason || "").trim().toLowerCase();
  const body = (payload.body || "").trim() || null;

  if (!postId || !UUID_RE.test(postId)) {
    return NextResponse.json(
      { error: "post_id (uuid) is required" },
      { status: 400 }
    );
  }
  if (!ALLOWED_REASONS.has(reason)) {
    return NextResponse.json(
      {
        error: `reason must be one of ${[...ALLOWED_REASONS].join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (body && body.length > 2000) {
    return NextResponse.json(
      { error: "body must be ≤ 2000 chars" },
      { status: 400 }
    );
  }

  // Existence check — gives a clean 404 instead of an opaque RLS-failed
  // insert when the post is gone. RLS on community_posts SELECT also
  // gates visibility so a non-member reporting a private post sees 404.
  const { data: post, error: postErr } = await auth.supabase
    .from("community_posts")
    .select("id, group_id")
    .eq("id", postId)
    .maybeSingle();
  if (postErr) {
    return NextResponse.json({ error: postErr.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Verify the reporter is a member of the post's group. Spec: "any
  // group member" can report. (RLS on community_group_members SELECT
  // restricts the row read to self / admins, but a self-row read is
  // allowed, which is exactly what we need here.)
  const { data: membership } = await auth.supabase
    .from("community_group_members")
    .select("user_id")
    .eq("group_id", post.group_id)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "Only members of this group can file reports" },
      { status: 403 }
    );
  }

  const { data: inserted, error: insErr } = await auth.supabase
    .from("moderation_reports")
    .insert({
      target_kind: "post",
      target_id: postId,
      reporter_user_id: auth.userId,
      reason: encodeReason(reason, body),
      status: "open",
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, report_id: inserted?.id ?? null },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
