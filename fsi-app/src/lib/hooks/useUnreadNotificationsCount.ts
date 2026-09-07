"use client";

/**
 * useUnreadNotificationsCount — the one place that reads the signed-in
 * user's unread-notifications count (migration 032 `notifications` table,
 * RLS self-only). Extracted from NotificationsBell.tsx (mobile-390 lane,
 * 2026-09-07) so a second call site — the mobile top bar's avatar dot
 * (docs/design/handoff-2026-09-06 mobile-390 spec, TOP BAR) — reads the
 * same count instead of re-implementing the fetch (CLAUDE.md rule 13).
 *
 * Same endpoint NotificationsBell always used:
 * GET /api/community/notifications?unread_only=true&limit=1 — cheap (limit
 * 1, only `unread_count` is read from the response), same auth/RLS as the
 * full list. Polls every 60s only while the tab is visible; fails soft
 * (network blip keeps the last known count, a non-OK response is ignored)
 * so a badge never shows a wrong number louder than silence.
 */

import { useEffect, useState, useCallback } from "react";

const POLL_INTERVAL_MS = 60_000;
const COUNT_FETCH_PATH = "/api/community/notifications?unread_only=true&limit=1";

interface CountResponse {
  unread_count: number;
}

export function useUnreadNotificationsCount() {
  const [unreadCount, setUnreadCount] = useState(0);

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

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId !== null) return;
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

  return {
    unreadCount,
    setUnreadCount: (next: number) => setUnreadCount(Math.max(0, next)),
  };
}
