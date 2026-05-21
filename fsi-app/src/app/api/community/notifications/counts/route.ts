// GET /api/community/notifications/counts
//
// Lightweight aggregation endpoint for the community sidebar.
// Returns per-group unread + mention counts so CommunitySidebar can
// render real badges without paginating the full notifications list.
//
// Schema reference (migration 032):
//   notifications(id, user_id, kind, payload, read_at, created_at)
//   kind in (mention, reply, promote, invite, moderation)
//   payload jsonb carries group_id when the notification originated in
//   a group context (reply/promote/invite/moderation/mention).
//
// Auth:    cookie session via requireCommunityAuth.
// Limits:  60 req/min/user via checkRateLimit.
// RLS:     SELECT self-only. Caller can never see another user's rows.
//
// Response shape:
//   {
//     groups: Array<{ group_id: string; unread_count: number; mention_count: number }>,
//     total_unread: number,
//     total_mentions: number
//   }
//
// "Mention" counts include kind='mention' rows; "unread" is every
// unread row regardless of kind. The two are independent counters so
// the sidebar can render both pills with consistent semantics across
// the rest of the surface.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

interface NotificationRow {
  kind: string;
  payload: { group_id?: string } | null;
}

export async function GET(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  // Pull every unread row. Caller's RLS scopes to self.
  // For most users this is a small set (bell badge tops out at 99+);
  // we sort + aggregate client-side to avoid an RPC migration.
  const { data, error } = await auth.supabase
    .from("notifications")
    .select("kind, payload")
    .eq("user_id", auth.userId)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as NotificationRow[];
  const byGroup = new Map<
    string,
    { unread_count: number; mention_count: number }
  >();
  let totalUnread = 0;
  let totalMentions = 0;

  for (const row of rows) {
    totalUnread += 1;
    if (row.kind === "mention") totalMentions += 1;
    const groupId = row.payload?.group_id;
    if (!groupId) continue;
    const existing = byGroup.get(groupId) ?? {
      unread_count: 0,
      mention_count: 0,
    };
    existing.unread_count += 1;
    if (row.kind === "mention") existing.mention_count += 1;
    byGroup.set(groupId, existing);
  }

  const groups = Array.from(byGroup.entries()).map(([group_id, counts]) => ({
    group_id,
    ...counts,
  }));

  return NextResponse.json(
    {
      groups,
      total_unread: totalUnread,
      total_mentions: totalMentions,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
