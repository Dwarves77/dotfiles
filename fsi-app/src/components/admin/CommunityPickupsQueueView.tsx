"use client";

/**
 * CommunityPickupsQueueView — H5 (2026-05-25), Path A.
 *
 * Engagement-heuristic SUGGESTION queue (not a strict review workflow):
 * surfaces top-level community posts with reply_count >= 3 and < 30 days
 * old that haven't been promoted yet. These are conversations that drew
 * peer engagement and may be worth elevating to platform intelligence.
 *
 * Per operator direction (2026-05-25): visual treatment must make the
 * "suggestion not workflow" semantic clear. The schema has no
 * review_pending state; promoted_at IS NULL means "not promoted yet,"
 * NOT "queued for review." Header copy: "Posts worth reviewing" /
 * "High-engagement posts pending promotion."
 *
 * Per-row actions:
 *   - Promote (mounts PromotePostDialog; same dialog used in C5 Post.tsx)
 *   - View original thread (opens /community/[group_slug] in new tab;
 *     post-id anchoring is best-effort, the route is group-level)
 *
 * No Dismiss action — there is no schema state for "reviewed but
 * intentionally not promoted." A post drops off the queue when it
 * either: (a) gets promoted (promoted_at set), or (b) ages past
 * 30 days, or (c) reply_count falls below 3 (unlikely but possible
 * via reply deletion). All organic.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { RefreshCw, ArrowUpRight, ExternalLink } from "lucide-react";
import { formatRelative, toDate } from "@/lib/relative-time";
import { PromotePostDialog } from "@/components/community/PromotePostDialog";
import type {
  PromotePostButtonPost,
} from "@/components/community/PromotePostButton";

interface QueuePost {
  id: string;
  group_id: string;
  title: string | null;
  body: string;
  reply_count: number;
  created_at: string;
  last_reply_at: string | null;
  parent_post_id: string | null;
  promoted_at: string | null;
  author_user_id: string | null;
  group: { id: string; name: string; slug: string; region: string | null; privacy: string | null } | null;
  author: { id: string | null; full_name: string | null } | null;
}

const REGION_LABEL: Record<string, string> = {
  EU: "EU",
  UK: "UK",
  US: "US",
  LATAM: "LATAM",
  APAC: "APAC",
  HK: "HK",
  MEA: "MEA",
  GLOBAL: "Global",
};

export function CommunityPickupsQueueView() {
  const supabase = createSupabaseBrowserClient();
  const [items, setItems] = useState<QueuePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<QueuePost | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // community_posts.author_user_id FK-targets auth.users(id), not
      // profiles(id), so PostgREST can't embed profiles directly. Two-step
      // fetch: posts first, then profiles keyed by the collected author IDs.
      const [{ data: postRows, error: queryErr }, userRes] = await Promise.all([
        supabase
          .from("community_posts")
          .select(
            "id, group_id, title, body, reply_count, created_at, last_reply_at, parent_post_id, promoted_at, author_user_id, " +
            "group:community_groups(id, name, slug, region, privacy)"
          )
          .is("promoted_at", null)
          .is("parent_post_id", null)
          .gte("reply_count", 3)
          .gte("created_at", thirtyDaysAgo)
          .order("reply_count", { ascending: false })
          .limit(100),
        supabase.auth.getUser(),
      ]);

      if (queryErr) throw new Error(queryErr.message);

      const rawRows = (postRows ?? []) as unknown as Array<Record<string, unknown> & { author_user_id: string | null }>;
      const authorIds = Array.from(
        new Set(
          rawRows
            .map((r) => r.author_user_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let profileMap = new Map<string, { id: string; full_name: string | null }>();
      if (authorIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", authorIds);
        for (const p of (profileRows ?? []) as Array<{ id: string; full_name: string | null }>) {
          profileMap.set(p.id, p);
        }
      }

      const rows = rawRows.map((r: any) => {
        const profile = r.author_user_id ? profileMap.get(r.author_user_id) ?? null : null;
        return {
          ...r,
          group: Array.isArray(r.group) ? (r.group[0] ?? null) : (r.group ?? null),
          author: profile ? { id: profile.id, full_name: profile.full_name } : null,
        };
      });
      setItems(rows as QueuePost[]);
      setCurrentUserId(userRes.data.user?.id ?? null);
    } catch (e: any) {
      setError(e.message || "Failed to load community pickups");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Dialog re-fetches the queue after a successful promotion via
  // router.refresh(); we also reload locally so the row leaves the
  // list without a navigation event.
  const closePromote = (refresh: boolean) => {
    setPromoteTarget(null);
    if (refresh) load();
  };

  return (
    <div className="space-y-4">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary, var(--text))" }}>
            Posts worth reviewing
          </h2>
          <p className="text-xs" style={{ color: "var(--color-text-secondary, var(--text-2))", marginTop: 4 }}>
            High-engagement community posts pending promotion. Heuristic: top-level
            posts from the last 30 days with at least 3 replies and no prior
            promotion. This is a suggestion queue, not a strict review workflow —
            posts drop off organically as they age out, get promoted, or
            de-engage.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      {loading && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", fontStyle: "italic" }}>Loading queue…</p>
      )}

      {error && (
        <p style={{ fontSize: 12.5, color: "var(--critical)" }}>{error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", fontStyle: "italic" }}>
          No high-engagement posts pending promotion right now.
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => {
            const created = toDate(item.created_at);
            const lastReply = toDate(item.last_reply_at);
            const author = item.author?.full_name || "Anonymous";
            const regionLabel = item.group?.region ? REGION_LABEL[item.group.region] ?? item.group.region : null;
            const isPrivate = item.group?.privacy === "private";
            return (
              <div
                key={item.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderLeft: "3px solid var(--accent)",
                  borderRadius: "var(--r-sm)",
                  padding: "14px 16px",
                  display: "grid",
                  gridTemplateColumns: "1fr 220px",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--text-2)",
                      marginBottom: 6,
                    }}
                  >
                    {item.group?.name && <span>{item.group.name}</span>}
                    {regionLabel && <span>· {regionLabel}</span>}
                    {isPrivate && <span>· Private</span>}
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: 2,
                        color: "var(--accent)",
                        background: "var(--accent-bg)",
                        border: "1px solid var(--accent-bd)",
                      }}
                    >
                      {item.reply_count} replies
                    </span>
                  </div>
                  <h4
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      lineHeight: 1.35,
                      margin: "2px 0 4px",
                      color: "var(--text)",
                    }}
                  >
                    {item.title || "(Untitled post)"}
                  </h4>
                  {item.body && (
                    <p
                      style={{
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        color: "var(--text-2)",
                        margin: "0 0 6px",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {item.body}
                    </p>
                  )}
                  <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>By {author}</span>
                    {created && <span>Posted {formatRelative(created)}</span>}
                    {lastReply && <span>Last reply {formatRelative(lastReply)}</span>}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setPromoteTarget(item)}
                    disabled={!currentUserId}
                  >
                    <ArrowUpRight size={14} />
                    Promote
                  </Button>
                  {item.group?.slug && (
                    <Link
                      href={`/community/${encodeURIComponent(item.group.slug)}#post-${item.id}`}
                      target="_blank"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-2)",
                        textDecoration: "none",
                        padding: "4px 8px",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      <ExternalLink size={12} />
                      View thread
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {promoteTarget && currentUserId && (
        <PromotePostDialog
          post={
            {
              id: promoteTarget.id,
              group_id: promoteTarget.group_id,
              body: promoteTarget.body,
              parent_post_id: promoteTarget.parent_post_id,
              promoted_at: promoteTarget.promoted_at,
            } satisfies PromotePostButtonPost
          }
          onClose={() => closePromote(true)}
        />
      )}
    </div>
  );
}
