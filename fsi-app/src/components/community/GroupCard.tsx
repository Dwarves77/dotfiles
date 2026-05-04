"use client";

/**
 * GroupCard — a single community group tile in the /community/browse grid.
 *
 * Visual reference: design_handoff_2026-04/preview/community.html — the
 * group-head pattern (icon plate + name + meta row) collapsed to a card
 * footprint with a CTA at the bottom.
 *
 * CTA state machine (driven by `membershipState` × `group.privacy`):
 *
 *   member       → "Joined" (disabled, low/green tint)
 *   pending      → "Pending acceptance" (disabled, high/amber tint)
 *   none + public  → "Join" (active, primary)
 *   none + private → "Request to join" (disabled, with tooltip)
 *
 * Phase C ships browse with public groups only (the page-level filter),
 * but the private+none branch is wired in case a future surface lists
 * private groups the caller can see (e.g. groups they were invited to
 * and dismissed without joining).
 *
 * Network: POST /api/community/groups/[id]/join (public-only). Cookie
 * session is sent by default; no Authorization header required.
 */

import { useState } from "react";
import Link from "next/link";
import { Lock, Globe, CheckCircle2, Hourglass } from "lucide-react";
import type { CommunityGroupSummary } from "./types";

export type GroupCardMembershipState = "member" | "pending-invite" | "none";

interface GroupCardProps {
  group: CommunityGroupSummary & { description?: string | null };
  membershipState: GroupCardMembershipState;
  /** Optional callback fired after a successful join (e.g. for parent toasts). */
  onJoined?: (groupId: string) => void;
  /** Optional callback fired on join error. */
  onError?: (message: string) => void;
}

export function GroupCard({
  group,
  membershipState,
  onJoined,
  onError,
}: GroupCardProps) {
  const [state, setState] = useState<GroupCardMembershipState>(membershipState);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isPrivate = group.privacy === "private";

  // ── Last-active dot ────────────────────────────────────────────
  // 7-day window: dot is green if last_active_at is within the last
  // 7 days, otherwise muted. Phase C uses a static heuristic; the
  // real "online now" indicator lands with C7 notifications.
  const lastActive = new Date(group.last_active_at);
  const recent = Date.now() - lastActive.getTime() < 7 * 24 * 60 * 60 * 1000;

  const handleJoin = async () => {
    if (busy || state !== "none" || isPrivate) return;
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fetch(`/api/community/groups/${group.id}/join`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await safeJson(res);
        const msg =
          j?.error ||
          (res.status === 403
            ? "Private group requires invitation"
            : `Could not join (${res.status})`);
        setLocalError(msg);
        onError?.(msg);
        setBusy(false);
        return;
      }
      setState("member");
      onJoined?.(group.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: isPrivate
          ? "3px solid var(--color-high, var(--color-text-primary))"
          : "3px solid var(--color-low, var(--color-primary))",
        borderRadius: 6,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 200,
      }}
    >
      {/* Head — name + privacy pill */}
      <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Link
          href={`/community/${group.slug}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {group.name}
          </h3>
        </Link>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignItems: "center",
          }}
        >
          <PrivacyPill privacy={group.privacy} />
          <RegionPill region={group.region} />
        </div>
      </header>

      {/* Description */}
      {group.description && (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--color-text-secondary)",
            lineHeight: 1.55,
            margin: 0,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {group.description}
        </p>
      )}

      {/* Meta */}
      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          marginTop: "auto",
        }}
      >
        <span>
          <b style={{ color: "var(--color-text-primary)" }}>
            {group.member_count}
          </b>{" "}
          member{group.member_count === 1 ? "" : "s"}
        </span>
        <span>
          <b style={{ color: "var(--color-text-primary)" }}>
            {group.weekly_post_count}
          </b>{" "}
          post{group.weekly_post_count === 1 ? "" : "s"} this week
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: recent
                ? "var(--color-low, #16a34a)"
                : "var(--color-text-muted)",
              display: "inline-block",
            }}
          />
          {recent ? "Active recently" : "Quiet"}
        </span>
      </div>

      {localError && (
        <div
          role="alert"
          style={{
            fontSize: 11,
            color: "var(--color-error, #c0392b)",
            padding: "4px 0",
          }}
        >
          {localError}
        </div>
      )}

      {/* CTA */}
      <CTA
        state={state}
        privacy={group.privacy}
        busy={busy}
        onJoin={handleJoin}
      />
    </article>
  );
}

// ════════════════════════════════════════════════════════════════
// CTA button
// ════════════════════════════════════════════════════════════════

function CTA({
  state,
  privacy,
  busy,
  onJoin,
}: {
  state: GroupCardMembershipState;
  privacy: "public" | "private";
  busy: boolean;
  onJoin: () => void;
}) {
  if (state === "member") {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        style={{
          ...ctaBaseStyle,
          background: "var(--color-low-bg, #ecfdf5)",
          border: "1px solid var(--color-low-border, #a7f3d0)",
          color: "var(--color-low, #15803d)",
          cursor: "default",
        }}
      >
        <CheckCircle2 size={13} />
        Joined
      </button>
    );
  }

  if (state === "pending-invite") {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        style={{
          ...ctaBaseStyle,
          background: "var(--color-high-bg, #fff7ed)",
          border: "1px solid var(--color-high-border, #fed7aa)",
          color: "var(--color-high, #b45309)",
          cursor: "default",
        }}
      >
        <Hourglass size={13} />
        Pending acceptance
      </button>
    );
  }

  // state === "none"
  if (privacy === "private") {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Private group — invitation required"
        style={{
          ...ctaBaseStyle,
          background: "transparent",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-muted)",
          cursor: "not-allowed",
        }}
      >
        <Lock size={13} />
        Request to join
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onJoin}
      disabled={busy}
      style={{
        ...ctaBaseStyle,
        background: busy
          ? "var(--color-bg-base)"
          : "var(--color-invert-bg, var(--color-text-primary))",
        color: "var(--color-invert-text, var(--color-bg-base))",
        border: 0,
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? "Joining…" : "Join"}
    </button>
  );
}

const ctaBaseStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "9px 16px",
  borderRadius: 4,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  width: "100%",
};

// ════════════════════════════════════════════════════════════════
// Pills
// ════════════════════════════════════════════════════════════════

function PrivacyPill({ privacy }: { privacy: "public" | "private" }) {
  if (privacy === "private") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          padding: "3px 7px",
          borderRadius: 3,
          background: "var(--color-high-bg, #fff7ed)",
          color: "var(--color-high, #b45309)",
          border: "1px solid var(--color-high-border, #fed7aa)",
        }}
      >
        <Lock size={9} />
        Private · Invite-only
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: "3px 7px",
        borderRadius: 3,
        background: "var(--color-low-bg, #ecfdf5)",
        color: "var(--color-low, #15803d)",
        border: "1px solid var(--color-low-border, #a7f3d0)",
      }}
    >
      <Globe size={9} />
      Public
    </span>
  );
}

function RegionPill({ region }: { region: string }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: "3px 7px",
        borderRadius: 3,
        background: "var(--color-bg-base)",
        color: "var(--color-text-muted)",
        border: "1px solid var(--color-border)",
      }}
    >
      {region}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════
// Util
// ════════════════════════════════════════════════════════════════

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
