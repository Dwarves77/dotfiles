"use client";

/**
 * CommunityRooms — redesign TEMPLATE 11 client surface.
 *
 * Composed against artboard 12 (dc.html id="p12", lane community60 2026-09-08).
 * Content column: the room tile grid (4 fixed columns, the dashed "+ New vertical
 * group" tile as its 8th slot) → the ROOM INDEX card (the artboard's JURIS. /
 * DISCUSSION / REPLIES / LAST ACTIVITY table on the shared RowTable, under an
 * Anton head, over the foot strip) → the NEW POST card. Rail: Who's here,
 * Verifier sign-off, Why post here. Two features artboard 12 has no region for
 * keep R7 placement: the room header + "Live in this region" card after the last
 * designed region of the content column, and Vertical groups last in the rail.
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

import { useMemo, useRef, useState } from "react";
import { formatRelative } from "@/lib/relative-time";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { RoomKey } from "@/lib/community/rooms";
import { isRoomMember } from "@/lib/community/rooms";
import { nowFrom } from "@/lib/render-now";
import { formatNumber } from "@/lib/format";
import { Absence, ABSENCE_TEXT_STYLE } from "@/components/ui/Absence";
import { Button } from "@/components/ui/Button";
import { CardFoot } from "@/components/ui/CardFoot";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SectionRule } from "@/components/ui/SectionRule";
import {
  RowTable,
  RowTableOverflow,
  type RowTableColumn,
  type RowTableOverflowItem,
  type RowTableRowSpec,
} from "@/components/ui/RowTable";

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
  /** Most recent reply time, or createdAt when there are no replies yet — a
   *  discussion board's threads carry replies and LAST ACTIVITY (UI system
   *  handoff 2026-09-06, README screen 12), not the item dimensions
   *  (impact/timeline/tier) a scored ledger row carries. */
  lastActivityAt: string;
  referencedItemIds: string[];
  authorName: string;
  /** The author's organization name, when the page could resolve it. Artboard 12
   *  draws it after the author ("Opened by A. Weiss · Dietl"); omitted when the
   *  author has no org row the caller can read. */
  authorOrg?: string | null;
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
  pendingPickups: number;
  /** The server-decided instant (src/lib/render-now.ts), so the relative-time cells
   *  render the same string in the SSR pass and in hydration. */
  nowIso?: string;
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
/** The rail-card eyebrow, dc.html p12 verbatim: 10.5px / .12em / uppercase / 700 / --ink-3. */
const RAIL_EYEBROW: React.CSSProperties = {
  fontSize: "var(--fs-105)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  fontWeight: 700,
  margin: 0,
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
  pendingPickups,
  nowIso,
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
  /** The row whose disclosure is open. Artboard 12's table is the room INDEX (R8);
   *  a row expands in place, the thread page is not built. */
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  function openThread(id: string, action?: "reply" | "cite") {
    setOpenThreadId((cur) => (cur === id && !action ? null : id));
    if (action === "reply") setReplyOpen((p) => ({ ...p, [id]: true }));
    if (action === "cite") setCiteOpen((p) => ({ ...p, [id]: true }));
  }

  function focusComposer() {
    composerRef.current?.focus();
  }

  const selected = roomState.find((r) => r.key === selectedKey) ?? roomState[0];

  // P1 fix (2026-09-06): count actual membership only — `youHere` is a
  // jurisdiction hint, not a membership claim. See isRoomMember in rooms.ts.
  const yourRoomCount = roomState.filter(isRoomMember).length;
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
        lastActivityAt: post.created_at ?? new Date().toISOString(),
        referencedItemIds: [],
        authorName: currentUserName,
        authorOrg: null,
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
  //
  // Region order is artboard 12's (dc.html id="p12"), top to bottom in the
  // content column: room tile grid -> the ROOM INDEX (the artboard's table:
  // JURIS. / DISCUSSION / REPLIES / LAST ACTIVITY / overflow, under an Anton
  // head, over a foot strip) -> the NEW POST card. The rail is Who's here,
  // Verifier sign-off, Why post here, in that order.
  //
  // Two app features the artboard has no region for keep R7 placement (leave
  // as is, move to after the last designed region of the column): the room
  // header with Join/leave plus "Live in this region" sits after NEW POST, and
  // the Vertical groups card sits last in the rail.
  const now = nowFrom(nowIso);
  const roomName = selected ? selected.name : "";
  const threads = selected ? selected.threads : [];

  const columns: RowTableColumn[] = [
    { label: "Juris.", width: "64px" },
    { label: "Discussion", width: "minmax(0,1fr)" },
    { label: "Replies", width: "96px" },
    { label: "Last activity", width: "120px" },
    { label: "", width: "44px" },
  ];

  function overflowItems(t: ThreadVM): RowTableOverflowItem[] {
    const items: RowTableOverflowItem[] = [
      { key: "reply", label: "Reply", onSelect: () => openThread(t.id, "reply") },
    ];
    if (t.isYou && selected && selected.liveItems.length > 0) {
      items.push({ key: "cite", label: "Cite source", onSelect: () => openThread(t.id, "cite") });
    }
    if (!t.signedOff && t.signoff?.status !== "pending") {
      items.push({
        key: "signoff",
        label: t.signoff?.status === "declined" ? "Request sign-off again" : "Request verifier sign-off",
        onSelect: () => requestSignoff(t),
      });
    }
    if (t.isYou) {
      items.push({ key: "delete", label: "Delete discussion", onSelect: () => doDelete(t) });
    }
    return items;
  }

  const rows: RowTableRowSpec[] = threads.map((t) => ({
    key: t.id,
    id: `post-${t.id}`,
    activateLabel: `Open ${t.title}`,
    onActivate: () => openThread(t.id),
    cells: [
      <span
        key="j"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--ink-2)",
        }}
      >
        {roomName.toUpperCase()}
      </span>,
      <span key="d" style={{ minWidth: 0, display: "block" }}>
        <span
          style={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: "var(--ink)",
          }}
        >
          {t.title}
        </span>
        <span
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 11,
            color: "var(--ink-3)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {/* The artboard draws a QUESTION / PRACTICE / MARKET / TEMPLATE tag chip here.
              community_posts carries no kind/topic/tag column (migration 030), so the
              Absence convention stands in its place rather than a fabricated label. */}
          <Absence reason="connect data" />
          <span>
            Opened by {t.isYou ? currentUserName : t.authorName}
            {t.authorOrg ? ` · ${t.authorOrg}` : ""}
          </span>
          {t.signedOff && <SignedOffChip />}
        </span>
      </span>,
      <span key="r" style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
        <b>{t.replyCount}</b>{" "}
        <span style={{ color: "var(--ink-3)" }}>
          {t.replyCount === 1 ? "reply" : "replies"}
        </span>
      </span>,
      <span key="l" style={{ fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
        {formatRelative(new Date(t.lastActivityAt), now)}
      </span>,
      <RowTableOverflow key="o" label={`Actions for ${t.title}`} items={overflowItems(t)} />,
    ],
    below: openThreadId === t.id ? threadDisclosure(t) : null,
  }));

  /** The row's own disclosure: the thread body and the actions the overflow menu opens.
   *  R8 holds — the thread PAGE is not built; this is the row expanding in place. */
  function threadDisclosure(t: ThreadVM) {
    return (
      <div style={{ padding: "2px 0 0" }}>
        {t.body && (
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-2)", margin: "0 0 8px" }}>
            {t.body}
          </p>
        )}
        {(t.citedLive?.length ?? 0) > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 8px" }}>
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
          <p style={{ fontSize: 10, color: "var(--ink-3)", margin: "0 0 8px" }}>
            {t.referencedItemIds.length} cited source
            {t.referencedItemIds.length > 1 ? "s" : ""}
          </p>
        )}
        {t.signoff?.status === "pending" && (
          <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--epistemic-signal)", margin: "0 0 8px" }}>
            Sign-off requested{t.signoff.isMine ? "" : ` · ${t.signoff.requesterName}`} · pending
          </p>
        )}
        {t.signoff?.status === "declined" && (
          <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--sev-moderate)", margin: "0 0 8px" }}>
            Sign-off declined
          </p>
        )}
        {replyOpen[t.id] && (
          <div style={{ display: "flex", gap: 8, margin: "0 0 8px" }} onClick={(e) => e.stopPropagation()}>
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
                minHeight: 44,
                padding: "8px 12px",
                border: "1px solid var(--line-1)",
                borderRadius: 6,
                outline: "none",
                background: "var(--page)",
                color: "var(--ink)",
              }}
            />
            <Button
              className="min-h-[44px]"
              variant="primary"
              onClick={() => doReply(t)}
              disabled={busy || !(replyDraft[t.id] ?? "").trim()}
            >
              Reply
            </Button>
          </div>
        )}
        {citeOpen[t.id] && selected && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              margin: "0 0 8px",
              padding: "10px 12px",
              border: "1px solid var(--line-3)",
              borderRadius: 6,
              background: "var(--page)",
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
                  minHeight: 44,
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--ink)",
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
    );
  }

  return (
    <div style={{ padding: "20px 40px 40px" }} data-audit="community-body">
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

      {!seeded ? (
        <NotSeededState pendingPickups={pendingPickups} verifierStatus={verifierStatus} />
      ) : selected ? (
        <div
          className="cl-community-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 300px",
            gap: 28,
            alignItems: "start",
          }}
        >
          <style>{`
            @media (max-width: 1100px) {
              .cl-community-grid { grid-template-columns: minmax(0,1fr) !important; }
            }
          `}</style>

          {/* ══ Content column ══ */}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Room tiles — fixed 4 columns (dc.html p12: grid-template-columns:repeat(4,1fr)),
                never auto-fit: auto-fit's minmax(165px,1fr) packed 6 tiles per row at 1440px
                and truncated the theme text the artboard's 4-column layout never truncates. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              {roomState.map((r) => {
                const isSel = r.key === selectedKey;
                // The tile chip reads ACTUAL membership, the same source of truth the room
                // panel's Join/leave button reads (isRoomMember in rooms.ts) — `youHere` is a
                // jurisdiction hint, not a membership claim.
                const here = isRoomMember(r);
                const t = r.threads.length;
                const last = r.threads[0]?.lastActivityAt;
                return (
                  <button
                    key={r.key}
                    onClick={() => {
                      setSelectedKey(r.key);
                      setDraft("");
                      setOpenThreadId(null);
                    }}
                    aria-pressed={isSel}
                    style={{
                      fontFamily: "inherit",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      background: "var(--card)",
                      borderRadius: 10,
                      padding: "12px 14px",
                      overflow: "hidden",
                      border: isSel ? "1px solid var(--brand)" : "1px solid var(--line-1)",
                      boxShadow: isSel
                        ? undefined
                        : "0 1px 2px rgba(26,26,26,.04), 0 4px 14px rgba(26,26,26,.06)",
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
                          fontSize: 11,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          fontWeight: 800,
                          color: "var(--ink)",
                        }}
                      >
                        {r.name}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 18,
                          color: HUE_VAR[r.hue],
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {r.itemCountKnown ? formatNumber(r.itemCount) : "—"}
                      </span>
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 11,
                        color: "var(--ink-2)",
                        marginTop: 4,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.themes.length > 0 ? r.themes.join(" · ") : "—"}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 10,
                        color: "var(--ink-3)",
                        marginTop: 6,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {here && <b style={{ color: "var(--ink)" }}>Joined</b>}
                      {here && " · "}
                      {t === 0
                        ? "no discussions yet"
                        : `${t} discussion${t > 1 ? "s" : ""}${last ? ` · ${formatRelative(new Date(last), now)}` : ""}`}
                    </span>
                  </button>
                );
              })}
              {/* The dashed "+ New vertical group" tile is the grid's own 8th slot (dc.html p12);
                  same create-group action the rail's Vertical groups card opens, one handler. */}
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                style={{
                  fontFamily: "inherit",
                  cursor: "pointer",
                  background: "transparent",
                  borderRadius: 10,
                  padding: "12px 14px",
                  border: "1px dashed rgba(0,0,0,.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink-2)",
                  minHeight: 44,
                }}
              >
                + New vertical group
              </button>
            </div>

            {/* ══ Room index — artboard 12's table ══ */}
            <div style={CARD} data-audit="room-index">
              <SectionRule />
              <SectionHeading
                title={`${roomName} room`}
                aside={`${threads.length} discussion${threads.length === 1 ? "" : "s"} · ${threads.length} shown · ${selected.roster.length} member${selected.roster.length === 1 ? "" : "s"} here`}
              />
              {threads.length === 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--ink-2)",
                    lineHeight: 1.6,
                    margin: 0,
                    padding: "0 16px 14px",
                  }}
                >
                  Be first in the {roomName} room. No discussions here yet — post what you saw on
                  the ground this week.
                </p>
              ) : (
                <RowTable
                  columns={columns}
                  rows={rows}
                  metrics={{ paddingLeft: 14, rowMinHeight: 56, ruleAfterLastRow: true }}
                />
              )}
              <CardFoot
                left="Threads reference ledger items by link — the ledger keeps the scoring."
                right={
                  <Button className="min-h-[44px]" variant="secondary" onClick={focusComposer}>
                    Start a discussion
                  </Button>
                }
              />
            </div>

            {/* ══ New post ══ */}
            <div style={CARD} data-audit="new-post">
              <SectionRule />
              <SectionHeading
                title={`New post · ${roomName}`}
                aside={`Posts to the ${roomName} room`}
              />
              <div style={{ padding: "14px 16px" }}>
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={`Post to the ${roomName} room`}
                  placeholder={`Ask the ${roomName} room — a lane observation, a handler question, a document worth sharing…`}
                  disabled={!selected.joined || !selected.groupId}
                  rows={3}
                  style={{
                    display: "block",
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: 64,
                    fontFamily: "inherit",
                    fontSize: 13,
                    lineHeight: 1.5,
                    padding: "10px 12px",
                    border: "1px solid rgba(0,0,0,.25)",
                    borderRadius: 8,
                    outline: "none",
                    background: "var(--card)",
                    color: "var(--ink)",
                    resize: "vertical",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 10,
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {starterQuestions(roomName).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setDraft(s)}
                        disabled={!selected.joined}
                        style={{
                          fontFamily: "inherit",
                          padding: "5px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(0,0,0,.2)",
                          background: "var(--card)",
                          fontSize: 11.5,
                          color: "var(--ink)",
                          textAlign: "left",
                          cursor: selected.joined ? "pointer" : "not-allowed",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <Button
                    className="min-h-[44px]"
                    variant="primary"
                    onClick={doPost}
                    disabled={busy || !draft.trim() || !selected.joined || !selected.groupId}
                  >
                    Post
                  </Button>
                </div>
                {!selected.joined && (
                  <p style={{ fontSize: 10.5, color: "var(--ink-3)", margin: "8px 0 0" }}>
                    Join the room to post.
                  </p>
                )}
              </div>
            </div>

            {/* ══ R7: the room's own header and ledger strip. Artboard 12 has no region for
                either, so both keep R7 placement — after the last designed region of this
                column — rather than being removed or restyled. ══ */}
            <div style={CARD} data-audit="region-card">
              <SectionRule />
              <SectionHeading
                title={`${roomName} region`}
                aside={
                  selected.itemCountKnown
                    ? `${formatNumber(selected.itemCount)} active ${selected.itemCount === 1 ? "item" : "items"}`
                    : "Ledger item count pending"
                }
              />
              <div style={{ padding: "0 16px 14px" }}>
                <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 0 8px" }}>
                  <Button
                    className="min-h-[44px]"
                    variant={selected.joined ? "secondary" : "primary"}
                    onClick={toggleJoin}
                    disabled={busy || !selected.groupId}
                  >
                    {selected.joined ? "Joined · leave room" : "Join room"}
                  </Button>
                </div>
                <p style={{ ...EYEBROW, margin: "0 0 10px" }}>
                  Live in this region · from the ledger
                </p>
                {selected.liveItems.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
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
                        minHeight: 44,
                        padding: "10px 0",
                        borderTop: "1px solid var(--line-3)",
                        textDecoration: "none",
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{ display: "block", fontSize: 13, fontWeight: 800, color: "var(--ink)" }}
                        >
                          {li.title}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 11,
                            color: "var(--ink-3)",
                            marginTop: 2,
                          }}
                        >
                          {li.meta}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 800,
                          color: "var(--brand)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Open &rarr;
                      </span>
                    </Link>
                  ))
                )}
                <p style={{ fontSize: 10.5, color: "var(--ink-3)", margin: "8px 0 0" }}>
                  Full regional view on the{" "}
                  <Link href="/regulations" style={{ color: "var(--brand)", fontWeight: 700, textDecoration: "none" }}>
                    Regulations index
                  </Link>{" "}
                  and the{" "}
                  <Link href="/map" style={{ color: "var(--brand)", fontWeight: 700, textDecoration: "none" }}>
                    Map
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>

          {/* ══ Rail — artboard order: Who's here, Verifier sign-off, Why post here.
              Vertical groups is R7 (no artboard region) and sits after them. ══ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {/* Who's here */}
            <div style={CARD} data-audit="whos-here">
              <SectionRule />
              <div style={{ padding: "12px 16px 14px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 8,
                  }}
                >
                  <span style={RAIL_EYEBROW}>Who&rsquo;s here · {roomName}</span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 16,
                      color: "var(--ink)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {selected.roster.length}
                  </span>
                </div>
                {selected.roster.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5, margin: 0 }}>
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
                        fontSize: 12.5,
                        minHeight: 24,
                      }}
                    >
                      <span>
                        <b>{m.name}</b>
                        {m.isYou ? " (you)" : ""}
                      </span>
                      {m.isOwner && (
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            padding: "2px 6px",
                            border: "1px solid rgba(0,0,0,.2)",
                            borderRadius: 4,
                          }}
                        >
                          Owner
                        </span>
                      )}
                    </div>
                  ))
                )}
                <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5 }}>
                  Presence comes from profile home jurisdictions. Grow the network by{" "}
                  <Link href="/profile" style={{ color: "var(--brand)", fontWeight: 700 }}>
                    workspace invitation
                  </Link>
                  .
                </p>
              </div>
            </div>

            {/* Verifier sign-off */}
            <SignoffRailPanel
              threads={threads}
              currentUserIsVerifier={currentUserIsVerifier}
              verifierStatus={verifierStatus}
              busy={busy}
              onWithdraw={withdrawSignoff}
              onDecide={decideSignoff}
            />

            {/* Why post here */}
            <div style={CARD} data-audit="why-post-here">
              <SectionRule />
              <div style={{ padding: "12px 16px 14px" }}>
                <p style={{ ...RAIL_EYEBROW, margin: "0 0 8px" }}>Why post here</p>
                <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-2)", margin: 0 }}>
                  The ledger prints what&rsquo;s verified. The room holds what operators know first
                  — handler capacity, berth behaviour, what a regulator said on a call.
                  High-engagement posts are picked up by editorial into platform intelligence.
                </p>
              </div>
              {/* R7: the editorial pickup queue is an app feature artboard 12 does not draw;
                  it keeps its link at the card foot rather than inside the drawn paragraph. */}
              <CardFoot
                left={
                  <Link href="/admin" style={{ color: "var(--brand)", fontWeight: 700 }}>
                    Admin pickups ({formatNumber(pendingPickups)} pending) &rarr;
                  </Link>
                }
                right={null}
              />
            </div>

            {/* R7: Vertical groups — no artboard region, kept and placed last. */}
            <VerticalGroupsRailPanel groups={groupState} onCreate={() => setCreateOpen(true)} />
          </div>
        </div>
      ) : null}

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
    <div style={CARD} data-audit="verifier-signoff">
      <SectionRule />
      <div style={{ padding: "12px 16px 14px" }}>
      <p style={{ ...RAIL_EYEBROW, margin: "0 0 8px" }}>Verifier sign-off</p>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-2)", margin: 0 }}>
        A verifier checks a post&rsquo;s claim against a primary document; signed-off claims
        become citable.{" "}
        {currentUserIsVerifier ? (
          <>You are an <b style={{ color: "var(--ink)" }}>active verifier</b>.</>
        ) : verifierStatus === "pending" ? (
          <>Your verifier application is pending.</>
        ) : (
          <>
            You are{" "}
            <Link href="/profile" style={{ color: "var(--ink)", fontWeight: 700 }}>
              not a verifier
            </Link>
            .
          </>
        )}
      </p>

      {/* Your open requests. Artboard 12 draws ONE line, "Your open requests · none",
          with the value in the absence type treatment — not a labelled sub-section. */}
      <div style={{ margin: "8px 0 0" }}>
        {myOpen.length === 0 ? (
          <p style={{ fontSize: 12, margin: 0 }}>
            {/* NONE is a real zero, not a missing value, so the closed absence VOCABULARY
                cannot express it; ABSENCE_TEXT_STYLE carries the treatment for exactly this
                case (see Absence.tsx). */}
            Your open requests · <span style={ABSENCE_TEXT_STYLE}>none</span>
          </p>
        ) : (
          <>
        <p style={{ ...RAIL_EYEBROW, margin: "0 0 6px" }}>Your open requests</p>
        {(
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
          </>
        )}
      </div>

      {/* Verifier decide queue */}
      {currentUserIsVerifier && (
        <div style={{ margin: "12px 0 0", paddingTop: 10, borderTop: "1px solid var(--line-3)" }}>
          <p style={{ ...RAIL_EYEBROW, margin: "0 0 6px" }}>Decide queue</p>
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
    </div>
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
