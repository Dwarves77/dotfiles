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
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { authorBlockForPost, loadCommunityIdentities, type CommunityIdentityRow } from "@/lib/community/identity.mjs";

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
  /** R8.7 (migration 336): the per-post anonymity flag, applied below at the row. */
  anonymous: boolean;
}

async function loadAuthorIdentity(
  supabase: SupabaseClient,
  authorUserId: string | null
): Promise<CommunityIdentityRow | null> {
  if (!authorUserId) return null;
  const { byId, error } = await loadCommunityIdentities(supabase, [authorUserId]);
  if (error) console.warn("community post route: identity lookup failed", error);
  return byId.get(authorUserId) ?? null;
}

function shapePost(row: PostRow, identity: CommunityIdentityRow | null) {
  return {
    id: row.id,
    group_id: row.group_id,
    parent_post_id: row.parent_post_id,
    author_user_id: row.author_user_id,
    // Per-post anonymity (community_posts.anonymous) nulls name and headshot here; the per-user default came
    // back from the RPC already applied. One rule in each place (identity.mjs authorBlockForPost).
    author: authorBlockForPost({
      authorUserId: row.author_user_id,
      identity,
      postAnonymous: row.anonymous,
    }),
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
       promoted_from_post_id, anonymous`
    )
    .eq("id", postId)
    .maybeSingle();
  return { data: data as PostRow | null, error };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

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

  const identity = await loadAuthorIdentity(auth.supabase, row.author_user_id);

  return NextResponse.json(
    { post: shapePost(row, identity) },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

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
       promoted_from_post_id, anonymous`
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
  const identity = await loadAuthorIdentity(auth.supabase, row.author_user_id);

  return NextResponse.json(
    { post: shapePost(row, identity) },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

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
