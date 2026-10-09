"use client";

/**
 * PostComposer — top-of-feed composer for a community group post.
 *
 * Wave 3 (2026-09-03): entity-bound posting UI (spec 05 §5 component 2, acceptance 6 — "every
 * thread binds to at least one spine entity") plus the antitrust write-time guard's refusal
 * rendering (spec 05 section 1, component 12: refuse and explain; the aggregate-only route was removed
 * by ADR-042). Both
 * go through api-client.createCommunityPost, which posts COMMUNITY-A's contract shape
 * `{ group_id, title?, body, entity_ids, sensitivity_field? }` to POST /api/community/posts. A post
 * with no bound entity is refused CLIENT-SIDE (never reaches the network) — see
 * identity-format.validateEntityBinding.
 *
 * Phase C scope carried forward: plain-text title + body, no markdown rendering, no rich text. On
 * success calls onPosted(newPost) so the parent feed can prepend the row optimistically and the
 * composer clears its inputs (entity selection included).
 *
 * Visual idiom matches GroupHeader / GroupCard in this directory:
 *   var(--color-bg-surface) panel, var(--color-border) outline,
 *   var(--color-text-primary) heading, 6px radius.
 */

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createCommunityPost } from "./api-client";
import { validateEntityBinding } from "./identity-format";
import { EntityPicker } from "./EntityPicker";
import type { CommunityEntityRef } from "./types";
import { formatNumber } from "@/lib/format";

interface CommunityPostAuthor {
  /** Null on an anonymous post unless the reader is its author or a platform admin (DFIX-1, SEC-5 residual). */
  user_id: string | null;
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
  // Optional identity projection: kept optional so a post from the list route with none of it still
  // type-checks and Post.tsx falls back to its legacy rendering (see Post.tsx's own header).
  author_identity?: {
    orgType?: string | null;
    role?: string | null;
    sector?: string | null;
    region?: string | null;
    verified?: boolean;
  } | null;
}

interface PostComposerProps {
  groupId: string;
  onPosted?: (post: CommunityPost) => void;
  onError?: (message: string) => void;
  /** Candidate spine entities to bind this post to. Fetched server-side by the page that renders
   * this composer (community/[slug]/page.tsx queries `entities` directly — see EntityPicker.tsx's
   * header for why: no entity search/list API exists in this lane's contract). Defaults to an empty
   * list so the composer still renders (with an always-empty picker) for any caller that hasn't
   * been updated to thread candidates through yet. */
  candidateEntities?: CommunityEntityRef[];
  /** R8.7 (spec 07 Community, 2026-09-25, migration 336): the author's own account-wide
   * community_member_profiles.default_anonymous, fetched server-side by the page and threaded down ,
   * initialises this post's "Post anonymously" checkbox (the reader can still override it per post).
   * Defaults to false (identity shown), R8.7's own default, for any caller that has not been updated
   * to thread it through yet. */
  defaultAnonymous?: boolean;
}

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 8000;

export function PostComposer({
  groupId,
  onPosted,
  onError,
  candidateEntities = [],
  defaultAnonymous = false,
}: PostComposerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [entities, setEntities] = useState<CommunityEntityRef[]>([]);
  const [sensitivityField, setSensitivityField] = useState("");
  const [anonymous, setAnonymous] = useState(defaultAnonymous);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ message: string } | null>(null);

  const entityError = validateEntityBinding(entities.map((e) => e.entity_id));
  const canSubmit =
    !busy &&
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    title.length <= MAX_TITLE_LEN &&
    body.length <= MAX_BODY_LEN &&
    !entityError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setRefusal(null);
    try {
      const result = await createCommunityPost({
        group_id: groupId,
        title: title.trim(),
        body: body.trim(),
        entity_ids: entities.map((ent) => ent.entity_id),
        sensitivity_field: sensitivityField.trim() || undefined,
        anonymous,
      });
      if (!result.ok) {
        if (result.status === 403) {
          // Write-time refusal (antitrust guard, spec 05 section 1, or group membership): explain
          // it, never just show a generic error. See the refusal render below the form.
          setRefusal({ message: result.error });
        } else {
          setError(result.error);
        }
        onError?.(result.error);
        return;
      }
      onPosted?.(result.post as unknown as CommunityPost);
      setTitle("");
      setBody("");
      setEntities([]);
      setSensitivityField("");
      setAnonymous(defaultAnonymous);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  // The candidate list is server-fetched (see this component's header). When the on-page candidate
  // set doesn't contain what the author is looking for, EntityPicker's search box round-trips
  // through `?entityQuery=` so the server widens the candidate set — no client-side entity search
  // API is invented for this.
  const handleEntitySearchSubmit = (query: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("entityQuery", query);
    router.push(`${pathname}?${params.toString()}`);
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

      <EntityPicker
        candidates={candidateEntities}
        value={entities}
        onChange={setEntities}
        onSearchSubmit={handleEntitySearchSubmit}
        disabled={busy}
      />

      {/* R8.7 (spec 07 Community, 2026-09-25, migration 336): identity is shown by default; this is
          the per-post opt-OUT. >=44px target on the shorter axis (law 2), label reachable by click
          (law 8: the control sits beside the content it affects, right above Post). */}
      <label
        htmlFor="post-anonymous"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
          fontSize: 12,
          color: "var(--color-text-secondary)",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        <input
          id="post-anonymous"
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          disabled={busy}
          style={{ width: 18, height: 18, cursor: busy ? "wait" : "pointer" }}
        />
        Post anonymously (your name and company are withheld; the verified-member mark still shows)
      </label>

      <div>
        <label
          htmlFor="post-sensitivity-field"
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--color-text-muted)",
          }}
        >
          Sensitive field this asserts a value for (optional — SAF premium, rate, capacity plan…)
        </label>
        <input
          id="post-sensitivity-field"
          type="text"
          value={sensitivityField}
          onChange={(e) => setSensitivityField(e.target.value)}
          disabled={busy}
          placeholder="e.g. saf_premium_usd_per_kg"
          style={{
            marginTop: 4,
            width: "100%",
            boxSizing: "border-box",
            background: "var(--color-bg-base)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "7px 10px",
            fontSize: 12,
            color: "var(--color-text-primary)",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <p style={{ margin: "3px 0 0", fontSize: 10.5, color: "var(--color-text-muted)", lineHeight: 1.4 }}>
          Naming a commercially sensitive field has the antitrust guard refuse the post, because an
          individual figure for it is never shared in a post (spec 05 section 1).
        </p>
      </div>

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
          {formatNumber(body.length)} / {formatNumber(MAX_BODY_LEN)} characters
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

      {refusal && (
        <div
          role="alert"
          style={{
            background: "var(--color-high-bg, #fff7ed)",
            border: "1px solid var(--color-high-border, #fed7aa)",
            borderLeft: "3px solid var(--color-high, #b45309)",
            borderRadius: 4,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-high, #b45309)", fontWeight: 700 }}>
            Post refused
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5 }}>
            {refusal.message}
          </p>
        </div>
      )}
    </form>
  );
}
