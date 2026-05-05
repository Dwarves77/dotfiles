"use client";

/**
 * PostComposer — top-of-feed composer for a community group post.
 *
 * Phase C scope:
 *   - Plain-text title + body. No markdown rendering, no rich text.
 *   - Submits POST /api/community/posts via cookie session.
 *   - On success calls onPosted(newPost) so the parent feed can prepend
 *     the row optimistically. The composer clears its inputs.
 *
 * Visual idiom matches GroupHeader / GroupCard in this directory:
 *   var(--color-bg-surface) panel, var(--color-border) outline,
 *   var(--color-text-primary) heading, 6px radius.
 */

import { useState } from "react";

interface CommunityPostAuthor {
  user_id: string;
  name: string | null;
  headshot_url: string | null;
}

export interface CommunityPost {
  id: string;
  group_id: string;
  parent_post_id: string | null;
  author_user_id: string | null;
  author: CommunityPostAuthor | null;
  title: string | null;
  body: string;
  created_at: string;
  last_reply_at: string | null;
  reply_count: number;
  attribution: string | null;
  promoted_from_post_id: string | null;
}

interface PostComposerProps {
  groupId: string;
  onPosted?: (post: CommunityPost) => void;
  onError?: (message: string) => void;
}

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 8000;

export function PostComposer({ groupId, onPosted, onError }: PostComposerProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !busy &&
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    title.length <= MAX_TITLE_LEN &&
    body.length <= MAX_BODY_LEN;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          title: title.trim(),
          body: body.trim(),
        }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        const msg = json?.error || `Could not post (${res.status})`;
        setError(msg);
        onError?.(msg);
        return;
      }
      if (json?.post) {
        onPosted?.(json.post as CommunityPost);
      }
      setTitle("");
      setBody("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="New post"
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: 16,
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <label
        htmlFor="post-title"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-text-secondary)",
        }}
      >
        Start a post
      </label>
      <input
        id="post-title"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        maxLength={MAX_TITLE_LEN + 50}
        disabled={busy}
        style={{
          background: "var(--color-bg-base)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          padding: "10px 12px",
          fontSize: 14,
          color: "var(--color-text-primary)",
          fontFamily: "inherit",
          outline: "none",
        }}
      />
      <textarea
        id="post-body"
        aria-label="Post body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share an update, ask a question, or post resources for this group."
        rows={4}
        maxLength={MAX_BODY_LEN + 200}
        disabled={busy}
        style={{
          background: "var(--color-bg-base)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          padding: "10px 12px",
          fontSize: 13,
          color: "var(--color-text-primary)",
          fontFamily: "inherit",
          lineHeight: 1.55,
          resize: "vertical",
          minHeight: 80,
          outline: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color:
              body.length > MAX_BODY_LEN
                ? "var(--color-high, #b45309)"
                : "var(--color-text-muted, var(--color-text-secondary))",
          }}
        >
          {body.length} / {MAX_BODY_LEN} characters
        </span>
        <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          {error && (
            <span
              role="alert"
              style={{
                fontSize: 12,
                color: "var(--color-high, #b45309)",
              }}
            >
              {error}
            </span>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              background: canSubmit
                ? "var(--color-text-primary)"
                : "var(--color-bg-base)",
              color: canSubmit
                ? "var(--color-bg-base)"
                : "var(--color-text-muted, var(--color-text-secondary))",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Posting..." : "Post"}
          </button>
        </div>
      </div>
    </form>
  );
}

async function safeJson(res: Response): Promise<{ post?: unknown; error?: string } | null> {
  try {
    return (await res.json()) as { post?: unknown; error?: string };
  } catch {
    return null;
  }
}
