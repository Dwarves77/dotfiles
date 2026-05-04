"use client";

/**
 * CommunitySidebar — 280px Slack-style sidebar for /community/*.
 *
 * Sections (collapsible, each with a count and an optional "+" button):
 *   - Starred         (memberships where starred=true)
 *   - Private groups  (memberships where group.privacy='private')
 *   - Public forums   (memberships where group.privacy='public')
 *   - My topics       (user-defined community_topics with group counts)
 *   - Browse          (static links: All groups, Events, Vendor directory)
 *
 * Phase C scope:
 *   - NO Direct messages section (out of scope for Phase C and D).
 *   - Drag-to-reorder, right-click context menu — deferred.
 *   - Unread/mention badges render zero until the notifications wiring
 *     is hooked up (the data shape is in place, just no input yet).
 */

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Plus,
  Star,
  Lock,
  Globe,
  Hash,
  ListFilter,
  Calendar,
  Store,
  Settings as SettingsIcon,
} from "lucide-react";
import type {
  CommunityMembership,
  CommunityTopicSummary,
  CommunityCurrentUser,
} from "./types";

interface CommunitySidebarProps {
  currentUser: CommunityCurrentUser;
  memberships: CommunityMembership[];
  topics: CommunityTopicSummary[];
}

export function CommunitySidebar({
  currentUser,
  memberships,
  topics,
}: CommunitySidebarProps) {
  const starred = memberships.filter((m) => m.starred);
  const privateGroups = memberships.filter(
    (m) => !m.starred && m.group.privacy === "private"
  );
  const publicGroups = memberships.filter(
    (m) => !m.starred && m.group.privacy === "public"
  );

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        height: "calc(100vh - 3px)", // align with AppShell gradient bar
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-surface)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      {/* Head */}
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--color-text-muted)",
            textDecoration: "none",
            marginBottom: 10,
          }}
        >
          ← Back to Caro&apos;s Ledge
        </Link>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
            lineHeight: 1,
          }}
        >
          Community
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--color-text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginTop: 6,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {currentUser.name || "Operator"}
            {currentUser.employer ? ` · ${currentUser.employer}` : ""}
          </span>
          <Link
            href="/onboarding"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              color: "var(--color-text-secondary)",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            + Onboard
          </Link>
        </div>
      </div>

      {/* Filter / jump-to */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          placeholder="Jump to a group, channel, person…"
          aria-label="Filter sidebar"
          style={{
            width: "100%",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            background: "var(--color-bg-base)",
            padding: "7px 11px",
            fontFamily: "inherit",
            fontSize: 12,
            color: "var(--color-text-primary)",
            outline: 0,
          }}
        />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px 16px" }}>
        <SidebarSection label="Starred" count={starred.length}>
          {starred.length === 0 && <SidebarEmpty>Star a group to pin it here.</SidebarEmpty>}
          {starred.map((m) => (
            <GroupRow key={m.group_id} membership={m} accent="starred" />
          ))}
        </SidebarSection>

        <SidebarSection
          label="Private groups"
          count={privateGroups.length}
          actionHref="/community/browse?privacy=private"
        >
          {privateGroups.length === 0 && (
            <SidebarEmpty>You&apos;re not in any private groups yet.</SidebarEmpty>
          )}
          {privateGroups.map((m) => (
            <GroupRow key={m.group_id} membership={m} accent="private" />
          ))}
        </SidebarSection>

        <SidebarSection
          label="Public forums"
          count={publicGroups.length}
          actionHref="/community/browse?privacy=public"
        >
          {publicGroups.length === 0 && (
            <SidebarEmpty>Join a public forum from Browse.</SidebarEmpty>
          )}
          {publicGroups.map((m) => (
            <GroupRow key={m.group_id} membership={m} accent="public" />
          ))}
        </SidebarSection>

        <SidebarSection label="My topics" count={topics.length}>
          {topics.length === 0 && (
            <SidebarEmpty>Topics let you bundle groups under your own labels.</SidebarEmpty>
          )}
          {topics.map((t) => (
            <SidebarRow
              key={t.id}
              icon={<Hash size={14} />}
              label={t.label}
              trailing={
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--color-text-muted)",
                    fontWeight: 600,
                  }}
                >
                  {t.group_count} grp{t.group_count === 1 ? "" : "s"}
                </span>
              }
            />
          ))}
        </SidebarSection>

        <SidebarSection label="Browse">
          <SidebarRow
            href="/community/browse"
            icon={<ListFilter size={14} />}
            label="All groups"
          />
          <SidebarRow href="/events" icon={<Calendar size={14} />} label="Events" />
          <SidebarRow
            href="/vendors"
            icon={<Store size={14} />}
            label="Vendor directory"
          />
        </SidebarSection>
      </div>

      {/* Footer */}
      <div
        style={{
          flexShrink: 0,
          padding: "10px 14px",
          borderTop: "1px solid var(--color-border)",
          display: "grid",
          gridTemplateColumns: "30px 1fr auto",
          gap: 10,
          alignItems: "center",
        }}
      >
        <Avatar name={currentUser.name} headshotUrl={currentUser.headshotUrl} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.2,
              color: "var(--color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {currentUser.name || "Operator"}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--color-text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {currentUser.employer || currentUser.email}
          </div>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          style={{
            color: "var(--color-text-muted)",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <SettingsIcon size={14} />
        </Link>
      </div>
    </aside>
  );
}

// ════════════════════════════════════════════════════════════════
// Section primitive
// ════════════════════════════════════════════════════════════════

function SidebarSection({
  label,
  count,
  actionHref,
  children,
}: {
  label: string;
  count?: number;
  /** Optional URL for the "+" affordance shown next to the count. */
  actionHref?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px 4px",
          color: "var(--color-text-muted)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`Toggle ${label}`}
          style={{
            background: "transparent",
            border: 0,
            color: "inherit",
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <ChevronDown
            size={10}
            style={{
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 120ms ease",
            }}
          />
        </button>
        <span
          onClick={() => setOpen((v) => !v)}
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            flex: 1,
            cursor: "pointer",
          }}
        >
          {label}
        </span>
        {typeof count === "number" && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 999,
              background: "var(--color-bg-base)",
              color: "var(--color-text-muted)",
            }}
          >
            {count}
          </span>
        )}
        {actionHref && (
          <Link
            href={actionHref}
            aria-label={`Add to ${label}`}
            style={{
              color: "var(--color-text-muted)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <Plus size={12} />
          </Link>
        )}
      </div>
      {open && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            padding: "2px 0",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Row primitives
// ════════════════════════════════════════════════════════════════

interface SidebarRowProps {
  icon: React.ReactNode;
  label: string;
  href?: string;
  active?: boolean;
  trailing?: React.ReactNode;
  iconColor?: string;
}

function SidebarRow({
  icon,
  label,
  href,
  active,
  trailing,
  iconColor,
}: SidebarRowProps) {
  const content = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "22px 1fr auto",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 4,
        cursor: "pointer",
        background: active ? "var(--color-active-bg)" : undefined,
        color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "var(--color-bg-base)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: iconColor ?? "var(--color-text-muted)",
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "inherit",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {trailing}
      </span>
    </div>
  );
  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
        {content}
      </Link>
    );
  }
  return content;
}

function GroupRow({
  membership,
  accent,
}: {
  membership: CommunityMembership;
  accent: "starred" | "private" | "public";
}) {
  // Phase C ships without notification wiring — these zeros are
  // placeholders so the pill structure renders consistently. Once
  // notifications + read-state ship (Phase D), feed the real values
  // here from a server query of the notifications table.
  const unread = 0;
  const mentions = 0;

  let icon: React.ReactNode;
  let iconColor: string | undefined;
  if (accent === "starred") {
    icon = <Star size={14} fill="currentColor" />;
    iconColor = "var(--color-warning, #d97706)";
  } else if (accent === "private" || membership.group.privacy === "private") {
    icon = <Lock size={14} />;
    iconColor = "var(--color-high, var(--color-text-secondary))";
  } else {
    icon = <Globe size={14} />;
  }

  return (
    <SidebarRow
      href={`/community/groups/${membership.group.slug}`}
      icon={icon}
      iconColor={iconColor}
      label={membership.group.name}
      trailing={
        <>
          {mentions > 0 && (
            <span
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                padding: "1px 6px",
                borderRadius: 999,
                minWidth: 18,
                textAlign: "center",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {mentions}
            </span>
          )}
          {unread > 0 && (
            <span
              style={{
                background: "var(--color-critical)",
                color: "#fff",
                padding: "1px 6px",
                borderRadius: 999,
                minWidth: 18,
                textAlign: "center",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {unread}
            </span>
          )}
        </>
      }
    />
  );
}

function SidebarEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "4px 12px 6px",
        fontSize: 11,
        color: "var(--color-text-muted)",
        fontStyle: "italic",
      }}
    >
      {children}
    </div>
  );
}

function Avatar({
  name,
  headshotUrl,
}: {
  name: string;
  headshotUrl: string | null;
}) {
  if (headshotUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={headshotUrl}
        alt={name}
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          objectFit: "cover",
        }}
      />
    );
  }
  const initials =
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "??";
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        background: "var(--color-primary)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontSize: 12,
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
