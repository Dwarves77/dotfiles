"use client";

/**
 * CommunityShell — top-level layout for /community/* routes.
 *
 * Why this exists separate from AppShell:
 *   The community surface uses a Slack-style 280px sidebar specific to
 *   community navigation (starred groups, private groups, public forums,
 *   topics, browse). The global Sidebar (Dashboard/Regulations/Map…)
 *   would compete with it. Instead of branching AppShell, we LAYER:
 *
 *     1. AppShell renders normally (its <Sidebar /> mounts).
 *     2. On mount we set body[data-side="community"]; on unmount we
 *        clear it. A scoped <style jsx global> rule keyed to that
 *        attribute hides the global sidebar (and its mobile burger),
 *        and pulls the main content margin/padding back to zero so
 *        our community sidebar can sit flush.
 *
 *   This keeps AppShell.tsx untouched (no /community-aware special
 *   case in the global shell) and is reversible: navigating away
 *   restores the default layout.
 *
 * Layout when active:
 *   [ CommunitySidebar 280px ][ Main: masthead → region tabs → body ]
 *
 * Body slot accepts children. The /community/ default body renders
 * the empty-state + invitations panel (see EmptyStateBody below).
 */

import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { CommunitySidebar } from "./CommunitySidebar";
import { CommunityMasthead } from "./CommunityMasthead";
import { CommunityRegionTabs } from "./CommunityRegionTabs";
import { Toast } from "@/components/ui/Toast";
import type {
  CommunityCurrentUser,
  CommunityInvitation,
  CommunityMembership,
  CommunityRegion,
  CommunityTopicSummary,
} from "./types";

interface CommunityShellProps {
  currentUser: CommunityCurrentUser;
  memberships: CommunityMembership[];
  invitations: CommunityInvitation[];
  topics: CommunityTopicSummary[];
  regions: CommunityRegion[];
  regionCounts: Record<string, number>;
  initialRegion: string;
  /** Optional — when omitted we render the empty/invitation default body. */
  children?: ReactNode;
}

export function CommunityShell({
  currentUser,
  memberships,
  invitations,
  topics,
  regions,
  regionCounts,
  initialRegion,
  children,
}: CommunityShellProps) {
  // ── Sidebar swap: tag the body so our scoped CSS hides the global one. ──
  useEffect(() => {
    const prev = document.body.getAttribute("data-side");
    document.body.setAttribute("data-side", "community");
    return () => {
      if (prev !== null) {
        document.body.setAttribute("data-side", prev);
      } else {
        document.body.removeAttribute("data-side");
      }
    };
  }, []);

  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  const showToast = (message: string) =>
    setToast({ message, visible: true });

  return (
    <div
      style={{
        display: "flex",
        minHeight: "calc(100vh - 3px)", // AppShell renders the 3px gradient bar
        backgroundColor: "var(--color-bg-base)",
      }}
    >
      <CommunitySidebar
        currentUser={currentUser}
        memberships={memberships}
        topics={topics}
      />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <CommunityMasthead onSearchSubmit={() => showToast("Search rolling out — Phase D")} />
        <CommunityRegionTabs
          regions={regions}
          counts={regionCounts}
          initialRegion={initialRegion}
        />

        <div style={{ flex: 1, padding: "28px 36px", minWidth: 0 }}>
          {children ?? (
            <CommunityDefaultBody
              memberships={memberships}
              invitations={invitations}
              currentUserName={currentUser.name}
            />
          )}
        </div>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />

      {/*
        ── Sidebar swap CSS ──
        Hides the global AppShell <Sidebar/> and its mobile burger when
        body[data-side="community"]. Targets the desktop <aside> via the
        signature class set ("h-screen sticky") rather than a bespoke
        selector that would require touching AppShell.tsx. We render a
        plain <style> element rather than styled-jsx (which is not
        configured in this app) — the rule is small and global by design.
      */}
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            body[data-side="community"] aside.h-screen.sticky {
              display: none !important;
            }
            body[data-side="community"] button[aria-label="Toggle navigation"] {
              display: none !important;
            }
          `,
        }}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Default body — invitations panel + empty state
// ════════════════════════════════════════════════════════════════

interface CommunityDefaultBodyProps {
  memberships: CommunityMembership[];
  invitations: CommunityInvitation[];
  currentUserName: string;
}

function CommunityDefaultBody({
  memberships,
  invitations,
  currentUserName,
}: CommunityDefaultBodyProps) {
  const hasGroups = memberships.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 880 }}>
      {invitations.length > 0 && (
        <InvitationsPanel invitations={invitations} />
      )}
      {!hasGroups && (
        <EmptyState invitationCount={invitations.length} />
      )}
      {hasGroups && (
        <MembershipsPreview
          memberships={memberships}
          currentUserName={currentUserName}
        />
      )}
    </div>
  );
}

function InvitationsPanel({ invitations }: { invitations: CommunityInvitation[] }) {
  return (
    <section
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: "3px solid var(--color-primary)",
        borderRadius: 8,
        padding: "18px 22px",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 18,
          fontWeight: 400,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--color-text-primary)",
          margin: "0 0 4px",
        }}
      >
        Pending invitations ({invitations.length})
      </h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          margin: "0 0 14px",
        }}
      >
        Group admins have invited you to join. Accept to gain access; decline to
        dismiss.
      </p>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {invitations.map((inv) => (
          <InvitationRow key={inv.id} invitation={inv} />
        ))}
      </ul>
    </section>
  );
}

function InvitationRow({ invitation }: { invitation: CommunityInvitation }) {
  const [busy, setBusy] = useState<"idle" | "accepting" | "declining" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const respond = async (action: "accept" | "decline") => {
    setBusy(action === "accept" ? "accepting" : "declining");
    setError(null);
    try {
      const res = await fetch(
        `/api/community/invitations/${invitation.id}/${action}`,
        { method: "POST" }
      );
      if (!res.ok) {
        // C4 ships these endpoints; until then they 404.
        throw new Error(
          res.status === 404
            ? "Invitations API not live yet — wiring up in C4."
            : `Request failed (${res.status}).`
        );
      }
      setBusy("done");
    } catch (e: any) {
      setError(e?.message ?? "Failed");
      setBusy("idle");
    }
  };

  if (busy === "done") {
    return (
      <li
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          padding: "10px 12px",
          border: "1px dashed var(--color-border)",
          borderRadius: 6,
        }}
      >
        Response recorded for <b>{invitation.group.name}</b>.
      </li>
    );
  }

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        background: "var(--color-bg-base)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          {invitation.group.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          {invitation.group.privacy === "private" ? "Private group" : "Public forum"}
          {" · "}
          {invitation.group.region}
        </div>
        {error && (
          <div
            style={{
              fontSize: 11,
              color: "var(--color-error, #c0392b)",
              marginTop: 4,
            }}
          >
            {error}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => respond("accept")}
        disabled={busy !== "idle"}
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          padding: "6px 12px",
          background: "var(--color-invert-bg, var(--color-text-primary))",
          color: "var(--color-invert-text, var(--color-bg-base))",
          border: 0,
          borderRadius: 4,
          cursor: busy === "idle" ? "pointer" : "not-allowed",
          opacity: busy === "idle" ? 1 : 0.5,
        }}
      >
        {busy === "accepting" ? "…" : "Accept"}
      </button>
      <button
        type="button"
        onClick={() => respond("decline")}
        disabled={busy !== "idle"}
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          padding: "6px 12px",
          background: "transparent",
          color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          cursor: busy === "idle" ? "pointer" : "not-allowed",
          opacity: busy === "idle" ? 1 : 0.5,
        }}
      >
        {busy === "declining" ? "…" : "Decline"}
      </button>
    </li>
  );
}

function EmptyState({ invitationCount }: { invitationCount: number }) {
  return (
    <section
      style={{
        background: "var(--color-bg-surface)",
        border: "1px dashed var(--color-border)",
        borderRadius: 8,
        padding: "48px 32px",
        textAlign: "center",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 400,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--color-text-primary)",
          margin: "0 0 8px",
        }}
      >
        No groups yet
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "var(--color-text-secondary)",
          margin: "0 0 20px",
          lineHeight: 1.55,
        }}
      >
        {invitationCount > 0
          ? "Accept an invitation above, or browse the public forums to find peers."
          : "Browse public forums or accept an invitation to start collaborating with peers across the industry."}
      </p>
      <div style={{ display: "inline-flex", gap: 10 }}>
        <Link
          href="/community/browse"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 18px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            background: "var(--color-invert-bg, var(--color-text-primary))",
            color: "var(--color-invert-text, var(--color-bg-base))",
            border: 0,
            borderRadius: 4,
            textDecoration: "none",
          }}
        >
          Browse groups
        </Link>
        <Link
          href="/onboarding"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 18px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            background: "transparent",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            textDecoration: "none",
          }}
        >
          Onboard
        </Link>
      </div>
    </section>
  );
}

function MembershipsPreview({
  memberships,
  currentUserName,
}: {
  memberships: CommunityMembership[];
  currentUserName: string;
}) {
  // Group-detail feeds are live at /community/[slug]. Sort starred-first,
  // then alphabetical, and surface a cross-link to the most recently
  // active group so users have a clear next click.
  const sorted = useMemo(
    () =>
      [...memberships].sort((a, b) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return a.group.name.localeCompare(b.group.name);
      }),
    [memberships]
  );

  // Most recently active group (by group.last_active_at) — used for the
  // "Jump back in" cross-link when one is available.
  const recentlyActive = useMemo(() => {
    const withActivity = memberships.filter((m) => m.group.last_active_at);
    if (withActivity.length === 0) return null;
    return [...withActivity].sort(
      (a, b) =>
        new Date(b.group.last_active_at).getTime() -
        new Date(a.group.last_active_at).getTime()
    )[0];
  }, [memberships]);

  return (
    <section>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 400,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--color-text-primary)",
          margin: "0 0 8px",
        }}
      >
        Welcome back, {currentUserName || "operator"}
      </h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          margin: "0 0 12px",
        }}
      >
        Pick a group from the sidebar, or{" "}
        <Link
          href="/community/browse"
          style={{ color: "var(--color-primary)", textDecoration: "underline" }}
        >
          browse all groups
        </Link>
        {recentlyActive && (
          <>
            {" · "}
            <Link
              href={`/community/${recentlyActive.group.slug}`}
              style={{ color: "var(--color-primary)", textDecoration: "underline" }}
            >
              jump back into {recentlyActive.group.name}
            </Link>
          </>
        )}
        .
      </p>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 10,
        }}
      >
        {sorted.map((m) => (
          <li
            key={m.group_id}
            style={{
              padding: "12px 14px",
              border: "1px solid var(--color-border)",
              borderLeft:
                m.group.privacy === "private"
                  ? "3px solid var(--color-high, var(--color-text-primary))"
                  : "3px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-bg-surface)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                marginBottom: 2,
              }}
            >
              {m.group.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {m.group.privacy === "private" ? "Private" : "Public"}
              {" · "}
              {m.group.region}
              {" · "}
              {m.group.member_count} member{m.group.member_count === 1 ? "" : "s"}
              {m.role !== "member" && (
                <>
                  {" · "}
                  <span style={{ textTransform: "uppercase", fontWeight: 700 }}>
                    {m.role}
                  </span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
