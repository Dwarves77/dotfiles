// GET /api/community/threads/[id]/corroboration
//
// Corroboration counter (spec 05 §4 gate 2, §5 component 5, §6 acceptance criterion 7): "distinct
// organisations, not post count." The pure computation lives in src/lib/community/corroboration.mjs
// (corroborationCount) — this route's only job is to assemble the `{ posts: [{organisationKey,
// stance}] }` shape it expects from the DB and shape the result back down to what a client may see.
//
// organisation_key is deliberately NOT selectable by `authenticated`/`anon` at the column-grant level
// (migration 293) — only VERIFIED members carry one at all (verification is what derives it), and only
// server code may read it. This route therefore does two reads: (1) the caller's own RLS-aware client,
// to confirm the thread is actually visible to them (same visibility community_posts RLS already
// enforces — a private-group thread the caller cannot see returns 404, not corroboration data about
// content they cannot read); (2) the service client, to pull organisation_key for the thread's replies
// and compute the count. Only the COUNT is returned, never the organisation_key values themselves or a
// per-organisation breakdown — those stay internal to this route.
//
// Auth: cookie session. Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { getServiceSupabase } from "@/lib/supabase-service";
import { corroborationCount } from "@/lib/community/index.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id: threadId } = await params;
  if (!threadId || !UUID_RE.test(threadId)) {
    return NextResponse.json({ error: "Valid thread id required" }, { status: 400 });
  }

  // Visibility check with the CALLER's own RLS-aware client — a thread the caller cannot see (private
  // group, not a member) 404s here rather than leaking its corroboration count.
  const { data: thread, error: threadErr } = await auth.supabase
    .from("community_posts")
    .select("id")
    .eq("id", threadId)
    .maybeSingle();
  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const service = getServiceSupabase();
  const { data: replies, error: repliesErr } = await service
    .from("community_posts")
    .select("author_user_id, stance")
    .eq("parent_post_id", threadId);
  if (repliesErr) {
    return NextResponse.json({ error: repliesErr.message }, { status: 500 });
  }

  const authorIds = Array.from(
    new Set(
      (replies ?? [])
        .map((r) => r.author_user_id as string | null)
        .filter((id): id is string => !!id)
    )
  );

  const organisationKeyByUser = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: profiles, error: profilesErr } = await service
      .from("community_member_profiles")
      .select("user_id, organisation_key, verified")
      .in("user_id", authorIds);
    if (profilesErr) {
      return NextResponse.json({ error: profilesErr.message }, { status: 500 });
    }
    for (const p of profiles ?? []) {
      // Only a VERIFIED member's organisation_key counts toward corroboration (spec 05 §4 gate 2: "at
      // least 3 independent VERIFIED members") — an unverified member's reply is real content but not a
      // corroborating voice for gate purposes.
      organisationKeyByUser.set(p.user_id as string, p.verified ? (p.organisation_key as string | null) : null);
    }
  }

  const posts = (replies ?? [])
    .map((r) => ({
      organisationKey: r.author_user_id ? organisationKeyByUser.get(r.author_user_id as string) ?? null : null,
      stance: (r.stance as "agree" | "disagree" | "neutral" | null) ?? null,
    }))
    .filter((p) => p.organisationKey !== null);

  const result = corroborationCount({ posts });

  return NextResponse.json(
    {
      thread_id: threadId,
      organisations: result.organisations,
      posts: result.posts,
      consistent: result.consistent,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
