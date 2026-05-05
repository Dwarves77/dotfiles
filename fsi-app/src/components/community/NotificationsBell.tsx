"use client";

/**
 * NotificationsBell — bell icon + unread count + dropdown.
 *
 * Behaviour:
 *   - On mount, fetches the current unread count.
 *   - Polls /api/community/notifications?unread_only=true&limit=1 every
 *     60s ONLY while document.visibilityState === "visible". Tab in
 *     background → poll pauses. Tab returns → poll fires immediately.
 *   - Click toggles a dropdown rendering <NotificationsList />.
 *   - When the dropdown opens, it triggers its own full-list fetch.
 *
 * Integration:
 *   The community surface mounts this in CommunityMasthead near the
 *   search box (recommended), or in CommunitySidebar / AppShell sidebar.
 *   Wiring is the orchestrator's call — see docs/C7-notifications-spec.md.
 *
 * No emojis. Light-first. Uses semantic tokens only.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import { NotificationsList } from "./NotificationsList";

const POLL_INTERVAL_MS = 60_000; // 60s when visible
const COUNT_FETCH_PATH =
  "/api/community/notifications?unread_only=true&limit=1";

interface CountResponse {
  unread_count: number;
}

export function NotificationsBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(COUNT_FETCH_PATH, { cache: "no-store" });
      if (!res.ok) return; // 401/429 — silently ignore for the badge
      const json: CountResponse = await res.json();
      if (typeof json.unread_count === "number") {
        setUnreadCount(json.unread_count);
      }
    } catch {
      // network blip — keep last known count, don't surface
    }
  }, []);

  // ── Polling: 60s when visible only ──────────────────────────────
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId !== null) return;
      // Fire immediately on (re)entry to visibility, then settle into 60s.
      fetchUnreadCount();
      intervalId = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchUnreadCount]);

  // ── Click-outside to close ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        dropdownRef.current?.contains(t) ||
        buttonRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // When the list updates the count (mark read / mark all read), it
  // calls back so the badge stays in sync without a roundtrip poll.
  const handleCountChange = useCallback((next: number) => {
    setUnreadCount(Math.max(0, next));
  }, []);

  const showBadge = unreadCount > 0;
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          showBadge
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          position: "relative",
          width: 36,
          height: 36,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 999,
          cursor: "pointer",
          color: "var(--color-text-secondary)",
        }}
      >
        <Bell size={18} aria-hidden="true" />
        {showBadge && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: "var(--color-error, #c0392b)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.02em",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--color-bg-surface)",
              lineHeight: 1,
            }}
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label="Notifications"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 380,
            maxWidth: "calc(100vw - 32px)",
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            boxShadow:
              "0 10px 30px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <NotificationsList
            onUnreadCountChange={handleCountChange}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
