"use client";

/**
 * ReplyComposer — inline reply box rendered beneath an expanded Post.
 *
 * Phase C scope:
 *   - Plain-text body only. Smaller textarea than PostComposer.
 *   - Submits POST /api/community/posts/[postId]/replies via cookie
 *     session.
 *   - On success calls onPosted(reply) so the parent can append it to
 *     its locally-cached replies list.
 */

import { useState } from "react";
import type { CommunityPost } from "./PostComposer";

interface ReplyComposerProps {
  postId: string;
  onPosted?: (reply: CommunityPost) => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
}

const MAX_BODY_LEN = 4000;

export function ReplyComposer({
  postId,
  onPosted,
  onError,
  onCancel,
}: ReplyComposerProps) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !busy && body.trim().length > 0 && body.length <= MAX_BODY_LEN;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${postId}/replies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        const msg = json?.error || `Could not reply (${res.status})`;
        setError(msg);
        onError?.(msg);
        return;
      }
      if (json?.reply) {
        onPosted?.(json.reply as CommunityPost);
      }
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
      aria-label="Reply"
      style={{
        background: "var(--color-bg-base)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginTop: 12,
      }}
    >
      <textarea
        aria-label="Reply body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply..."
        rows={3}
        maxLength={MAX_BODY_LEN + 100}
        disabled={busy}
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          padding: "8px 10px",
          fontSize: 13,
          color: "var(--color-text-primary)",
          fontFamily: "inherit",
          lineHeight: 1.5,
          resize: "vertical",
          minHeight: 64,
          outline: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
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
          {body.length} / {MAX_BODY_LEN}
        </span>
        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          {error && (
            <span
              role="alert"
              style={{ fontSize: 12, color: "var(--color-high, #b45309)" }}
            >
              {error}
            </span>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              style={{
                background: "transparent",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              background: canSubmit
                ? "var(--color-text-primary)"
                : "var(--color-bg-surface)",
              color: canSubmit
                ? "var(--color-bg-base)"
                : "var(--color-text-muted, var(--color-text-secondary))",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "6px 14px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Replying..." : "Reply"}
          </button>
        </div>
      </div>
    </form>
  );
}

async function safeJson(res: Response): Promise<{ reply?: unknown; error?: string } | null> {
  try {
    return (await res.json()) as { reply?: unknown; error?: string };
  } catch {
    return null;
  }
}
