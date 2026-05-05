"use client";

/**
 * GroupHeader — sticky header for /community/[slug] pages.
 *
 * Visual reference: design_handoff_2026-04/preview/community.html
 * `.group-head` block — icon plate, group name, privacy pill, member
 * count, weekly post count, last-active dot, role badge, and right-
 * aligned actions (Star toggle, Members button, Settings button).
 *
 * The Members and Settings buttons are stubs in C4 — the modals land
 * in C6/C7. The Star toggle is live and writes to
 * community_group_members.starred for the current user via
 * PATCH /api/community/groups/[id]/star.
 *
 * Phase C constraint: Members modal and Settings modal stubs render
 * a small toast on click rather than mounting empty modals. Once the
 * directory + admin tooling lands, swap the click handler to open the
 * relevant modal.
 */

import { useState } from "react";
import {
  Lock,
  Globe,
  Star,
  Users,
  Settings as SettingsIcon,
} from "lucide-react";
import type { CommunityGroupSummary } from "./types";

interface GroupHeaderProps {
  group: CommunityGroupSummary & { description?: string | null };
  membership:
    | {
        role: "admin" | "moderator" | "member";
        starred: boolean;
      }
    | null;
  /** Optional toast hook (parent owns the Toast component). */
  onToast?: (message: string) => void;
}

export function GroupHeader({ group, membership, onToast }: GroupHeaderProps) {
  const [starred, setStarred] = useState<boolean>(membership?.starred ?? false);
  const [busyStar, setBusyStar] = useState(false);

  const isPrivate = group.privacy === "private";
  const role = membership?.role;
  const isAdmin = role === "admin";

  // Last-active dot: green within 7 days, muted otherwise. (Same heuristic
  // as GroupCard — keep them in sync.)
  const recent =
    Date.now() - new Date(group.last_active_at).getTime() <
    7 * 24 * 60 * 60 * 1000;

  // Icon plate label — region code if 2-3 chars, otherwise initials.
  const iconLabel =
    group.region && group.region.length <= 3
      ? group.region
      : (group.name
          .split(/\s+/)
          .map((p) => p[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase() || "?");

  const toggleStar = async () => {
    if (!membership || busyStar) return;
    const next = !starred;
    setStarred(next); // optimistic
    setBusyStar(true);
    try {
      const res = await fetch(`/api/community/groups/${group.id}/star`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ starred: next }),
      });
      if (!res.ok) {
        setStarred(!next); // revert
        const j = await safeJson(res);
        onToast?.(j?.error || `Could not ${next ? "star" : "unstar"} group`);
      } else {
        onToast?.(next ? "Group starred" : "Star removed");
      }
    } catch {
      setStarred(!next);
      onToast?.("Network error");
    } finally {
      setBusyStar(false);
    }
  };

  return (
    <header
      style={{
        background: isPrivate
          ? "linear-gradient(180deg, var(--color-high-bg, #fff7ed) 0%, var(--color-bg-surface) 70%)"
          : "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: isPrivate
          ? "3px solid var(--color-high, #b45309)"
          : "3px solid var(--color-low, var(--color-primary))",
        borderRadius: 6,
        padding: "18px 22px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 50,
          height: 50,
          borderRadius: 8,
          background: isPrivate
            ? "var(--color-high-bg, #fff7ed)"
            : "var(--color-bg-base)",
          border: `1px solid ${
            isPrivate
              ? "var(--color-high-border, #fed7aa)"
              : "var(--color-border)"
          }`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isPrivate
            ? "var(--color-high, #b45309)"
            : "var(--color-text-secondary)",
          fontFamily: "var(--font-display)",
          fontSize: 18,
          letterSpacing: "0.04em",
          flexShrink: 0,
        }}
      >
        {iconLabel}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 400,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            lineHeight: 1,
            margin: "0 0 6px",
            color: "var(--color-text-primary)",
          }}
        >
          {group.name}
        </h1>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-text-secondary)",
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <PrivacyPill privacy={group.privacy} />
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
            new post{group.weekly_post_count === 1 ? "" : "s"} this week
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
            {recent ? "Active" : "Quiet"}
          </span>
          {role && <RoleBadge role={role} />}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {membership && (
          <IconButton
            label={starred ? "Unstar group" : "Star group"}
            onClick={toggleStar}
            disabled={busyStar}
            active={starred}
          >
            <Star
              size={14}
              fill={starred ? "currentColor" : "none"}
              strokeWidth={2}
            />
          </IconButton>
        )}
        <IconButton
          label="Members"
          onClick={() => onToast?.("Members directory ships in C6")}
        >
          <Users size={14} />
        </IconButton>
        {isAdmin && (
          <IconButton
            label="Group settings"
            onClick={() => onToast?.("Group settings ship in C6")}
          >
            <SettingsIcon size={14} />
          </IconButton>
        )}
      </div>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════
// Subcomponents
// ════════════════════════════════════════════════════════════════

function PrivacyPill({ privacy }: { privacy: "public" | "private" }) {
  if (privacy === "private") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "2px 7px",
          borderRadius: 3,
          color: "var(--color-high, #b45309)",
          border: "1px solid var(--color-high-border, #fed7aa)",
          background: "transparent",
        }}
      >
        <Lock size={10} />
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
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 3,
        color: "var(--color-low, #15803d)",
        border: "1px solid var(--color-low-border, #a7f3d0)",
        background: "transparent",
      }}
    >
      <Globe size={10} />
      Public
    </span>
  );
}

function RoleBadge({ role }: { role: "admin" | "moderator" | "member" }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "2px 6px",
        borderRadius: 3,
        background:
          role === "admin"
            ? "var(--color-text-primary)"
            : role === "moderator"
            ? "var(--color-bg-base)"
            : "var(--color-bg-base)",
        color:
          role === "admin"
            ? "var(--color-bg-base)"
            : "var(--color-text-secondary)",
        border:
          role === "admin"
            ? "0"
            : "1px solid var(--color-border)",
      }}
    >
      {role}
    </span>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        background: active ? "var(--color-bg-base)" : "transparent",
        border: "1px solid var(--color-border)",
        color: active
          ? "var(--color-warning, #d97706)"
          : "var(--color-text-secondary)",
        borderRadius: 4,
        padding: "7px 9px",
        display: "inline-flex",
        alignItems: "center",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
