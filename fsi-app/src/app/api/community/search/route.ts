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
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

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

interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export async function GET(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

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

  const [postsRes, groupsRes, peopleRes] = await Promise.all([
    wantPosts
      ? auth.supabase
          .from("community_posts")
          .select("id, title, body, group_id, created_at")
          .is("parent_post_id", null)
          .or(`title.ilike.${escaped},body.ilike.${escaped}`)
          .order("created_at", { ascending: false })
          .limit(MAX_RESULTS_PER_SCOPE)
      : Promise.resolve({ data: [] as PostRow[], error: null }),
    wantGroups
      ? auth.supabase
          .from("community_groups")
          .select("id, name, slug, region, privacy, member_count, description")
          .or(`name.ilike.${escaped},description.ilike.${escaped}`)
          .order("last_active_at", { ascending: false })
          .limit(MAX_RESULTS_PER_SCOPE)
      : Promise.resolve({ data: [] as GroupRow[], error: null }),
    wantPeople
      ? auth.supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .ilike("full_name", escaped)
          .limit(MAX_RESULTS_PER_SCOPE)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ]);

  // Collect errors. Surface the first one; partial results are not
  // helpful when a query failed because the user would have no way
  // to tell which scope is incomplete.
  const firstErr = postsRes.error ?? groupsRes.error ?? peopleRes.error;
  if (firstErr) {
    return NextResponse.json({ error: firstErr.message }, { status: 500 });
  }

  // Resolve group names for the matched posts so the dropdown can
  // surface "[Group] / Post title". One additional query keyed off
  // unique group_ids.
  const postRows = (postsRes.data ?? []) as PostRow[];
  const groupRows = (groupsRes.data ?? []) as GroupRow[];
  const profileRows = (peopleRes.data ?? []) as ProfileRow[];

  const postGroupIds = Array.from(new Set(postRows.map((p) => p.group_id)));
  const { data: postGroups } = postGroupIds.length
    ? await auth.supabase
        .from("community_groups")
        .select("id, name, slug")
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

  const people = profileRows
    .filter((p) => p.full_name)
    .map((p) => ({
      user_id: p.id,
      name: p.full_name,
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
