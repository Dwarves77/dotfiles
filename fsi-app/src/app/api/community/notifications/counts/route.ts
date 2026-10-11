import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";

interface NotificationRow {
  kind: string;
  payload: { group_id?: string } | null;
}

export async function GET(request: NextRequest) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

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
