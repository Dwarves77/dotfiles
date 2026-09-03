// GET /api/community/entities/[entityId]/threads?limit=20&before=<ISO>
//
// Entity-bound discovery (spec 05 §5 component 2: "Makes Community reachable from the other four
// surfaces and from the portfolio, rather than a walled forum"). Lists top-level community threads bound
// to a spine entity (community_thread_entities, migration 293), newest first. This is the route
// COMMUNITY-B's cross-surface "peers are discussing this" strip (detail pages) and the portfolio calls
// to find community activity tied to a corridor, jurisdiction, instrument, technology, or organisation.
//
// RLS-aware (the caller's own client) — a thread bound to the entity but living in a private group the
// caller is not a member of is correctly excluded by community_posts' own SELECT policy, joined through
// naturally rather than re-implemented here.
//
// Auth: cookie session. Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { entityKindOf } from "@/lib/entities/entity-id.mjs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { entityId } = await params;
  if (!entityId || !entityKindOf(entityId)) {
    return NextResponse.json(
      { error: "Valid entity id required (cl:<kind>:<16 hex>)" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const limitParam = searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "limit must be a positive integer" }, { status: 400 });
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  // community_thread_entities RLS (migration 293) already inherits the bound thread's own visibility, so
  // this single query, run with the caller's RLS-aware client, never returns a thread the caller could
  // not otherwise see.
  let query = auth.supabase
    .from("community_thread_entities")
    .select(
      `thread_id, entity_id, entity_kind, created_at,
       community_posts!inner ( id, group_id, title, body, author_user_id, created_at, last_reply_at, reply_count, promotion_state, origin_class )`
    )
    .eq("entity_id", entityId)
    .is("community_posts.parent_post_id", null)
    .order("created_at", { referencedTable: "community_posts", ascending: false })
    .limit(limit);

  if (before) {
    const beforeDate = new Date(before);
    if (isNaN(beforeDate.getTime())) {
      return NextResponse.json({ error: "before must be an ISO timestamp" }, { status: 400 });
    }
    query = query.lt("community_posts.created_at", beforeDate.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    thread_id: string;
    entity_id: string;
    entity_kind: string | null;
    community_posts: {
      id: string;
      group_id: string;
      title: string | null;
      body: string;
      author_user_id: string | null;
      created_at: string;
      last_reply_at: string | null;
      reply_count: number;
      promotion_state: string;
      origin_class: string;
    } | null;
  };

  const threads = ((data ?? []) as unknown as Row[])
    .filter((row) => row.community_posts !== null)
    .map((row) => ({
      id: row.community_posts!.id,
      group_id: row.community_posts!.group_id,
      title: row.community_posts!.title,
      body: row.community_posts!.body,
      author_user_id: row.community_posts!.author_user_id,
      created_at: row.community_posts!.created_at,
      last_reply_at: row.community_posts!.last_reply_at,
      reply_count: row.community_posts!.reply_count,
      promotion_state: row.community_posts!.promotion_state,
      origin_class: row.community_posts!.origin_class,
      entity_id: row.entity_id,
      entity_kind: row.entity_kind,
    }));

  const nextCursor = threads.length === limit ? threads[threads.length - 1].created_at : null;

  return NextResponse.json(
    { entity_id: entityId, threads, next_cursor: nextCursor },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
