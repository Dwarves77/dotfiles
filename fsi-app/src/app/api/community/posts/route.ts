// /api/community/posts
//
// GET  ?group_id=&limit=20&before=<ISO>  — list top-level posts in a group,
//                                          newest first, paginated by
//                                          created_at descending.
// POST { group_id, title, body }         — create a top-level post.
//
// Auth: cookie session (community-auth helper).
// Rate limit: standard 60/min/user.
//
// RLS contract (migration 030):
//   * SELECT inherits group visibility (public OR caller is a member).
//   * INSERT requires caller to be a member of the group AND
//     author_user_id = auth.uid().
//   * Top-level posts MUST carry a title; replies MUST NOT (CHECK
//     constraint community_posts_title_shape).
//
// We rely on RLS to enforce membership and never use a service-role
// escape — the cookie-bound supabase client is the auth boundary.
//
// The response shape includes a denormalized `author` block joined from
// user_profiles (name + headshot_url) so the feed UI can render headshot
// and display name without a second round-trip.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 8000;
const DEFAULT_LIMIT = 20;
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

export async function GET(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("group_id");
  const before = searchParams.get("before");
  const limitParam = searchParams.get("limit");

  if (!groupId || !UUID_RE.test(groupId)) {
    return NextResponse.json(
      { error: "Valid group_id is required" },
      { status: 400 }
    );
  }

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
    .eq("group_id", groupId)
    .is("parent_post_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    const beforeDate = new Date(before);
    if (isNaN(beforeDate.getTime())) {
      return NextResponse.json(
        { error: "before must be an ISO timestamp" },
        { status: 400 }
      );
    }
    query = query.lt("created_at", beforeDate.toISOString());
  }

  const { data: posts, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (posts ?? []) as PostRow[];

  const authorIds = Array.from(
    new Set(rows.map((r) => r.author_user_id).filter((id): id is string => !!id))
  );

  const profilesById = new Map<string, AuthorProfile>();
  if (authorIds.length > 0) {
    // Migrated 2026-05-15 (075 Phase 2): user_profiles -> profiles.
    // PostgREST aliases keep the AuthorProfile shape (user_id/name/headshot_url)
    // stable for the API response without renaming the interface.
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
    { posts: shaped, next_cursor: nextCursor },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: { group_id?: string; title?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const groupId = body?.group_id;
  const title = (body?.title ?? "").trim();
  const postBody = (body?.body ?? "").trim();

  if (!groupId || !UUID_RE.test(groupId)) {
    return NextResponse.json(
      { error: "Valid group_id is required" },
      { status: 400 }
    );
  }
  if (!title) {
    return NextResponse.json(
      { error: "title is required for top-level posts" },
      { status: 400 }
    );
  }
  if (title.length > MAX_TITLE_LEN) {
    return NextResponse.json(
      { error: `title must be ${MAX_TITLE_LEN} characters or fewer` },
      { status: 400 }
    );
  }
  if (!postBody) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (postBody.length > MAX_BODY_LEN) {
    return NextResponse.json(
      { error: `body must be ${MAX_BODY_LEN} characters or fewer` },
      { status: 400 }
    );
  }

  const { data: inserted, error: insErr } = await auth.supabase
    .from("community_posts")
    .insert({
      group_id: groupId,
      author_user_id: auth.userId,
      title,
      body: postBody,
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
        { error: "Only group members may post" },
        { status: 403 }
      );
    }
    if (insErr.code === "23503") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  if (!inserted) {
    return NextResponse.json(
      { error: "Post insert returned no row (RLS may have rejected the write)" },
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
    if (profile) profilesById.set(profile.user_id, profile as AuthorProfile);
  }

  return NextResponse.json(
    { post: shapePost(row, profilesById) },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}
