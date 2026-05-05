// ══════════════════════════════════════════════════════════════════════════
// C9 — useCommunityPostsRealtime
// ──────────────────────────────────────────────────────────────────────────
// Subscribes to row changes on `community_posts` for a given group_id and
// invokes the supplied handler on INSERT / UPDATE / DELETE events.
//
// Lifecycle:
//   - Opens a channel on mount (or when groupId changes).
//   - Closes it on unmount.
//   - Pauses (unsubscribes) when the document is hidden, resumes on visible.
//   - Skips entirely if groupId is null/empty.
//   - Falls back to no-op (logs warn) if the singleton client is unavailable.
//     Components are expected to keep their existing fetch + polling so the
//     UI works without realtime.
//
// Channel name: community_posts:group_id=<uuid>
//
// See docs/C9-realtime-spec.md for the integration contract.
// ══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  getRealtimeClient,
  postsChannelName,
  type CommunityPostRow,
  type RealtimePostsHandler,
} from "../community/realtime";

export function useCommunityPostsRealtime(
  groupId: string | null | undefined,
  handler: RealtimePostsHandler
): void {
  // Hold the latest handler in a ref so we don't have to tear down the
  // channel every time the parent re-renders with a new closure.
  const handlerRef = useRef<RealtimePostsHandler>(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!groupId) return;

    const client = getRealtimeClient();
    if (!client) {
      // Singleton already logged the failure; this is the expected
      // graceful-degrade path. Component falls back to its own polling.
      return;
    }

    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const subscribe = () => {
      if (cancelled || channel) return;
      try {
        channel = client
          .channel(postsChannelName(groupId))
          .on(
            // postgres_changes is the tail for row-level events. Using a
            // postgres_changes filter on group_id keeps the server-side
            // payload small and avoids streaming every group's traffic to
            // every subscriber.
            "postgres_changes" as never,
            {
              event: "*",
              schema: "public",
              table: "community_posts",
              filter: `group_id=eq.${groupId}`,
            },
            (payload: {
              eventType: "INSERT" | "UPDATE" | "DELETE";
              new: CommunityPostRow | Record<string, never>;
              old: CommunityPostRow | Record<string, never>;
            }) => {
              const isEmpty = (
                obj: CommunityPostRow | Record<string, never>
              ): obj is Record<string, never> =>
                !obj || Object.keys(obj).length === 0;

              handlerRef.current({
                type: payload.eventType,
                new: isEmpty(payload.new)
                  ? undefined
                  : (payload.new as CommunityPostRow),
                old: isEmpty(payload.old)
                  ? undefined
                  : (payload.old as CommunityPostRow),
              });
            }
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              // eslint-disable-next-line no-console
              console.warn(
                `[realtime] community_posts channel for group ${groupId} ` +
                  `reported ${status}; component should remain on polling.`
              );
            }
          });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          "[realtime] Failed to open community_posts channel; " +
            "falling back to no-op.",
          err
        );
        channel = null;
      }
    };

    const unsubscribe = () => {
      if (channel) {
        // removeChannel cleans up server-side subscription and frees the
        // local websocket multiplexed slot.
        client.removeChannel(channel).catch(() => {
          // Swallow — we're tearing down anyway.
        });
        channel = null;
      }
    };

    // Open immediately if the tab is visible; otherwise wait for visibility.
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
  }, [groupId]);
}
