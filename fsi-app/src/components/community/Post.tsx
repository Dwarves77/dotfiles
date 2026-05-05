"use client";

/**
 * Post — single post card in a community group feed.
 *
 * Phase C scope:
 *   - Plain-text body rendering (preserve linebreaks, no markdown).
 *   - Author headshot + name + relative timestamp header.
 *   - Reaction control rendered DISABLED with explanatory tooltip
 *     because community_post_reactions does not exist in any applied
 *     migration. The /api/community/posts/[id]/reactions endpoint
 *     returns 501. Reactions activate in Phase D.
 *   - Reply count + "View replies" expand-toggle. Lazy-loads replies
 *     on first expand from /api/community/posts/[id]/replies.
 *   - "Reply" button (group members) reveals an inline ReplyComposer.
 *   - Author/admin "Delete" button hits DELETE /api/community/posts/[id].
 *
 * Visual idiom matches GroupHeader / GroupCard idiom: surface card,
 * border, 6px radius, 8pt grid spacing.
 */

import { useState } from "react";
import { MessageSquare, Trash2, SmilePlus } from "lucide-react";
import type { CommunityPost } from "./PostComposer";
import { ReplyComposer } from "./ReplyComposer";
import { PromotePostButton } from "./PromotePostButton";
import { ReportPostMenu } from "./ReportPostMenu";

interface PostProps {
  post: CommunityPost;
  currentUserId: string | null;
  isGroupAdmin: boolean;
  isGroupMember: boolean;
  /** Optional — when true, PromotePostButton offers the kind='direct'
   * radio (insert straight into intelligence_items). Defaults to false
   * so Post.tsx is back-compatible with callers that haven't been
   * widened to thread the platform-admin flag through yet (e.g. C5's
   * PostList). Group admins/moderators see the button regardless. */
  isPlatformAdmin?: boolean;
  onDeleted?: (postId: string) => void;
  onError?: (message: string) => void;
}

export function Post({
  post,
  currentUserId,
  isGroupAdmin,
  isGroupMember,
  isPlatformAdmin = false,
  onDeleted,
  onError,
}: PostProps) {
  const [expandedReplies, setExpandedReplies] = useState(false);
  const [replies, setReplies] = useState<CommunityPost[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesError, setRepliesError] = useState<string | null>(null);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyCount, setReplyCount] = useState(post.reply_count ?? 0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isAuthor =
    !!currentUserId && post.author_user_id === currentUserId;
  const canDelete = isAuthor || isGroupAdmin;
  const authorName = post.author?.name ?? "Member";
  const initials = makeInitials(authorName);

  const loadReplies = async () => {
    setRepliesLoading(true);
    setRepliesError(null);
    try {
      const res = await fetch(`/api/community/posts/${post.id}/replies?limit=20`);
      const json = await safeJson<{ replies?: CommunityPost[]; error?: string }>(res);
      if (!res.ok) {
        const msg = json?.error || `Could not load replies (${res.status})`;
        setRepliesError(msg);
        onError?.(msg);
        return;
      }
      setReplies(json?.replies ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setRepliesError(msg);
      onError?.(msg);
    } finally {
      setRepliesLoading(false);
    }
  };

  const toggleReplies = () => {
    if (expandedReplies) {
      setExpandedReplies(false);
      return;
    }
    setExpandedReplies(true);
    if (replies.length === 0 && replyCount > 0) {
      void loadReplies();
    }
  };

  const handleReplyPosted = (reply: CommunityPost) => {
    setReplies((prev) => [...prev, reply]);
    setReplyCount((c) => c + 1);
    setShowReplyBox(false);
    setExpandedReplies(true);
  };

  const handleDelete = async () => {
    if (deleting) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this post? This cannot be undone.")
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/community/posts/${post.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await safeJson<{ error?: string }>(res);
        const msg = json?.error || `Could not delete (${res.status})`;
        setDeleteError(msg);
        onError?.(msg);
        return;
      }
      onDeleted?.(post.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setDeleteError(msg);
      onError?.(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article
      aria-label={post.title || "Post"}
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <header style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Avatar
          headshotUrl={post.author?.headshot_url ?? null}
          initials={initials}
          alt={authorName}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-text-primary)",
              }}
            >
              {authorName}
            </span>
            <time
              dateTime={post.created_at}
              title={new Date(post.created_at).toLocaleString()}
              style={{
                fontSize: 11,
                color: "var(--color-text-muted, var(--color-text-secondary))",
              }}
            >
              {formatRelative(post.created_at)}
            </time>
          </div>
          {post.title && (
            <h3
              style={{
                margin: "6px 0 0",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--color-text-primary)",
                lineHeight: 1.3,
              }}
            >
              {post.title}
            </h3>
          )}
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete post"
            title="Delete post"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "6px 8px",
              color: "var(--color-text-secondary)",
              cursor: deleting ? "wait" : "pointer",
              opacity: deleting ? 0.5 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </header>

      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--color-text-primary)",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {post.body}
      </p>

      {deleteError && (
        <p
          role="alert"
          style={{
            fontSize: 12,
            color: "var(--color-high, #b45309)",
            margin: 0,
          }}
        >
          {deleteError}
        </p>
      )}

      <footer
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          paddingTop: 8,
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <button
          type="button"
          disabled
          aria-label="Reactions (coming in Phase D)"
          title="Reactions ship in Phase D"
          style={{
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "5px 9px",
            color: "var(--color-text-muted, var(--color-text-secondary))",
            cursor: "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            opacity: 0.6,
          }}
        >
          <SmilePlus size={12} />
          React
        </button>

        <button
          type="button"
          onClick={toggleReplies}
          aria-expanded={expandedReplies}
          style={{
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "5px 9px",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
          }}
        >
          <MessageSquare size={12} />
          {replyCount} {replyCount === 1 ? "reply" : "replies"}
          {replyCount > 0 && (expandedReplies ? " — hide" : " — view")}
        </button>

        {isGroupMember && (
          <button
            type="button"
            onClick={() => setShowReplyBox((v) => !v)}
            style={{
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "5px 9px",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {showReplyBox ? "Cancel" : "Reply"}
          </button>
        )}

        {/* Promote-to-intelligence — top-level posts only. The button
            self-hides when post is a reply OR caller is neither group
            admin/moderator nor platform admin (see PromotePostButton). */}
        {!post.parent_post_id && currentUserId && (
          <PromotePostButton
            post={{
              id: post.id,
              group_id: post.group_id,
              body: post.body,
              parent_post_id: post.parent_post_id,
              promoted_at:
                ((post as unknown as { promoted_at?: string | null }).promoted_at) ?? null,
            }}
            currentUser={{
              id: currentUserId,
              isGroupAdmin,
              isPlatformAdmin,
            }}
          />
        )}

        {/* Report — visible to any group member. The API gates on
            membership; we hide the button entirely for non-members so
            we never render a button that would 403. */}
        {isGroupMember && currentUserId && (
          <ReportPostMenu
            postId={post.id}
            onToast={(msg) => onError?.(msg)}
          />
        )}
      </footer>

      {showReplyBox && isGroupMember && (
        <ReplyComposer
          postId={post.id}
          onPosted={handleReplyPosted}
          onError={onError}
          onCancel={() => setShowReplyBox(false)}
        />
      )}

      {expandedReplies && (
        <div
          style={{
            marginTop: 6,
            paddingLeft: 16,
            borderLeft: "2px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {repliesLoading && (
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                margin: 0,
              }}
            >
              Loading replies...
            </p>
          )}
          {repliesError && !repliesLoading && (
            <p
              role="alert"
              style={{
                fontSize: 12,
                color: "var(--color-high, #b45309)",
                margin: 0,
              }}
            >
              {repliesError}
            </p>
          )}
          {!repliesLoading && !repliesError && replies.length === 0 && (
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                margin: 0,
              }}
            >
              No replies yet.
            </p>
          )}
          {replies.map((r) => (
            <ReplyRow key={r.id} reply={r} />
          ))}
        </div>
      )}
    </article>
  );
}

function ReplyRow({ reply }: { reply: CommunityPost }) {
  const name = reply.author?.name ?? "Member";
  const initials = makeInitials(name);
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <Avatar
        headshotUrl={reply.author?.headshot_url ?? null}
        initials={initials}
        alt={name}
        size={28}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            {name}
          </span>
          <time
            dateTime={reply.created_at}
            title={new Date(reply.created_at).toLocaleString()}
            style={{
              fontSize: 11,
              color: "var(--color-text-muted, var(--color-text-secondary))",
            }}
          >
            {formatRelative(reply.created_at)}
          </time>
        </div>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12.5,
            color: "var(--color-text-primary)",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {reply.body}
        </p>
      </div>
    </div>
  );
}

function Avatar({
  headshotUrl,
  initials,
  alt,
  size = 36,
}: {
  headshotUrl: string | null;
  initials: string;
  alt: string;
  size?: number;
}) {
  if (headshotUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={headshotUrl}
        alt={alt}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--color-bg-base)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text-secondary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size <= 28 ? 10 : 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
