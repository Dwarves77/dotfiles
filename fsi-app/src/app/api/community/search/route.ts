// GET /api/community/search?q=<text>&scope=all|posts|groups|people
//
// Cross-surface search for the /community masthead search bar.
//
// Implementation note: this route uses ILIKE matching rather than a
// Postgres tsvector / GIN index. Build 10 chose ILIKE over an FTS
// migration to avoid taking inventory ownership of a new migration
// while Builds 7 and 9 are in flight; the case-insensitive substring
// match is good enough for the masthead's "did you mean…" pattern at
// platform scale today (per-call cap of 24 rows total). A future build
// can swap the implementation to to_tsvector + websearch_to_tsquery
// behind the same route signature without UI change.
//
// Auth:    cookie session via requireCommunityAuth. Search is logged-in
//          only; anonymous callers see 401.
// Limits:  60 req/min/user via checkRateLimit.
// RLS:     SELECTs against community_posts and community_groups inherit
//          the caller's RLS, so private-group posts a stranger cannot
//          read are correctly omitted.
//
// Response shape:
//   {
//     posts:  Array<{ id, title, body_excerpt, group_id, group_name,
//                     group_slug, created_at }>,
//     groups: Array<{ id, name, slug, region, privacy, member_count }>,
//     people: Array<{ user_id, name, headshot_url }>
//   }

import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { unionByRecency } from "@/lib/community/search-merge";
import { loadCommunityIdentities, type CommunityIdentityRow } from "@/lib/community/identity.mjs";

const SCOPES = new Set(["all", "posts", "groups", "people"]);
const MIN_QUERY = 2;
const MAX_RESULTS_PER_SCOPE = 8;

interface PostRow {
  id: string;
  title: string | null;
  body: string;
  group_id: string;
  created_at: string;
}

interface GroupRow {
  id: string;
  name: string;
  slug: string;
  region: string;
  privacy: "public" | "private";
  member_count: number;
}


export async function GET(request: NextRequest) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const scopeRaw = (url.searchParams.get("scope") ?? "all").toLowerCase();
  const scope = SCOPES.has(scopeRaw) ? scopeRaw : "all";

  if (q.length < MIN_QUERY) {
    return NextResponse.json(
      { posts: [], groups: [], people: [] },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }
  const escaped = `%${escapeLike(q)}%`;

  // Fan out queries in parallel. Each is RLS-scoped automatically.
  // For "all" we run all three; for narrower scopes we skip the unused
  // queries (Promise.resolve placeholder keeps the array index stable).
  const wantPosts = scope === "all" || scope === "posts";
  const wantGroups = scope === "all" || scope === "groups";
  const wantPeople = scope === "all" || scope === "people";

  // One .ilike() per column, unioned in JS (lane R21, CF-SEC-15): a composed OR filter string lets `,` `(` `)`
  // in the query text change the filter structure. Each pattern below is a single parameter.
  const postsQuery = (column: "title" | "body") =>
    auth.supabase
      .from("community_posts")
      .select("id, title, body, group_id, created_at")
      .is("parent_post_id", null)
      .ilike(column, escaped)
      .order("created_at", { ascending: false })
      .limit(MAX_RESULTS_PER_SCOPE);
  const groupsQuery = (column: "name" | "description") =>
    auth.supabase
      .from("community_groups")
      .select("id, name, slug, region, privacy, member_count, description, last_active_at")
      .ilike(column, escaped)
      .order("last_active_at", { ascending: false })
      .limit(MAX_RESULTS_PER_SCOPE);
  const none = { data: [], error: null };
  const noPeople = { byId: new Map<string, CommunityIdentityRow>(), rows: [] as CommunityIdentityRow[], error: null as string | null };

  const [postsByTitle, postsByBody, groupsByName, groupsByDescription, peopleRes] = await Promise.all([
    wantPosts ? postsQuery("title") : Promise.resolve(none),
    wantPosts ? postsQuery("body") : Promise.resolve(none),
    wantGroups ? groupsQuery("name") : Promise.resolve(none),
    wantGroups ? groupsQuery("description") : Promise.resolve(none),
    // SEC-5 (migration 372): people search goes through community_identity (a query matches the start of any token of the name, anonymous members are
    // not findable by name, no email or admin flag ever returned) because profiles is no longer readable across
    // organisations.
    wantPeople ? loadCommunityIdentities(auth.supabase, null, q) : Promise.resolve(noPeople),
  ]);
  const postsRes = {
    data: unionByRecency([(postsByTitle.data ?? []) as PostRow[], (postsByBody.data ?? []) as PostRow[]], "created_at", MAX_RESULTS_PER_SCOPE),
    error: postsByTitle.error ?? postsByBody.error,
  };
  const groupsRes = {
    data: unionByRecency(
      [(groupsByName.data ?? []) as Array<GroupRow & { last_active_at: string | null }>, (groupsByDescription.data ?? []) as Array<GroupRow & { last_active_at: string | null }>],
      "last_active_at",
      MAX_RESULTS_PER_SCOPE
    ),
    error: groupsByName.error ?? groupsByDescription.error,
  };

  // Collect errors. Surface the first one; partial results are not
  // helpful when a query failed because the user would have no way
  // to tell which scope is incomplete.
  const firstErr = postsRes.error ?? groupsRes.error;
  if (firstErr) {
    return NextResponse.json({ error: firstErr.message }, { status: 500 });
  }
  if (peopleRes.error) {
    return NextResponse.json({ error: peopleRes.error }, { status: 500 });
  }

  // Resolve group names for the matched posts so the dropdown can
  // surface "[Group] / Post title". One additional query keyed off
  // unique group_ids.
  const postRows = (postsRes.data ?? []) as PostRow[];
  const groupRows = (groupsRes.data ?? []) as GroupRow[];
  const identityRows = peopleRes.rows;

  const postGroupIds = Array.from(new Set(postRows.map((p) => p.group_id)));
  const { data: postGroups } = postGroupIds.length
    ? await auth.supabase
        .from("community_groups")
        .select("id, name, slug")
        // fitness-allow: F39 (scoped to one page/group render's own bounded row set, not corpus-scale)
        .in("id", postGroupIds)
    : { data: [] as Array<{ id: string; name: string; slug: string }> };
  const groupNameById = new Map(
    (postGroups ?? []).map((g) => [g.id, { name: g.name, slug: g.slug }] as const)
  );

  const posts = postRows.map((p) => {
    const meta = groupNameById.get(p.group_id);
    return {
      id: p.id,
      title: p.title ?? "(no title)",
      body_excerpt: excerpt(p.body, q),
      group_id: p.group_id,
      group_name: meta?.name ?? "Unknown group",
      group_slug: meta?.slug ?? "",
      created_at: p.created_at,
    };
  });

  const groups = groupRows.map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    region: g.region,
    privacy: g.privacy,
    member_count: g.member_count,
  }));

  const people = identityRows
    .filter((p) => p.display_name)
    .slice(0, MAX_RESULTS_PER_SCOPE)
    .map((p) => ({
      user_id: p.user_id,
      name: p.display_name,
      headshot_url: p.avatar_url,
    }));

  return NextResponse.json(
    { posts, groups, people },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// Slice a ~160-char window of the body around the first occurrence of
// the query so the dropdown shows context. Falls back to the leading
// 160 chars when no match (the title likely matched).
function excerpt(body: string, query: string): string {
  const lower = body.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return body.slice(0, 160).trim();
  const start = Math.max(0, idx - 60);
  const slice = body.slice(start, start + 160);
  return (start > 0 ? "… " : "") + slice.trim() + (start + 160 < body.length ? " …" : "");
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}
