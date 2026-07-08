"use client";

/**
 * CommunityRooms — redesign TEMPLATE 11 client surface.
 *
 * Binds to "Pages - 11 Community": regional rooms grid → selected-room panel
 * (header + Join/Leave, "Live in this region" ledger, Discussions composer +
 * thread cards) → rail (Who's here, Why post here → Admin pickups, Verifier
 * sign-off, Vertical groups pending frame).
 *
 * Data-bearing values arrive computed from the page (no mock snapshots).
 * Everything here is presentation + interaction against the existing
 * conversation-layer endpoints:
 *   - Post:  POST /api/community/posts
 *   - Reply: POST /api/community/posts/[id]/replies
 *   - Delete:DELETE /api/community/posts/[id]
 *   - Join:  POST /api/community/groups/[id]/join
 *   - Leave: self-DELETE on community_group_members (RLS, browser client)
 *   - Cite:  browser-client update of community_posts.referenced_intelligence_item_ids
 *   - Sign-off request:  POST /api/community/posts/[id]/signoff
 *   - Verifier decision:  POST /api/community/signoff/[id]/decide
 *   - Withdraw own request: POST /api/community/signoff/[id]/withdraw
 * Sign-off is LIVE against community_post_signoff_requests (migration 153):
 * the "Request verifier sign-off" card action opens a request, the rail panel
 * shows the user's open requests (withdraw) and, for active verifiers, a decide
 * queue. A post shows the verified/signed-off chip ONLY when signed_off_at is
 * set (a real field) — never fabricated.
 *
 * Colors/px lifted from the mock, expressed through the T02/T11 semantic
 * tokens — no raw hex in this component.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { RoomKey } from "@/lib/community/rooms";

export interface LiveItemVM {
  id: string;
  title: string;
  meta: string;
  href: string;
}

export interface ThreadVM {
  id: string;
  groupId: string;
  title: string;
  body: string;
  replyCount: number;
  createdAt: string;
  referencedItemIds: string[];
  authorName: string;
  isYou: boolean;
  isOwner: boolean;
  /** Titles+hrefs for citations attached this session (optimistic display). */
  citedLive?: { title: string; href: string }[];
  /** True only when community_posts.signed_off_at is set (real field). */
  signedOff: boolean;
  signedOffAt?: string | null;
  /**
   * The caller-visible sign-off request for this post (RLS-scoped: the caller's
   * own request always; every request for an active verifier / admin). Null
   * when none is visible.
   */
  signoff?: {
    requestId: string;
    status: "pending" | "signed_off" | "declined" | "withdrawn";
    isMine: boolean;
    requesterName: string;
  } | null;
}

export interface RosterMemberVM {
  name: string;
  isYou: boolean;
  isOwner: boolean;
}

export interface RoomVM {
  key: RoomKey;
  name: string;
  short: string;
  groupId: string | null;
  joined: boolean;
  youHere: boolean;
  itemCount: number;
  itemCountKnown: boolean;
  hue: "critical" | "high" | "moderate" | "low";
  themes: string[];
  liveItems: LiveItemVM[];
  threads: ThreadVM[];
  roster: RosterMemberVM[];
}

/** A member-created cross-regional vertical group (region GLOBAL, vertical set). */
export interface VerticalGroupVM {
  id: string;
  slug: string;
  name: string;
  vertical: string;
  verticalLabel: string;
  description: string | null;
  memberCount: number;
  youOwn: boolean;
}

interface CommunityRoomsProps {
  rooms: RoomVM[];
  seeded: boolean;
  currentUserId: string;
  currentUserName: string;
  currentUserIsOwner: boolean;
  currentUserIsVerifier: boolean;
  verifierStatus: string;
  networkMemberCount: number;
  pendingPickups: number;
  /** Member-created vertical groups (cross-regional, cargo-vertical). */
  verticalGroups: VerticalGroupVM[];
  /** Cargo-vertical options for the create picker: {id, label}. */
  verticalOptions: { id: string; label: string }[];
}

const HUE_VAR: Record<RoomVM["hue"], string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  moderate: "var(--sev-moderate)",
  low: "var(--sev-low)",
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── shared token style fragments ──
const EYEBROW: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  margin: 0,
};
const CARD: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  overflow: "hidden",
};
const PLATE_HEAD: React.CSSProperties = {
  background: "var(--color-surface-raised)",
  borderBottom: "1px solid var(--border-sub)",
};

export function CommunityRooms({
  rooms,
  seeded,
  currentUserId,
  currentUserName,
  currentUserIsOwner,
  currentUserIsVerifier,
  verifierStatus,
  networkMemberCount,
  pendingPickups,
  verticalGroups,
  verticalOptions,
}: CommunityRoomsProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Local mutable copy so posts/joins/deletes reflect immediately.
  const [roomState, setRoomState] = useState<RoomVM[]>(rooms);
  // Local copy of the vertical groups so a just-created group appears at once.
  const [groupState, setGroupState] = useState<VerticalGroupVM[]>(verticalGroups);
  const [createOpen, setCreateOpen] = useState(false);
  const initialKey =
    rooms.find((r) => r.youHere)?.key ?? rooms[0]?.key ?? ("EU" as RoomKey);
  const [selectedKey, setSelectedKey] = useState<RoomKey>(initialKey);
  const [draft, setDraft] = useState("");
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({});
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [citeOpen, setCiteOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = roomState.find((r) => r.key === selectedKey) ?? roomState[0];

  const yourRoomCount = roomState.filter((r) => r.youHere || r.joined).length;
  const totalItems = roomState.reduce((s, r) => s + r.itemCount, 0);

  function patchRoom(key: RoomKey, patch: Partial<RoomVM>) {
    setRoomState((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // Create a member-owned vertical group and show it immediately. Returns an
  // error string on failure (rendered inside the modal), or null on success.
  async function doCreateGroup(input: {
    name: string;
    vertical: string;
    description: string;
  }): Promise<string | null> {
    try {
      const res = await fetch("/api/community/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data?.error || "Could not create the group.";
      const g = data?.group;
      if (!g?.id) return "Group creation returned no row.";
      const label =
        verticalOptions.find((o) => o.id === g.vertical)?.label ?? g.vertical;
      setGroupState((prev) => [
        {
          id: g.id,
          slug: g.slug,
          name: g.name,
          vertical: g.vertical,
          verticalLabel: label,
          description: g.description ?? null,
          memberCount: g.member_count ?? 1,
          youOwn: true,
        },
        ...prev,
      ]);
      setNotice(`Group "${g.name}" created — you own it.`);
      return null;
    } catch {
      return "Network error creating the group.";
    }
  }

  // ── actions ──
  async function doPost() {
    const text = draft.trim();
    if (!text || !selected?.groupId || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          group_id: selected.groupId,
          title: text.slice(0, 200),
          body: text,
        }),
      });
      if (!res.ok) throw new Error(`post failed (${res.status})`);
      const { post } = await res.json();
      const vm: ThreadVM = {
        id: post.id,
        groupId: selected.groupId,
        title: post.title ?? text.slice(0, 200),
        body: post.body ?? text,
        replyCount: 0,
        createdAt: post.created_at ?? new Date().toISOString(),
        referencedItemIds: [],
        authorName: currentUserName,
        isYou: true,
        isOwner: currentUserIsOwner,
        signedOff: false,
        signoff: null,
      };
      patchRoom(selected.key, { threads: [vm, ...selected.threads] });
      setDraft("");
    } catch {
      setNotice("Could not post — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(thread: ThreadVM) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/community/posts/${thread.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error();
      patchRoom(selected.key, {
        threads: selected.threads.filter((t) => t.id !== thread.id),
      });
    } catch {
      setNotice("Could not delete the post.");
    } finally {
      setBusy(false);
    }
  }

  async function doReply(thread: ThreadVM) {
    const text = (replyDraft[thread.id] ?? "").trim();
    if (!text || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/community/posts/${thread.id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error();
      patchRoom(selected.key, {
        threads: selected.threads.map((t) =>
          t.id === thread.id ? { ...t, replyCount: t.replyCount + 1 } : t
        ),
      });
      setReplyDraft((p) => ({ ...p, [thread.id]: "" }));
      setReplyOpen((p) => ({ ...p, [thread.id]: false }));
    } catch {
      setNotice("Could not post the reply.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleJoin() {
    if (!selected?.groupId || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (selected.joined) {
        // Leave — self-delete membership (RLS-allowed), no dedicated endpoint.
        const { error } = await supabase
          .from("community_group_members")
          .delete()
          .eq("group_id", selected.groupId)
          .eq("user_id", currentUserId);
        if (error) throw error;
        patchRoom(selected.key, { joined: false });
      } else {
        const res = await fetch(`/api/community/groups/${selected.groupId}/join`, {
          method: "POST",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error();
        patchRoom(selected.key, { joined: true });
      }
    } catch {
      setNotice("Could not update your membership.");
    } finally {
      setBusy(false);
    }
  }

  async function citeSource(thread: ThreadVM, item: LiveItemVM) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const next = Array.from(new Set([...(thread.referencedItemIds ?? []), item.id]));
      const { error } = await supabase
        .from("community_posts")
        .update({ referenced_intelligence_item_ids: next })
        .eq("id", thread.id);
      if (error) throw error;
      patchRoom(selected.key, {
        threads: selected.threads.map((t) =>
          t.id === thread.id
            ? {
                ...t,
                referencedItemIds: next,
                citedLive: [...(t.citedLive ?? []), { title: item.title, href: item.href }],
              }
            : t
        ),
      });
      setCiteOpen((p) => ({ ...p, [thread.id]: false }));
    } catch {
      setNotice("Could not attach the source.");
    } finally {
      setBusy(false);
    }
  }

  function patchThread(threadId: string, patch: Partial<ThreadVM>) {
    if (!selected) return;
    patchRoom(selected.key, {
      threads: selected.threads.map((t) =>
        t.id === threadId ? { ...t, ...patch } : t
      ),
    });
  }

  // ── sign-off lifecycle (migration 153) ──
  async function requestSignoff(thread: ThreadVM) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/community/posts/${thread.id}/signoff`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.status === 409) {
        setNotice("A verifier sign-off request is already open for this post.");
        return;
      }
      if (!res.ok) throw new Error();
      const { request } = await res.json();
      patchThread(thread.id, {
        signoff: {
          requestId: request.id,
          status: "pending",
          isMine: true,
          requesterName: currentUserName,
        },
      });
    } catch {
      setNotice("Could not request sign-off — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function withdrawSignoff(thread: ThreadVM) {
    if (busy || !thread.signoff) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/community/signoff/${thread.signoff.requestId}/withdraw`,
        { method: "POST", credentials: "same-origin" }
      );
      if (!res.ok) throw new Error();
      patchThread(thread.id, { signoff: null });
    } catch {
      setNotice("Could not withdraw the request.");
    } finally {
      setBusy(false);
    }
  }

  async function decideSignoff(thread: ThreadVM, decision: "signed_off" | "declined") {
    if (busy || !thread.signoff) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/community/signoff/${thread.signoff.requestId}/decide`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ decision }),
        }
      );
      if (!res.ok) throw new Error();
      if (decision === "signed_off") {
        patchThread(thread.id, {
          signedOff: true,
          signedOffAt: new Date().toISOString(),
          signoff: { ...thread.signoff, status: "signed_off" },
        });
      } else {
        patchThread(thread.id, {
          signoff: { ...thread.signoff, status: "declined" },
        });
      }
    } catch {
      setNotice("Could not record the decision.");
    } finally {
      setBusy(false);
    }
  }

  // ── render ──
  return (
    <div style={{ padding: "28px 36px 80px" }}>
      {notice && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 6,
            border: "1px solid var(--sev-critical)",
            background: "var(--color-critical-bg)",
            color: "var(--sev-critical)",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {notice}
        </div>
      )}

      {/* ══ Region rooms header ══ */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          borderBottom: "2px solid var(--text)",
          padding: "0 0 8px",
          margin: "0 0 14px",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: 26,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            margin: 0,
            color: "var(--text)",
          }}
        >
          Regional rooms
        </h2>
        {seeded && (
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            <b style={{ color: "var(--text)" }}>{totalItems} active items</b> across{" "}
            {roomState.length} rooms · you&rsquo;re in{" "}
            <b style={{ color: "var(--color-primary)" }}>{yourRoomCount}</b>
          </span>
        )}
      </div>

      {!seeded ? (
        <NotSeededState pendingPickups={pendingPickups} verifierStatus={verifierStatus} />
      ) : (
        <>
          {/* ══ Rooms grid ══ */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))",
              gap: 12,
              margin: "0 0 22px",
            }}
          >
            {roomState.map((r) => {
              const isSel = r.key === selectedKey;
              const here = r.youHere || r.joined;
              const t = r.threads.length;
              return (
                <button
                  key={r.key}
                  onClick={() => {
                    setSelectedKey(r.key);
                    setDraft("");
                  }}
                  aria-pressed={isSel}
                  style={{
                    fontFamily: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    background: isSel ? "var(--room-selected-bg)" : "var(--surface)",
                    borderRadius: 8,
                    padding: "12px 14px",
                    border: isSel
                      ? "2px solid var(--color-primary)"
                      : "1px solid var(--color-border)",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 15,
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                        color: "var(--text)",
                      }}
                    >
                      {r.short}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 20,
                        color: HUE_VAR[r.hue],
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.itemCountKnown ? r.itemCount : "—"}
                    </span>
                  </span>
                  {r.themes.length > 0 && (
                    <p
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-secondary)",
                        margin: "4px 0 0",
                      }}
                    >
                      {r.themes.join(" · ")}
                    </p>
                  )}
                  <span
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      margin: "8px 0 0",
                      flexWrap: "wrap",
                    }}
                  >
                    {here && <YoureHereChip />}
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)" }}>
                      {t === 0 ? "no discussions yet" : `${t} discussion${t > 1 ? "s" : ""}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* ══ Selected room ══ */}
          {selected && (
            <div
              className="cl-community-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 300px",
                gap: 18,
                alignItems: "start",
              }}
            >
              <style>{`
                @media (max-width: 1100px) {
                  .cl-community-grid { grid-template-columns: minmax(0,1fr) !important; }
                }
              `}</style>

              {/* Left column */}
              <div style={{ minWidth: 0 }}>
                {/* Room header */}
                <div style={{ ...CARD, margin: "0 0 14px" }}>
                  <div
                    style={{
                      ...PLATE_HEAD,
                      padding: "14px 20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 22,
                          letterSpacing: "0.02em",
                          textTransform: "uppercase",
                          margin: 0,
                          color: "var(--text)",
                        }}
                      >
                        {selected.name}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "3px 0 0" }}>
                        {selected.itemCountKnown
                          ? `${selected.itemCount} active ${selected.itemCount === 1 ? "item" : "items"} in this region`
                          : "Ledger item count pending"}
                        {" · "}
                        {selected.threads.length === 0
                          ? "no discussions yet"
                          : `${selected.threads.length} discussion${selected.threads.length > 1 ? "s" : ""}`}
                      </p>
                    </div>
                    <button
                      onClick={toggleJoin}
                      disabled={busy || !selected.groupId}
                      style={
                        selected.joined
                          ? {
                              fontFamily: "inherit",
                              fontSize: 12,
                              fontWeight: 800,
                              padding: "10px 18px",
                              borderRadius: 6,
                              border: "1px solid var(--color-border-strong)",
                              background: "var(--surface)",
                              color: "var(--text)",
                              cursor: busy ? "wait" : "pointer",
                              whiteSpace: "nowrap",
                            }
                          : {
                              fontFamily: "inherit",
                              fontSize: 12,
                              fontWeight: 800,
                              padding: "10px 18px",
                              borderRadius: 6,
                              border: "1px solid var(--color-primary)",
                              background: "var(--color-primary)",
                              color: "var(--color-text-inverse)",
                              cursor: busy ? "wait" : "pointer",
                              whiteSpace: "nowrap",
                            }
                      }
                    >
                      {selected.joined ? "Joined · leave room" : "Join room"}
                    </button>
                  </div>

                  {/* Live in this region */}
                  <div style={{ padding: "14px 20px" }}>
                    <p style={{ ...EYEBROW, margin: "0 0 10px" }}>
                      Live in this region · from the ledger
                    </p>
                    {selected.liveItems.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
                        &mdash; no verified ledger items tagged to this region yet.
                      </p>
                    ) : (
                      selected.liveItems.map((li) => (
                        <Link
                          key={li.id}
                          href={li.href}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 0",
                            borderTop: "1px solid var(--border-sub)",
                            textDecoration: "none",
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span
                              style={{
                                display: "block",
                                fontSize: 13,
                                fontWeight: 800,
                                color: "var(--text)",
                              }}
                            >
                              {li.title}
                            </span>
                            <span
                              style={{
                                display: "block",
                                fontSize: 11,
                                color: "var(--color-text-muted)",
                                margin: "2px 0 0",
                              }}
                            >
                              {li.meta}
                            </span>
                          </span>
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 800,
                              color: "var(--color-primary)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Open &rarr;
                          </span>
                        </Link>
                      ))
                    )}
                    <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: "8px 0 0" }}>
                      Full regional view on the{" "}
                      <Link href="/regulations" style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
                        Regulations index
                      </Link>{" "}
                      and the{" "}
                      <Link href="/map" style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
                        Map
                      </Link>
                      .
                    </p>
                  </div>
                </div>

                {/* Discussions */}
                <div style={CARD}>
                  <div
                    style={{
                      ...PLATE_HEAD,
                      padding: "12px 20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: "var(--text)",
                      }}
                    >
                      Discussions · {selected.short}
                    </span>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--epistemic-signal)",
                        border: "1px dashed var(--epistemic-border)",
                        borderRadius: 4,
                        padding: "2px 8px",
                      }}
                    >
                      Peer signal · unverified until signed off
                    </span>
                  </div>
                  <div style={{ padding: "14px 20px" }}>
                    {/* Composer */}
                    <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "0 0 10px" }}>
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            doPost();
                          }
                        }}
                        aria-label={`Post to the ${selected.short} room`}
                        placeholder={`Ask the ${selected.short} room — a lane observation, a handler question, a document worth sharing`}
                        disabled={!selected.joined || !selected.groupId}
                        style={{
                          flex: 1,
                          fontFamily: "inherit",
                          fontSize: 13.5,
                          padding: "11px 14px",
                          border: "1px solid var(--color-border-medium)",
                          borderRadius: 6,
                          outline: "none",
                          background: "var(--color-background)",
                          color: "var(--text)",
                        }}
                      />
                      <button
                        onClick={doPost}
                        disabled={busy || !draft.trim() || !selected.joined || !selected.groupId}
                        style={{
                          fontFamily: "inherit",
                          fontSize: 12.5,
                          fontWeight: 800,
                          padding: "11px 20px",
                          borderRadius: 6,
                          border: "1px solid var(--color-primary)",
                          background: "var(--color-primary)",
                          color: "var(--color-text-inverse)",
                          cursor: busy || !draft.trim() ? "not-allowed" : "pointer",
                          opacity: !draft.trim() || !selected.joined ? 0.5 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Post
                      </button>
                    </div>
                    {!selected.joined && (
                      <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
                        Join the room to post.
                      </p>
                    )}

                    {/* Starter chips */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 4px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "var(--color-text-muted)",
                          alignSelf: "center",
                        }}
                      >
                        Open questions this week
                      </span>
                      {starterQuestions(selected.short).map((s) => (
                        <button
                          key={s}
                          onClick={() => setDraft(s)}
                          disabled={!selected.joined}
                          style={{
                            fontFamily: "inherit",
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: "var(--color-text-secondary)",
                            background: "var(--color-background)",
                            border: "1px solid var(--color-border-medium)",
                            borderRadius: 999,
                            padding: "6px 13px",
                            cursor: selected.joined ? "pointer" : "not-allowed",
                            textAlign: "left",
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>

                    {/* Threads */}
                    {selected.threads.map((t) => (
                      <div
                        key={t.id}
                        id={`post-${t.id}`}
                        style={{ borderTop: "1px solid var(--border-sub)", padding: "12px 0" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "baseline",
                            flexWrap: "wrap",
                            margin: "0 0 5px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              letterSpacing: "0.09em",
                              textTransform: "uppercase",
                              color: "var(--color-primary)",
                              background: "var(--accent-tint-strong)",
                              border: "1px solid var(--accent-tint-border)",
                              borderRadius: 4,
                              padding: "2px 7px",
                            }}
                          >
                            {t.isYou ? "You" : t.authorName}
                            {t.isOwner ? " · Owner" : ""}
                          </span>
                          {t.signedOff ? <SignedOffChip /> : <UnverifiedChip />}
                          <span style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
                            {timeAgo(t.createdAt)}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            lineHeight: 1.45,
                            margin: "0 0 7px",
                            color: "var(--text)",
                          }}
                        >
                          {t.title}
                        </p>

                        {/* Cited sources */}
                        {(t.citedLive?.length ?? 0) > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 7px" }}>
                            {t.citedLive!.map((c, i) => (
                              <Link
                                key={i}
                                href={c.href}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "var(--accent-blue)",
                                  border: "1px solid var(--accent-blue)",
                                  borderRadius: 4,
                                  padding: "2px 7px",
                                  textDecoration: "none",
                                }}
                              >
                                Cited: {c.title.slice(0, 40)}
                              </Link>
                            ))}
                          </div>
                        )}
                        {t.referencedItemIds.length > (t.citedLive?.length ?? 0) && (
                          <p style={{ fontSize: 10, color: "var(--color-text-muted)", margin: "0 0 7px" }}>
                            {t.referencedItemIds.length} cited source
                            {t.referencedItemIds.length > 1 ? "s" : ""}
                          </p>
                        )}

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                          <TextAction onClick={() => setReplyOpen((p) => ({ ...p, [t.id]: !p[t.id] }))}>
                            Reply
                          </TextAction>
                          {t.isYou && selected.liveItems.length > 0 && (
                            <TextAction onClick={() => setCiteOpen((p) => ({ ...p, [t.id]: !p[t.id] }))}>
                              Cite source
                            </TextAction>
                          )}
                          {t.signedOff ? null : t.signoff?.status === "pending" ? (
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                color: "var(--epistemic-signal)",
                              }}
                            >
                              Sign-off requested{t.signoff.isMine ? "" : ` · ${t.signoff.requesterName}`}
                              {" · pending"}
                            </span>
                          ) : t.signoff?.status === "declined" ? (
                            <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  color: "var(--sev-moderate)",
                                }}
                              >
                                Sign-off declined
                              </span>
                              <button
                                type="button"
                                onClick={() => requestSignoff(t)}
                                disabled={busy || !selected.joined}
                                title={
                                  selected.joined
                                    ? "Open a fresh verifier sign-off request"
                                    : "Join the room to request sign-off"
                                }
                                style={{
                                  fontFamily: "inherit",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "var(--accent-blue)",
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  cursor: busy || !selected.joined ? "not-allowed" : "pointer",
                                  opacity: selected.joined ? 1 : 0.55,
                                }}
                              >
                                Request again
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => requestSignoff(t)}
                              disabled={busy || !selected.joined}
                              title={
                                selected.joined
                                  ? "Ask an active verifier to check this claim against a primary document"
                                  : "Join the room to request sign-off"
                              }
                              style={{
                                fontFamily: "inherit",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "var(--accent-blue)",
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: busy || !selected.joined ? "not-allowed" : "pointer",
                                opacity: selected.joined ? 1 : 0.55,
                              }}
                            >
                              Request verifier sign-off
                            </button>
                          )}
                          <span style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginLeft: "auto" }}>
                            {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
                          </span>
                          {t.isYou && (
                            <button
                              type="button"
                              onClick={() => doDelete(t)}
                              disabled={busy}
                              style={{
                                fontFamily: "inherit",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "var(--destructive-quiet)",
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: busy ? "wait" : "pointer",
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>

                        {/* Inline reply composer */}
                        {replyOpen[t.id] && (
                          <div style={{ display: "flex", gap: 8, margin: "10px 0 0" }}>
                            <input
                              value={replyDraft[t.id] ?? ""}
                              onChange={(e) => setReplyDraft((p) => ({ ...p, [t.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  doReply(t);
                                }
                              }}
                              aria-label="Write a reply"
                              placeholder="Write a reply"
                              style={{
                                flex: 1,
                                fontFamily: "inherit",
                                fontSize: 12.5,
                                padding: "8px 12px",
                                border: "1px solid var(--color-border-medium)",
                                borderRadius: 6,
                                outline: "none",
                                background: "var(--color-background)",
                                color: "var(--text)",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => doReply(t)}
                              disabled={busy || !(replyDraft[t.id] ?? "").trim()}
                              style={{
                                fontFamily: "inherit",
                                fontSize: 11.5,
                                fontWeight: 800,
                                padding: "8px 14px",
                                borderRadius: 6,
                                border: "1px solid var(--color-primary)",
                                background: "var(--color-primary)",
                                color: "var(--color-text-inverse)",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                                opacity: (replyDraft[t.id] ?? "").trim() ? 1 : 0.5,
                              }}
                            >
                              Reply
                            </button>
                          </div>
                        )}

                        {/* Inline cite picker */}
                        {citeOpen[t.id] && (
                          <div
                            style={{
                              margin: "10px 0 0",
                              padding: "10px 12px",
                              border: "1px solid var(--border-sub)",
                              borderRadius: 6,
                              background: "var(--color-background)",
                            }}
                          >
                            <p style={{ ...EYEBROW, margin: "0 0 6px" }}>Cite a live item in this region</p>
                            {selected.liveItems.map((li) => (
                              <button
                                key={li.id}
                                type="button"
                                onClick={() => citeSource(t, li)}
                                disabled={busy || t.referencedItemIds.includes(li.id)}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  fontFamily: "inherit",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: "var(--text)",
                                  background: "none",
                                  border: "none",
                                  padding: "6px 0",
                                  cursor: t.referencedItemIds.includes(li.id) ? "default" : "pointer",
                                  opacity: t.referencedItemIds.includes(li.id) ? 0.5 : 1,
                                }}
                              >
                                {t.referencedItemIds.includes(li.id) ? "Attached · " : "Cite · "}
                                {li.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Empty state */}
                    {selected.threads.length === 0 && (
                      <div style={{ borderTop: "1px solid var(--border-sub)", padding: "14px 0 4px" }}>
                        <p style={{ fontSize: 13, fontWeight: 800, margin: "0 0 3px", color: "var(--text)" }}>
                          Be first in the {selected.short} room.
                        </p>
                        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
                          No discussions here yet. Pick an open question above or post what you saw on the
                          ground this week.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Rail */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                {/* Who's here */}
                <div style={CARD}>
                  <div
                    style={{
                      padding: "11px 16px",
                      borderBottom: "1px solid var(--border-sub)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                    }}
                  >
                    <p style={EYEBROW}>Who&rsquo;s here · {selected.short}</p>
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 17,
                        color: "var(--text)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {selected.roster.length}
                    </span>
                  </div>
                  <div style={{ padding: "6px 16px 4px" }}>
                    {selected.roster.length === 0 ? (
                      <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: 0, padding: "8px 0" }}>
                        No member has this as a home region yet.
                      </p>
                    ) : (
                      selected.roster.map((m, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 0",
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                            {m.name}
                            {m.isYou && (
                              <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}> (you)</span>
                            )}
                          </span>
                          {m.isOwner && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 800,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "var(--color-primary)",
                                border: "1px solid var(--accent-tint-border)",
                                borderRadius: 4,
                                padding: "2px 7px",
                              }}
                            >
                              Owner
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: 10.5,
                      color: "var(--color-text-muted)",
                      margin: 0,
                      padding: "9px 16px",
                      background: "var(--color-background)",
                      lineHeight: 1.6,
                    }}
                  >
                    Presence comes from profile home jurisdictions. The network is {networkMemberCount}{" "}
                    {networkMemberCount === 1 ? "member" : "members"} and grows by{" "}
                    <Link href="/account" style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
                      workspace invitation
                    </Link>
                    .
                  </p>
                </div>

                {/* Why post here */}
                <div style={{ ...CARD, padding: "13px 16px" }}>
                  <p style={{ ...EYEBROW, margin: "0 0 5px" }}>Why post here</p>
                  <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
                    The ledger prints what&rsquo;s verified. The room holds what operators know first —
                    handler capacity, berth behaviour, what a regulator said on a call. High-engagement
                    posts are picked up by editorial into platform intelligence: post → engagement →{" "}
                    <Link href="/admin" style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
                      Admin pickups ({pendingPickups} pending)
                    </Link>{" "}
                    → platform brief.
                  </p>
                </div>

                {/* Verifier sign-off */}
                <SignoffRailPanel
                  threads={selected.threads}
                  currentUserIsVerifier={currentUserIsVerifier}
                  verifierStatus={verifierStatus}
                  busy={busy}
                  onWithdraw={withdrawSignoff}
                  onDecide={decideSignoff}
                />

                {/* Vertical groups — live: member-created, cross-regional. */}
                <VerticalGroupsRailPanel
                  groups={groupState}
                  onCreate={() => setCreateOpen(true)}
                />
              </div>
            </div>
          )}
        </>
      )}

      {createOpen && (
        <CreateGroupModal
          verticalOptions={verticalOptions}
          onClose={() => setCreateOpen(false)}
          onSubmit={doCreateGroup}
        />
      )}
    </div>
  );
}

// ── small presentational helpers ──

function starterQuestions(short: string): string[] {
  return [
    `What did you see on the ground in ${short} this week?`,
    `Any handler, berth or documentation behaviour worth flagging in ${short}?`,
  ];
}

function YoureHereChip() {
  return (
    <span
      style={{
        fontSize: 8.5,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--color-primary)",
        background: "var(--accent-tint-strong)",
        border: "1px solid var(--accent-tint-border)",
        borderRadius: 4,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      You&rsquo;re here
    </span>
  );
}

function UnverifiedChip() {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: "var(--epistemic-signal)",
        border: "1px dashed var(--epistemic-border)",
        borderRadius: 4,
        padding: "2px 7px",
      }}
    >
      Unverified
    </span>
  );
}

function SignedOffChip() {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: "var(--color-text-inverse)",
        background: "var(--color-primary)",
        border: "1px solid var(--color-primary)",
        borderRadius: 4,
        padding: "2px 7px",
      }}
      title="A verifier signed this off against a primary document"
    >
      Signed off · verified
    </span>
  );
}

function SignoffRailPanel({
  threads,
  currentUserIsVerifier,
  verifierStatus,
  busy,
  onWithdraw,
  onDecide,
}: {
  threads: ThreadVM[];
  currentUserIsVerifier: boolean;
  verifierStatus: string;
  busy: boolean;
  onWithdraw: (t: ThreadVM) => void;
  onDecide: (t: ThreadVM, decision: "signed_off" | "declined") => void;
}) {
  const myOpen = threads.filter(
    (t) => t.signoff?.isMine && t.signoff.status === "pending"
  );
  const decideQueue = threads.filter((t) => t.signoff?.status === "pending");

  const rowLink: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text)",
    textDecoration: "none",
    lineHeight: 1.4,
  };
  const smallBtn = (primary: boolean): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: 10.5,
    fontWeight: 800,
    padding: "4px 10px",
    borderRadius: 5,
    border: primary ? "1px solid var(--color-primary)" : "1px solid var(--color-border-strong)",
    background: primary ? "var(--color-primary)" : "var(--surface)",
    color: primary ? "var(--color-text-inverse)" : "var(--text)",
    cursor: busy ? "wait" : "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ ...CARD, padding: "13px 16px" }}>
      <p style={{ ...EYEBROW, margin: "0 0 5px" }}>Verifier sign-off</p>
      <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
        A verifier checks a post&rsquo;s claim against a primary document; signed-off claims earn the
        platform&rsquo;s verified treatment and become citable.{" "}
        {currentUserIsVerifier ? (
          <>You are an <b style={{ color: "var(--accent-blue)" }}>active verifier</b>.</>
        ) : verifierStatus === "pending" ? (
          <>Your verifier application is pending.</>
        ) : (
          <>
            You are{" "}
            <Link href="/account" style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
              not a verifier
            </Link>
            .
          </>
        )}
      </p>

      {/* Your open requests */}
      <div style={{ margin: "12px 0 0", paddingTop: 10, borderTop: "1px solid var(--border-sub)" }}>
        <p style={{ ...EYEBROW, margin: "0 0 6px" }}>Your open requests</p>
        {myOpen.length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
            No open sign-off requests of yours in this room.
          </p>
        ) : (
          myOpen.map((t) => (
            <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
              <a href={`#post-${t.id}`} style={{ ...rowLink, flex: 1, minWidth: 0 }}>
                {t.title.slice(0, 60)}
              </a>
              <button
                type="button"
                onClick={() => onWithdraw(t)}
                disabled={busy}
                style={smallBtn(false)}
              >
                Withdraw
              </button>
            </div>
          ))
        )}
      </div>

      {/* Verifier decide queue */}
      {currentUserIsVerifier && (
        <div style={{ margin: "12px 0 0", paddingTop: 10, borderTop: "1px solid var(--border-sub)" }}>
          <p style={{ ...EYEBROW, margin: "0 0 6px" }}>Decide queue</p>
          {decideQueue.length === 0 ? (
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
              No sign-off requests waiting in this room.
            </p>
          ) : (
            decideQueue.map((t) => (
              <div key={t.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border-sub)" }}>
                <a href={`#post-${t.id}`} style={{ ...rowLink, margin: "0 0 2px" }}>
                  {t.title.slice(0, 70)}
                </a>
                <p style={{ fontSize: 10, color: "var(--color-text-muted)", margin: "0 0 6px" }}>
                  Requested by {t.signoff?.requesterName}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => onDecide(t, "signed_off")}
                    disabled={busy}
                    style={smallBtn(true)}
                  >
                    Sign off
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecide(t, "declined")}
                    disabled={busy}
                    style={smallBtn(false)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TextAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--color-text-secondary)",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function PendingFrame({ eyebrow, body }: { eyebrow: string; body: string }) {
  return (
    <div
      style={{
        border: "1px dashed var(--pending-frame-border)",
        borderRadius: 8,
        background: "var(--color-background)",
        padding: "13px 16px",
      }}
    >
      <p
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          color: "var(--brass)",
          margin: "0 0 5px",
        }}
      >
        {eyebrow}
      </p>
      <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
        {body}
      </p>
    </div>
  );
}

// ── Vertical groups (member-created, cross-regional) ──

function VerticalGroupsRailPanel({
  groups,
  onCreate,
}: {
  groups: VerticalGroupVM[];
  onCreate: () => void;
}) {
  return (
    <div style={CARD}>
      <div
        style={{
          ...PLATE_HEAD,
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <p style={{ ...EYEBROW, color: "var(--text)" }}>
          Vertical groups{groups.length > 0 ? ` · ${groups.length}` : ""}
        </p>
        <button
          type="button"
          onClick={onCreate}
          style={{
            fontFamily: "inherit",
            fontSize: 10.5,
            fontWeight: 800,
            color: "var(--color-primary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          + New group
        </button>
      </div>
      <div style={{ padding: "12px 14px" }}>
        {groups.length === 0 ? (
          <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
            No vertical groups yet. Rooms are regional; a group cuts across them
            by cargo vertical (fine art, live events, automotive…). Start one and
            invite peers wherever they operate.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/community/${g.slug}`}
                style={{
                  display: "block",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)" }}>
                    {g.name}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                    {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span
                  style={{
                    display: "inline-block",
                    marginTop: 4,
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--color-primary)",
                    border: "1px solid var(--color-active-border)",
                    borderRadius: 4,
                    padding: "1px 7px",
                  }}
                >
                  {g.verticalLabel}
                </span>
                {g.youOwn && (
                  <span style={{ fontSize: 10, color: "var(--color-text-muted)", marginLeft: 8 }}>
                    · you own this
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
        {/* Un-orphan (S2-09): the group directory and moderation queue were reachable only by
            typed URL — no surface linked them. The rail footer is their navigation home. */}
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px solid var(--color-border-subtle)",
          }}
        >
          <Link
            href="/community/browse"
            style={{ fontSize: 11, fontWeight: 800, color: "var(--color-primary)", textDecoration: "none" }}
          >
            Browse all groups →
          </Link>
          <Link
            href="/community/moderation"
            style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textDecoration: "none" }}
          >
            Moderation queue
          </Link>
        </div>
      </div>
    </div>
  );
}

function CreateGroupModal({
  verticalOptions,
  onClose,
  onSubmit,
}: {
  verticalOptions: { id: string; label: string }[];
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    vertical: string;
    description: string;
  }) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState(verticalOptions[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && vertical && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit({ name: name.trim(), vertical, description: description.trim() });
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-group-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 100%)",
          background: "var(--surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: 22,
        }}
      >
        <h3 id="create-group-title" style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
          Start a vertical group
        </h3>
        <p style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--color-text-secondary)", margin: "0 0 14px" }}>
          A public space that cuts across the regional rooms by cargo vertical.
          You become its first member and owner.
        </p>

        <label htmlFor="cg-name" style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--text-2)", margin: "0 0 4px" }}>
          Group name
        </label>
        <input
          id="cg-name"
          value={name}
          maxLength={120}
          placeholder="e.g. Fine-art crating & climate control"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) submit();
          }}
          style={inputStyle}
        />

        <label htmlFor="cg-vertical" style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--text-2)", margin: "12px 0 4px" }}>
          Cargo vertical
        </label>
        <select
          id="cg-vertical"
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {verticalOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>

        <label htmlFor="cg-desc" style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--text-2)", margin: "12px 0 4px" }}>
          Description <span style={{ fontWeight: 500, color: "var(--color-text-muted)" }}>(optional)</span>
        </label>
        <textarea
          id="cg-desc"
          value={description}
          maxLength={1000}
          rows={3}
          placeholder="What this group is for, and who should join."
          onChange={(e) => setDescription(e.target.value)}
          style={{ ...inputStyle, resize: "vertical" }}
        />

        {error && (
          <p role="alert" style={{ fontSize: 11.5, color: "var(--sev-critical)", margin: "10px 0 0" }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid var(--color-border-medium)",
              background: "var(--surface)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 800,
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid var(--color-primary)",
              background: canSubmit ? "var(--color-primary)" : "transparent",
              color: canSubmit ? "#FFFFFF" : "var(--text-disabled)",
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.6,
            }}
          >
            {busy ? "Creating…" : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: "inherit",
  fontSize: 12.5,
  padding: "9px 12px",
  border: "1px solid var(--color-border-medium)",
  borderRadius: 6,
  outline: "none",
  background: "var(--color-background)",
  color: "var(--text)",
  boxSizing: "border-box",
};

function NotSeededState({
  pendingPickups,
  verifierStatus,
}: {
  pendingPickups: number;
  verifierStatus: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          border: "1px dashed var(--pending-frame-border)",
          borderRadius: 8,
          background: "var(--color-background)",
          padding: "20px 22px",
        }}
      >
        <p
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "var(--brass)",
            margin: "0 0 6px",
          }}
        >
          Regional rooms · not yet open
        </p>
        <p style={{ fontSize: 14, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
          The seven regional rooms land when the room seed runs.
        </p>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0, maxWidth: 640 }}>
          Each region — Global, EU, US, UK, Asia–Pacific, Latin America, and Middle East &amp; Africa —
          opens as a public room where operators post what they see first. Presence, discussions, and
          the &ldquo;live in this region&rdquo; ledger appear here once the rooms are created.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 14,
        }}
      >
        <div style={{ ...CARD, padding: "13px 16px" }}>
          <p style={{ ...EYEBROW, margin: "0 0 5px" }}>Why post here</p>
          <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
            The ledger prints what&rsquo;s verified. The room holds what operators know first. High-engagement
            posts are picked up by editorial: post → engagement →{" "}
            <Link href="/admin" style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
              Admin pickups ({pendingPickups} pending)
            </Link>{" "}
            → platform brief.
          </p>
        </div>
        <div style={{ ...CARD, padding: "13px 16px" }}>
          <p style={{ ...EYEBROW, margin: "0 0 5px" }}>Verifier sign-off</p>
          <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
            A verifier checks a post&rsquo;s claim against a primary document; signed-off claims become
            citable.{" "}
            {verifierStatus === "active" ? "You are an active verifier." : "You are not a verifier yet."}
          </p>
        </div>
        <PendingFrame
          eyebrow="Vertical groups"
          body="Rooms are regional; groups cut across them by vertical (fine art, live events, automotive…). Members create them from inside a room once the rooms are live."
        />
      </div>
    </div>
  );
}
