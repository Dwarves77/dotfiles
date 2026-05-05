// /api/community/posts/[id]
//
// GET     — fetch a single post (top-level or reply) with author profile.
// PATCH   — edit body (and title, if top-level) by author.
// DELETE  — hard-delete by author OR group admin/moderator.
//
// Soft-delete is NOT supported in the current schema (migration 030 has
// no deleted_at column). DELETE here is a hard delete; reply rows
// CASCADE via the parent_post_id FK. See docs/C5-feed-spec.md for the
// rationale and the deferred soft-delete proposal.
//
// Auth: cookie session.
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 8000;

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

function shapePost(row: PostRow, profile: AuthorProfile | null) {
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

async function loadPost(supabase: SupabaseClient, postId: string) {
  const { data, error } = await supabase
    .from("community_posts")
    .select(
      `id, group_id, parent_post_id, author_user_id, title, body,
       created_at, last_reply_at, reply_count, attribution,
       promoted_from_post_id`
    )
    .eq("id", postId)
    .maybeSingle();
  return { data: data as PostRow | null, error };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Valid post id required" }, { status: 400 });
  }

  const { data: row, error } = await loadPost(auth.supabase, id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  let profile: AuthorProfile | null = null;
  if (row.author_user_id) {
    const { data: p } = await auth.supabase
      .from("user_profiles")
      .select("user_id, name, headshot_url")
      .eq("user_id", row.author_user_id)
      .maybeSingle();
    profile = (p as AuthorProfile) ?? null;
  }

  return NextResponse.json(
    { post: shapePost(row, profile) },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Valid post id required" }, { status: 400 });
  }

  let body: { title?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: existing, error: readErr } = await loadPost(auth.supabase, id);
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (existing.author_user_id !== auth.userId) {
    return NextResponse.json(
      { error: "Only the author can edit this post" },
      { status: 403 }
    );
  }

  const update: { title?: string; body?: string } = {};

  if (typeof body.body === "string") {
    const next = body.body.trim();
    if (!next) {
      return NextResponse.json({ error: "body cannot be empty" }, { status: 400 });
    }
    if (next.length > MAX_BODY_LEN) {
      return NextResponse.json(
        { error: `body must be ${MAX_BODY_LEN} characters or fewer` },
        { status: 400 }
      );
    }
    update.body = next;
  }

  if (typeof body.title === "string") {
    if (existing.parent_post_id !== null) {
      return NextResponse.json(
        { error: "Replies cannot have a title" },
        { status: 400 }
      );
    }
    const next = body.title.trim();
    if (!next) {
      return NextResponse.json(
        { error: "title cannot be empty for top-level posts" },
        { status: 400 }
      );
    }
    if (next.length > MAX_TITLE_LEN) {
      return NextResponse.json(
        { error: `title must be ${MAX_TITLE_LEN} characters or fewer` },
        { status: 400 }
      );
    }
    update.title = next;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Provide title and/or body to update" },
      { status: 400 }
    );
  }

  const { data: updated, error: updErr } = await auth.supabase
    .from("community_posts")
    .update(update)
    .eq("id", id)
    .select(
      `id, group_id, parent_post_id, author_user_id, title, body,
       created_at, last_reply_at, reply_count, attribution,
       promoted_from_post_id`
    )
    .maybeSingle();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "Update rejected by RLS" },
      { status: 403 }
    );
  }

  const row = updated as PostRow;
  let profile: AuthorProfile | null = null;
  if (row.author_user_id) {
    const { data: p } = await auth.supabase
      .from("user_profiles")
      .select("user_id, name, headshot_url")
      .eq("user_id", row.author_user_id)
      .maybeSingle();
    profile = (p as AuthorProfile) ?? null;
  }

  return NextResponse.json(
    { post: shapePost(row, profile) },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Valid post id required" }, { status: 400 });
  }

  const { data: deleted, error: delErr } = await auth.supabase
    .from("community_posts")
    .delete()
    .eq("id", id)
    .select("id");

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (!deleted || deleted.length === 0) {
    return NextResponse.json(
      { error: "Post not found or you lack permission to delete it" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { ok: true, deleted: deleted.length },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
