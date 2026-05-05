"use client";

/**
 * PostList — group feed list. Mounts inside CommunityShell on the
 * /community/[slug] page.
 *
 * Fetches GET /api/community/posts?group_id={id}&limit=20 on mount and
 * renders top-level posts newest-first. Composer at the top (only for
 * group members). "Load older posts" button at the bottom paginates by
 * created_at cursor.
 *
 * Phase C scope: top-level posts only. Replies render lazily inside
 * each Post card. Reactions are stubbed (501 endpoint, disabled UI).
 */

import { useCallback, useEffect, useState } from "react";
import { PostComposer, type CommunityPost } from "./PostComposer";
import { Post } from "./Post";

interface PostListProps {
  groupId: string;
  currentUserId: string | null;
  isGroupMember: boolean;
  isGroupAdmin: boolean;
}

const PAGE_SIZE = 20;

export function PostList({
  groupId,
  currentUserId,
  isGroupMember,
  isGroupAdmin,
}: PostListProps) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/community/posts?group_id=${encodeURIComponent(
          groupId
        )}&limit=${PAGE_SIZE}`
      );
      const json = await safeJson<{
        posts?: CommunityPost[];
        next_cursor?: string | null;
        error?: string;
      }>(res);
      if (!res.ok) {
        setError(json?.error || `Could not load posts (${res.status})`);
        return;
      }
      setPosts(json?.posts ?? []);
      setNextCursor(json?.next_cursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadOlder = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/community/posts?group_id=${encodeURIComponent(
          groupId
        )}&limit=${PAGE_SIZE}&before=${encodeURIComponent(nextCursor)}`
      );
      const json = await safeJson<{
        posts?: CommunityPost[];
        next_cursor?: string | null;
        error?: string;
      }>(res);
      if (!res.ok) {
        setToast(json?.error || `Could not load older posts (${res.status})`);
        return;
      }
      setPosts((prev) => [...prev, ...(json?.posts ?? [])]);
      setNextCursor(json?.next_cursor ?? null);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePosted = (post: CommunityPost) => {
    setPosts((prev) => [post, ...prev]);
    setToast("Post published");
  };

  const handleDeleted = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setToast("Post deleted");
  };

  const handleError = (msg: string) => setToast(msg);

  return (
    <section aria-label="Group posts" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {isGroupMember ? (
        <PostComposer
          groupId={groupId}
          onPosted={handlePosted}
          onError={handleError}
        />
      ) : (
        <div
          style={{
            background: "var(--color-bg-surface)",
            border: "1px dashed var(--color-border)",
            borderRadius: 6,
            padding: "16px 20px",
            marginBottom: 20,
            fontSize: 12.5,
            color: "var(--color-text-secondary)",
            lineHeight: 1.5,
          }}
        >
          Join this group to post or reply.
        </div>
      )}

      {loading && (
        <div
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: "32px 20px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--color-text-secondary)",
          }}
        >
          Loading posts...
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-high-border, var(--color-border))",
            borderLeft: "3px solid var(--color-high, #b45309)",
            borderRadius: 6,
            padding: "14px 18px",
            fontSize: 13,
            color: "var(--color-high, #b45309)",
          }}
        >
          {error}
          <button
            type="button"
            onClick={() => void loadInitial()}
            style={{
              marginLeft: 12,
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: 3,
              padding: "3px 9px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              color: "var(--color-text-primary)",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div
          style={{
            background: "var(--color-bg-surface)",
            border: "1px dashed var(--color-border)",
            borderRadius: 6,
            padding: "40px 24px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            No posts yet. {isGroupMember ? "Be the first to start the conversation." : "Members will start the conversation here."}
          </p>
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {posts.map((p) => (
            <Post
              key={p.id}
              post={p}
              currentUserId={currentUserId}
              isGroupAdmin={isGroupAdmin}
              isGroupMember={isGroupMember}
              onDeleted={handleDeleted}
              onError={handleError}
            />
          ))}
          {nextCursor && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingMore}
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  padding: "8px 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--color-text-secondary)",
                  cursor: loadingMore ? "wait" : "pointer",
                  opacity: loadingMore ? 0.6 : 1,
                }}
              >
                {loadingMore ? "Loading..." : "Load older posts"}
              </button>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          onClick={() => setToast(null)}
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "var(--color-text-primary)",
            color: "var(--color-bg-base)",
            padding: "10px 16px",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.03em",
            cursor: "pointer",
            zIndex: 50,
            maxWidth: 360,
          }}
        >
          {toast}
        </div>
      )}
    </section>
  );
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
