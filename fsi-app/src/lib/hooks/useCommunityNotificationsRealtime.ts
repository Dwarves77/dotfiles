// ══════════════════════════════════════════════════════════════════════════
// C9 — useCommunityNotificationsRealtime
// ──────────────────────────────────────────────────────────────────────────
// Subscribes to row changes on `notifications` for a given user_id and
// invokes the supplied handler on INSERT (new notification) and UPDATE
// (read_at changed). DELETE is not subscribed because notifications are
// retained indefinitely per migration 032.
//
// Lifecycle: open on mount/userId change, close on unmount, pause when
// document is hidden, resume on visible. Skip if userId is null. No-op
// fallback if the singleton client is unavailable.
//
// Channel name: notifications:user_id=<uuid>
//
// See docs/C9-realtime-spec.md for the integration contract.
// ══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  getRealtimeClient,
  notificationsChannelName,
  type NotificationRow,
  type RealtimeNotificationsHandler,
} from "../community/realtime";

export function useCommunityNotificationsRealtime(
  userId: string | null | undefined,
  handler: RealtimeNotificationsHandler
): void {
  const handlerRef = useRef<RealtimeNotificationsHandler>(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!userId) return;

    const client = getRealtimeClient();
    if (!client) return;

    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const subscribe = () => {
      if (cancelled || channel) return;
      try {
        channel = client
          .channel(notificationsChannelName(userId))
          .on(
            "postgres_changes" as never,
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${userId}`,
            },
            (payload: {
              eventType: "INSERT" | "UPDATE" | "DELETE";
              new: NotificationRow | Record<string, never>;
              old: NotificationRow | Record<string, never>;
            }) => {
              // notifications are retain-forever; ignore DELETE events.
              if (payload.eventType === "DELETE") return;

              const isEmpty = (
                obj: NotificationRow | Record<string, never>
              ): obj is Record<string, never> =>
                !obj || Object.keys(obj).length === 0;

              handlerRef.current({
                type: payload.eventType,
                new: isEmpty(payload.new)
                  ? undefined
                  : (payload.new as NotificationRow),
                old: isEmpty(payload.old)
                  ? undefined
                  : (payload.old as NotificationRow),
              });
            }
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              // eslint-disable-next-line no-console
              console.warn(
                `[realtime] notifications channel for user ${userId} ` +
                  `reported ${status}; bell should remain on polling.`
              );
            }
          });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          "[realtime] Failed to open notifications channel; " +
            "falling back to no-op.",
          err
        );
        channel = null;
      }
    };

    const unsubscribe = () => {
      if (channel) {
        client.removeChannel(channel).catch(() => {
          // Swallow — we're tearing down anyway.
        });
        channel = null;
      }
    };

    if (
      typeof document === "undefined" ||
      document.visibilityState === "visible"
    ) {
      subscribe();
    }

    const onVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        subscribe();
      } else {
        unsubscribe();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      cancelled = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      unsubscribe();
    };
  }, [userId]);
}
