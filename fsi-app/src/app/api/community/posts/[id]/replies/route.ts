// /api/community/posts/[id]/replies
//
// GET  ?limit=10&before=<ISO>  — list replies to this post, oldest-first.
// POST { body }                — create a reply (child post with
//                                parent_post_id = [id]).
//
// Replies are stored in the same community_posts table; a reply has
// parent_post_id != null AND title IS NULL (CHECK constraint
// community_posts_title_shape). The reply_count + last_reply_at on the
// parent are maintained by the trigger added in migration 030.
//
// Auth: cookie session.
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BODY_LEN = 4000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

interface PostRow {
  id: string;
  group_id: string;
  parent_post_id: string | null;
  author_user_id: string | null;
  title: string | null;
  body: string;
  created_at: string;
  last_reply_at: string | null;
  reply_count: number;
  attribution: string | null;
  promoted_from_post_id: string | null;
}

interface AuthorProfile {
  user_id: string;
  name: string | null;
  headshot_url: string | null;
}

function shapePost(row: PostRow, profilesById: Map<string, AuthorProfile>) {
  const profile = row.author_user_id
    ? profilesById.get(row.author_user_id) ?? null
    : null;
  return {
    id: row.id,
    group_id: row.group_id,
    parent_post_id: row.parent_post_id,
    author_user_id: row.author_user_id,
    author: profile
      ? {
          user_id: profile.user_id,
          name: profile.name ?? null,
          headshot_url: profile.headshot_url ?? null,
        }
      : null,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    last_reply_at: row.last_reply_at,
    reply_count: row.reply_count ?? 0,
    attribution: row.attribution,
    promoted_from_post_id: row.promoted_from_post_id,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id: parentId } = await params;
  if (!parentId || !UUID_RE.test(parentId)) {
    return NextResponse.json({ error: "Valid post id required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const limitParam = searchParams.get("limit");

  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: "limit must be a positive integer" },
        { status: 400 }
      );
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  let query = auth.supabase
    .from("community_posts")
    .select(
      `id, group_id, parent_post_id, author_user_id, title, body,
       created_at, last_reply_at, reply_count, attribution,
       promoted_from_post_id`
    )
    .eq("parent_post_id", parentId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (before) {
    const beforeDate = new Date(before);
    if (isNaN(beforeDate.getTime())) {
      return NextResponse.json(
        { error: "before must be an ISO timestamp" },
        { status: 400 }
      );
    }
    query = query.gt("created_at", beforeDate.toISOString());
  }

  const { data: replies, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (replies ?? []) as PostRow[];

  const authorIds = Array.from(
    new Set(rows.map((r) => r.author_user_id).filter((id): id is string => !!id))
  );

  const profilesById = new Map<string, AuthorProfile>();
  if (authorIds.length > 0) {
    // Migrated 2026-05-15 (075 Phase 2): user_profiles -> profiles. Aliases keep AuthorProfile shape.
    const { data: profiles } = await auth.supabase
      .from("profiles")
      .select("user_id:id, name:full_name, headshot_url:avatar_url")
      .in("id", authorIds);
    for (const p of (profiles ?? []) as AuthorProfile[]) {
      profilesById.set(p.user_id, p);
    }
  }

  const shaped = rows.map((r) => shapePost(r, profilesById));
  const nextCursor =
    shaped.length === limit ? shaped[shaped.length - 1].created_at : null;

  return NextResponse.json(
    { replies: shaped, next_cursor: nextCursor },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id: parentId } = await params;
  if (!parentId || !UUID_RE.test(parentId)) {
    return NextResponse.json({ error: "Valid post id required" }, { status: 400 });
  }

  let body: { body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const replyBody = (body?.body ?? "").trim();
  if (!replyBody) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (replyBody.length > MAX_BODY_LEN) {
    return NextResponse.json(
      { error: `body must be ${MAX_BODY_LEN} characters or fewer` },
      { status: 400 }
    );
  }

  const { data: parent, error: parentErr } = await auth.supabase
    .from("community_posts")
    .select("id, group_id, parent_post_id")
    .eq("id", parentId)
    .maybeSingle();

  if (parentErr) {
    return NextResponse.json({ error: parentErr.message }, { status: 500 });
  }
  if (!parent) {
    return NextResponse.json({ error: "Parent post not found" }, { status: 404 });
  }
  if (parent.parent_post_id !== null) {
    return NextResponse.json(
      { error: "Cannot reply to a reply (only one level of nesting supported)" },
      { status: 400 }
    );
  }

  const { data: inserted, error: insErr } = await auth.supabase
    .from("community_posts")
    .insert({
      group_id: parent.group_id,
      parent_post_id: parentId,
      author_user_id: auth.userId,
      title: null,
      body: replyBody,
    })
    .select(
      `id, group_id, parent_post_id, author_user_id, title, body,
       created_at, last_reply_at, reply_count, attribution,
       promoted_from_post_id`
    )
    .maybeSingle();

  if (insErr) {
    if (insErr.code === "42501" || insErr.code === "PGRST301") {
      return NextResponse.json(
        { error: "Only group members may reply" },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  if (!inserted) {
    return NextResponse.json(
      { error: "Reply insert rejected by RLS" },
      { status: 403 }
    );
  }

  const row = inserted as PostRow;
  const profilesById = new Map<string, AuthorProfile>();
  if (row.author_user_id) {
    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("user_id:id, name:full_name, headshot_url:avatar_url")
      .eq("id", row.author_user_id)
      .maybeSingle();
    if (profile) profilesById.set((profile as AuthorProfile).user_id, profile as AuthorProfile);
  }

  return NextResponse.json(
    { reply: shapePost(row, profilesById) },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}
