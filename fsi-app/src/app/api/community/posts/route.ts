import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import {
  evaluateAntitrustGuard,
  SENSITIVE_FIELDS,
  buildAuthorIdentityForRender,
  resolveEffectiveAnonymous,
  validateEntityIds,
} from "@/lib/community/index.mjs";
import { assertBound } from "@/lib/db/paginate.mjs";
import {
  authorBlockForPost,
  authorIdForRow,
  effectiveAnonymous,
  loadCommunityIdentities,
  type CommunityIdentityRow,
} from "@/lib/community/identity.mjs";
import { communityViewer, type CommunityViewer } from "@/lib/community/viewer";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 8000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
// entity_ids max count lives in src/lib/community/entity-binding.mjs (MAX_ENTITY_IDS), the shared
// validator this route calls below, not duplicated here.

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
  /** R8.7 (migration 336): resolved at write time (POST below) from either the caller's explicit
   * `anonymous` or their community_member_profiles.default_anonymous, always a definite boolean by
   * the time a row is read here, never re-derived on read. */
  anonymous: boolean;
}

/** R8.7 (migration 336): the caller's community_member_profiles projection, keyed by user_id, used to
 * build the author_identity block (org type/role/sector/region/verified). */
interface MemberIdentityRow {
  user_id: string;
  org_type: string | null;
  role: string | null;
  sector: string | null;
  region: string | null;
  verified: boolean | null;
}

// DFIX-1 (2026-10-08, SEC-5 residual): an anonymous author id reaches only that author and a platform admin.
// `viewer` is who is reading; the id (author_user_id, author.user_id) is withheld from everyone else here, in
// the read path (identity.mjs authorIdForViewer).
function shapePost(
  row: PostRow,
  identitiesById: Map<string, CommunityIdentityRow>,
  memberProfilesById: Map<string, MemberIdentityRow>,
  viewer: CommunityViewer
) {
  const identity = row.author_user_id
    ? identitiesById.get(row.author_user_id) ?? null
    : null;
  const memberProfile = row.author_user_id
    ? memberProfilesById.get(row.author_user_id) ?? null
    : null;
  // The per-USER half of R8.7 came back from the RPC; the per-POST half is applied here, once, at the row
  // (community_posts.anonymous), by authorBlockForPost and the effective flag below.
  const author = authorBlockForPost({
    authorUserId: row.author_user_id,
    identity,
    postAnonymous: row.anonymous,
    viewer,
  });
  const anonymous = effectiveAnonymous({ postAnonymous: row.anonymous, identity });

  return {
    id: row.id,
    group_id: row.group_id,
    parent_post_id: row.parent_post_id,
    author_user_id: authorIdForRow({ authorUserId: row.author_user_id, postAnonymous: row.anonymous, identity, viewer }),
    author,
    // R8.7 (spec 07 Community, 2026-09-25, migration 336): shown by default. Post.tsx renders this
    // INSTEAD OF the legacy `author` block above whenever it is present (see Post.tsx's own header).
    author_identity: buildAuthorIdentityForRender({
      memberProfile: memberProfile
        ? { ...memberProfile, role: memberProfile.role ?? identity?.job_title ?? null, region: memberProfile.region ?? identity?.region ?? null }
        : identity
          ? { role: identity.job_title, region: identity.region, verified: identity.verified }
          : null,
      name: identity?.display_name ?? null,
      company: identity?.company_name ?? null,
      postAnonymous: anonymous,
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

/** Fetches the community_member_profiles rows (org type, role, sector, region, verified) and the
 * community_identity rows (name, company, job title, headshot, the per-user anonymity flag) for a bounded set of
 * author ids, shared by GET and POST so both build the exact same author_identity shape the same way. Never
 * throws: a lookup failure degrades to empty maps (the identity projection then falls back to whatever it has,
 * same fail-soft posture the rest of this route already uses). SEC-5 (migration 372): the company used to come from
 * an org_memberships join that row security limited to the caller's own organisation; community_identity returns it
 * for any organisation, as R8.7 intends, and applies default_anonymous in SQL. */
async function loadAuthorIdentityInputs(
  supabase: SupabaseClient,
  authorIds: string[]
): Promise<{
  memberProfilesById: Map<string, MemberIdentityRow>;
  identitiesById: Map<string, CommunityIdentityRow>;
}> {
  const memberProfilesById = new Map<string, MemberIdentityRow>();
  if (authorIds.length === 0) {
    return { memberProfilesById, identitiesById: new Map() };
  }

  const { data: memberProfiles } = await supabase
    .from("community_member_profiles")
    .select("user_id, org_type, role, sector, region, verified")
    // fitness-allow: F39 (authorIds bounded by assertBound at the call site, MAX_LIMIT clamp)
    .in("user_id", authorIds);
  for (const p of (memberProfiles ?? []) as MemberIdentityRow[]) {
    memberProfilesById.set(p.user_id, p);
  }

  const { byId, error } = await loadCommunityIdentities(supabase, authorIds);
  if (error) console.warn("community posts route: identity lookup failed", error);

  return { memberProfilesById, identitiesById: byId };
}

export async function GET(request: NextRequest) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

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
       promoted_from_post_id, anonymous`
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
  // authorIds is bounded by rows, which is bounded by MAX_LIMIT above (rows.length <= MAX_LIMIT, so
  // distinct authorIds.length <= MAX_LIMIT too) — asserted, not assumed, so a future edit to the rows
  // query can never silently widen this into an unbounded .in() (IN-CHUNK class, 2026-09-06).
  assertBound(authorIds.length, MAX_LIMIT + 1, "community posts route: authorIds");

  const { memberProfilesById, identitiesById } = await loadAuthorIdentityInputs(auth.supabase, authorIds);

  const viewer = await communityViewer(auth, rows, identitiesById);
  const shaped = rows.map((r) => shapePost(r, identitiesById, memberProfilesById, viewer));
  const nextCursor =
    shaped.length === limit ? shaped[shaped.length - 1].created_at : null;

  return NextResponse.json(
    { posts: shaped, next_cursor: nextCursor },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  let body: {
    group_id?: string;
    title?: string;
    body?: string;
    entity_ids?: unknown;
    sensitivity_field?: string | null;
    anonymous?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const groupId = body?.group_id;
  const title = (body?.title ?? "").trim();
  const postBody = (body?.body ?? "").trim();
  if (body?.anonymous !== undefined && typeof body.anonymous !== "boolean") {
    return NextResponse.json({ error: "anonymous must be a boolean" }, { status: 400 });
  }
  const explicitAnonymous = typeof body?.anonymous === "boolean" ? body.anonymous : undefined;
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
  // Every top-level thread binds to at least one spine entity. Validated BEFORE any write, through
  // the SAME validator the client runs (validateEntityIds, src/lib/community/entity-binding.mjs) ,
  // see that module's own header: this used to be duplicated (and had drifted) between here and
  // identity-format.ts's client-side check.
  const entityCheck = validateEntityIds(Array.isArray(body?.entity_ids) ? body.entity_ids : []);
  if (!entityCheck.ok) {
    return NextResponse.json({ error: entityCheck.error }, { status: 400 });
  }
  const entityIds = entityCheck.entityIds;

  // ── Antitrust write-time guard (spec 05 §1, §6 acceptance criterion 3) ──────────────────
  // A caller-declared sensitivity_field is ALWAYS refused here: an individual free-text post can
  // never itself satisfy k-anonymity (a property of a pool of >= 5 organisations), so this route
  // never allows one through — see evaluateAntitrustGuard()'s own doc comment for the full reasoning.
  const guard = evaluateAntitrustGuard({ sensitivityField, isAggregate: false });
  if (!guard.allowed) {
    return NextResponse.json(
      { error: guard.reason },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // ── Identity-by-default anonymity (R8.7, migration 336) ─────────────────────────────────
  // Resolved once, at write time: the caller's explicit `anonymous` wins; otherwise their own
  // community_member_profiles.default_anonymous applies (resolveEffectiveAnonymous, shared with the
  // read path so both apply the exact same fallback rule). The RESOLVED value is what gets stored ,
  // a post's anonymity is fixed at creation, it does not silently change later if the author edits
  // their account-wide default afterward.
  let effectiveAnonymous = explicitAnonymous ?? false;
  if (explicitAnonymous === undefined) {
    const { data: ownProfile } = await auth.supabase
      .from("community_member_profiles")
      .select("default_anonymous")
      .eq("user_id", auth.userId)
      .maybeSingle();
    effectiveAnonymous = resolveEffectiveAnonymous({
      postAnonymous: undefined,
      profileDefaultAnonymous: (ownProfile as { default_anonymous?: boolean } | null)?.default_anonymous,
    });
  }

  const { data: inserted, error: insErr } = await auth.supabase
    .from("community_posts")
    .insert({
      group_id: groupId,
      author_user_id: auth.userId,
      title,
      body: postBody,
      anonymous: effectiveAnonymous,
    })
    .select(
      `id, group_id, parent_post_id, author_user_id, title, body,
       created_at, last_reply_at, reply_count, attribution,
       promoted_from_post_id, anonymous`
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
  const { memberProfilesById, identitiesById } = await loadAuthorIdentityInputs(
    auth.supabase,
    row.author_user_id ? [row.author_user_id] : []
  );

  return NextResponse.json(
    {
      post: {
        // the author just created this post: they see their own id
        ...shapePost(row, identitiesById, memberProfilesById, { userId: auth.userId }),
        entity_ids: entityIds,
      },
    },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}
