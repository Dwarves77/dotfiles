// /api/community/posts
//
// GET  ?group_id=&limit=20&before=<ISO>  — list top-level posts in a group,
//                                          newest first, paginated by
//                                          created_at descending.
// POST { group_id, title, body, entity_ids, sensitivity_field? }
//                                         — create a top-level post. GUARD-ENFORCED
//                                          (Wave 3, COMMUNITY-A interface contract):
//                                          two refusals happen at write time, before
//                                          any row is inserted.
//
//   (a) Antitrust guard (spec 05 §1, §6 acceptance criterion 3): a caller-declared
//       `sensitivity_field` (one of src/lib/community/antitrust.mjs SENSITIVE_FIELDS)
//       is ALWAYS refused on this route — evaluateAntitrustGuard() with
//       isAggregate:false always refuses an individual point disclosure of a
//       commercially sensitive field, regardless of k-anonymity/dominance/lag,
//       because a single free-text post can never itself satisfy those (they are
//       properties of a POOL). The refusal names the aggregate-only route
//       (POST .../benchmarks, once open) the author should use instead. A post
//       with no sensitivity_field is unaffected — this is the common case.
//   (b) Entity binding (spec 05 §5 component 2, §6 acceptance criterion 6): every
//       top-level thread must bind to at least one spine entity
//       (src/lib/entities/entity-id.mjs id shape, `cl:<kind>:<16 hex>`).
//       `entity_ids` is required and validated before the post is written; on
//       success each id is linked via community_thread_entities in the SAME
//       request, as the author (RLS: community_thread_entities_insert_author,
//       migration 293).
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
import { evaluateAntitrustGuard, SENSITIVE_FIELDS } from "@/lib/community/index.mjs";
import { entityKindOf } from "@/lib/entities/entity-id.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 8000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_ENTITY_IDS = 10;

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

  let body: {
    group_id?: string;
    title?: string;
    body?: string;
    entity_ids?: unknown;
    sensitivity_field?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const groupId = body?.group_id;
  const title = (body?.title ?? "").trim();
  const postBody = (body?.body ?? "").trim();
  const sensitivityField =
    typeof body?.sensitivity_field === "string" && body.sensitivity_field.trim()
      ? body.sensitivity_field.trim()
      : null;

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
  if (
    sensitivityField !== null &&
    !SENSITIVE_FIELDS.includes(sensitivityField as (typeof SENSITIVE_FIELDS)[number])
  ) {
    return NextResponse.json(
      { error: `sensitivity_field must be one of: ${SENSITIVE_FIELDS.join(", ")}` },
      { status: 400 }
    );
  }

  // ── Entity binding (spec 05 §5 component 2, §6 acceptance criterion 6) ──────────────────
  // Every top-level thread binds to at least one spine entity. Validated BEFORE any write.
  const entityIdsRaw = Array.isArray(body?.entity_ids) ? body.entity_ids : [];
  const entityIds = entityIdsRaw.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0
  );
  if (entityIds.length === 0) {
    return NextResponse.json(
      {
        error:
          "entity_ids is required — every community thread must bind to at least one spine entity " +
          "(corridor, jurisdiction, instrument, technology, or organisation).",
      },
      { status: 400 }
    );
  }
  if (entityIds.length > MAX_ENTITY_IDS) {
    return NextResponse.json(
      { error: `entity_ids must name ${MAX_ENTITY_IDS} or fewer entities` },
      { status: 400 }
    );
  }
  const malformedEntityIds = entityIds.filter((id) => !entityKindOf(id));
  if (malformedEntityIds.length > 0) {
    return NextResponse.json(
      {
        error: `entity_ids contains malformed id(s), expected cl:<kind>:<16 hex>: ${malformedEntityIds.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // ── Antitrust write-time guard (spec 05 §1, §6 acceptance criterion 3) ──────────────────
  // A caller-declared sensitivity_field is ALWAYS refused here: an individual free-text post can
  // never itself satisfy k-anonymity (a property of a pool of >= 5 organisations), so this route
  // never allows one through — see evaluateAntitrustGuard()'s own doc comment for the full reasoning.
  const guard = evaluateAntitrustGuard({ sensitivityField, isAggregate: false });
  if (!guard.allowed) {
    return NextResponse.json(
      { error: guard.reason, aggregate_route: guard.aggregateRoute },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
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

  // Link the thread to its declared spine entities (migration 293 community_thread_entities;
  // RLS: only the post's own author may insert these, checked immediately below via the same
  // authenticated request that just created the post). Not a single DB transaction with the post
  // insert above (PostgREST has no cross-table transaction from this client) — on failure we
  // compensate by deleting the just-created post rather than leaving an unbound thread live,
  // which acceptance criterion 6 forbids.
  const { error: entityLinkErr } = await auth.supabase
    .from("community_thread_entities")
    .insert(entityIds.map((entity_id) => ({ thread_id: row.id, entity_id })));

  if (entityLinkErr) {
    await auth.supabase.from("community_posts").delete().eq("id", row.id);
    return NextResponse.json(
      {
        error: `Could not bind thread to entity_ids (post was not created): ${entityLinkErr.message}`,
      },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
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
    { post: { ...shapePost(row, profilesById), entity_ids: entityIds } },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}
