"use client";

/**
 * NotificationsList — dropdown body shown by NotificationsBell.
 *
 * Renders up to 20 notifications, paginated via "Load older" using
 * the `before` cursor on /api/community/notifications.
 *
 * Each row shows:
 *   - kind icon
 *   - title (bold if unread)
 *   - body excerpt (derived from payload)
 *   - timestamp ("12m ago" style)
 *
 * Clicking a row marks it read (POST /[id] action=mark_read) and, if
 * payload.link is present, navigates to it.
 *
 * "Mark all read" button at top calls POST / action=mark_all_read.
 *
 * Light-first, no emojis.
 */

import { useEffect, useState, useCallback } from "react";
import {
  AtSign,
  MessageSquare,
  UserPlus,
  ShieldAlert,
  Star,
  Inbox,
  Loader2,
  CheckCheck,
  Circle,
} from "lucide-react";

const LIST_PATH = "/api/community/notifications?limit=20";

type Kind = "mention" | "reply" | "invite" | "promote" | "moderation";

interface Notification {
  id: string;
  kind: Kind;
  payload: {
    title?: string;
    body?: string;
    link?: string;
    [k: string]: unknown;
  };
  read_at: string | null;
  created_at: string;
}

interface ListResponse {
  notifications: Notification[];
  total_matching: number;
  unread_count: number;
}

interface NotificationsListProps {
  onUnreadCountChange?: (next: number) => void;
  onClose?: () => void;
}

const KIND_LABEL: Record<Kind, string> = {
  mention: "Mention",
  reply: "Reply",
  invite: "Invite",
  promote: "Promotion",
  moderation: "Moderation",
};

function KindIcon({ kind }: { kind: Kind }) {
  const props = { size: 14, "aria-hidden": true as const };
  switch (kind) {
    case "mention":
      return <AtSign {...props} />;
    case "reply":
      return <MessageSquare {...props} />;
    case "invite":
      return <UserPlus {...props} />;
    case "moderation":
      return <ShieldAlert {...props} />;
    case "promote":
      return <Star {...props} />;
    default:
      return <Inbox {...props} />;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function deriveTitle(n: Notification): string {
  if (n.payload?.title && typeof n.payload.title === "string") {
    return n.payload.title;
  }
  return KIND_LABEL[n.kind] ?? "Notification";
}

function deriveBody(n: Notification): string {
  if (n.payload?.body && typeof n.payload.body === "string") {
    return n.payload.body;
  }
  return "";
}

export function NotificationsList({
  onUnreadCountChange,
  onClose,
}: NotificationsListProps) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const updateUnread = useCallback(
    (next: number) => {
      setUnreadCount(next);
      onUnreadCountChange?.(next);
    },
    [onUnreadCountChange]
  );

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(LIST_PATH, { cache: "no-store" });
        const json: ListResponse = await res.json();
        if (!res.ok) {
          throw new Error(
            (json as unknown as { error?: string })?.error ||
              `HTTP ${res.status}`
          );
        }
        if (cancelled) return;
        setItems(json.notifications);
        updateUnread(json.unread_count);
        setHasMore(
          json.notifications.length > 0 &&
            json.notifications.length < json.total_matching
        );
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [updateUnread]);

  async function loadOlder() {
    if (items.length === 0 || loadingMore) return;
    const oldest = items[items.length - 1];
    setLoadingMore(true);
    try {
      const url = `/api/community/notifications?limit=20&before=${encodeURIComponent(
        oldest.created_at
      )}`;
      const res = await fetch(url, { cache: "no-store" });
      const json: ListResponse = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => [...prev, ...json.notifications]);
      // hasMore: if this page returned fewer than 20, no more.
      setHasMore(json.notifications.length === 20);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  async function markAllRead() {
    const previousUnread = unreadCount;
    // Optimistic
    setItems((prev) =>
      prev.map((n) =>
        n.read_at ? n : { ...n, read_at: new Date().toISOString() }
      )
    );
    updateUnread(0);
    try {
      const res = await fetch("/api/community/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Roll back
      updateUnread(previousUnread);
    }
  }

  async function markRead(id: string) {
    const target = items.find((n) => n.id === id);
    if (!target || target.read_at) return;
    // Optimistic
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
    updateUnread(Math.max(0, unreadCount - 1));
    try {
      await fetch(`/api/community/notifications/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read" }),
      });
    } catch {
      // Best-effort; the next list fetch will reconcile.
    }
  }

  function handleClick(n: Notification) {
    void markRead(n.id);
    const link = n.payload?.link;
    if (link && typeof link === "string") {
      onClose?.();
      // Use a full navigation so the destination layout reloads with
      // the now-read notification reflected.
      window.location.href = link;
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--color-text-primary)",
          }}
        >
          Notifications
          {unreadCount > 0 && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-text-muted)",
              }}
            >
              {unreadCount} unread
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          aria-label="Mark all notifications as read"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: 0,
            color:
              unreadCount === 0
                ? "var(--color-text-muted)"
                : "var(--color-primary)",
            cursor: unreadCount === 0 ? "default" : "pointer",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: 4,
          }}
        >
          <CheckCheck size={12} aria-hidden="true" />
          Mark all read
        </button>
      </div>

      {/* Body */}
      <div style={{ maxHeight: 460, overflowY: "auto" }}>
        {loading && (
          <div
            style={{
              padding: "20px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--color-text-muted)",
              fontSize: 12,
            }}
          >
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Loading…
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "var(--color-error, #c0392b)",
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div
            style={{
              padding: "28px 16px",
              textAlign: "center",
              color: "var(--color-text-muted)",
              fontSize: 12,
            }}
          >
            <Inbox
              size={20}
              aria-hidden="true"
              style={{ opacity: 0.5, marginBottom: 6 }}
            />
            <div>You&apos;re all caught up.</div>
          </div>
        )}

        {!loading &&
          !error &&
          items.map((n) => {
            const unread = !n.read_at;
            const title = deriveTitle(n);
            const body = deriveBody(n);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                style={{
                  display: "flex",
                  width: "100%",
                  textAlign: "left",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  background: unread
                    ? "var(--color-bg-base)"
                    : "transparent",
                  border: 0,
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    color: unread
                      ? "var(--color-primary)"
                      : "var(--color-text-muted)",
                  }}
                >
                  <KindIcon kind={n.kind} />
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: unread ? 700 : 500,
                      color: "var(--color-text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {title}
                  </span>
                  {body && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {body}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-muted)",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {KIND_LABEL[n.kind]} · {relativeTime(n.created_at)}
                  </span>
                </span>
                {unread && (
                  <span
                    aria-label="Unread"
                    style={{
                      flexShrink: 0,
                      marginTop: 6,
                      color: "var(--color-primary)",
                    }}
                  >
                    <Circle size={8} fill="currentColor" />
                  </span>
                )}
              </button>
            );
          })}

        {!loading && !error && hasMore && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingMore}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "transparent",
              border: 0,
              color: "var(--color-primary)",
              cursor: loadingMore ? "default" : "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {loadingMore ? "Loading…" : "Load older"}
          </button>
        )}
      </div>
    </div>
  );
}
