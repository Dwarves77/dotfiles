"use client";

// useListOrder — the browser half of the personal drag order (migrations 237 +
// 238, /api/user/list-order). One hook, every orderable surface.
//
// WHAT IT OWNS. The stored order as an ARRAY OF IDS, and the optimistic update
// applied to that array when the user drops a row. Ranks handed to the caller
// are array indices, never the stored `position`: position is numeric and
// arrives as a string precisely so no JavaScript ever rounds it (migration
// 238's whole premise). The server does the arithmetic; this hook does the
// bookkeeping.
//
// WHY OPTIMISTIC. The PATCH revalidates APP_DATA_TAG, so the authoritative
// order comes back on the next server render, which is a whole round trip after
// the finger leaves the row. Without a local apply the row would snap back to
// where it started and then jump to its new home a moment later. On failure the
// snapshot is restored and the caller is told, so a rejected drag visibly
// un-does rather than silently pretending to have worked.
//
// FAIL-SOFT ON LOAD. Signed out, offline, or any non-200 leaves the order
// empty, which the comparator reads as "nothing is placed" and every surface
// falls back to its own natural sort. A user who has never dragged anything and
// a user whose fetch failed see the same correct default.
//
// PERF-9 (2026-09-04, item 5, ADR-026 §4): the INITIAL load reads from the
// shared useWorkspaceBootstrap() singleton (GET /api/workspace/bootstrap,
// which fetches every list_key in ONE query) instead of this hook's own
// per-listKey GET /api/user/list-order. move()/reset() are UNCHANGED — they
// still PATCH/DELETE that route directly, since a drag is a live mutation the
// bootstrap snapshot (fetched once per session) has no business serving.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { LIST_ORDER_ITEM_ID_MAX, LIST_ORDER_SEED_MAX } from "@/lib/list-order";
import { useWorkspaceBootstrap } from "@/lib/hooks/useWorkspaceBootstrap";

/** Mirrors LIST_KEYS in /api/user/list-order. */
export type ListOrderKey =
  | "watchlist"
  | "regulations"
  | "market"
  | "research"
  | "operations";

interface ListOrderApiRow {
  itemId: string;
  position: string;
}

async function authHeader(): Promise<Record<string, string> | null> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export interface UseListOrder {
  /** item id → rank (array index). Empty until loaded, and empty for a user
   *  who has never arranged this list. */
  ranks: Map<string, number>;
  /** True once the stored order has been read, whether or not it had rows.
   *  Surfaces use this to avoid re-sorting mid-flight and flashing two orders. */
  loaded: boolean;
  /** True when this list carries at least one stored position, which is what
   *  makes "reset to the default order" worth offering. */
  hasOrder: boolean;
  /** Place `itemId` between the two ids it was dropped between, in the caller's
   *  post-drop order. Either neighbour may be null at the head or tail.
   *  `seedItemIds` is the caller's FULL list in post-drop order and is used
   *  only on the first drag of a list that has never been arranged. */
  move: (args: {
    itemId: string;
    prevItemId: string | null;
    nextItemId: string | null;
    seedItemIds: string[];
  }) => Promise<boolean>;
  /** Clear every stored position for this list. */
  reset: () => Promise<boolean>;
  /** Last failure, cleared on the next successful call. */
  error: string | null;
}

export function useListOrder(listKey: ListOrderKey): UseListOrder {
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read inside move() so the optimistic snapshot is the CURRENT array rather
  // than the one captured when the callback was created; without this, two
  // drags in quick succession would revert to a stale list on the second.
  const orderedRef = useRef<string[]>([]);

  // SINGLE WRITE PATH for the order. The ref and the state move together, in
  // effects and event handlers, which is the only place a ref may legally be
  // written: assigning `ref.current` during render is a React rule violation
  // (react-hooks/refs) and tears under concurrent rendering, because a render
  // that is thrown away would still have mutated the ref. Every mutation below
  // goes through here so the two can never disagree.
  const setOrder = useCallback((next: string[]) => {
    orderedRef.current = next;
    setOrderedIds(next);
  }, []);

  const { data: bootstrap, settled: bootstrapSettled, error: bootstrapError } = useWorkspaceBootstrap();
  // Applied at most once per listKey per settled bootstrap attempt — a
  // re-render on an unrelated bootstrap publish (another consumer's data
  // arriving) must not re-seed and clobber an in-flight optimistic drag.
  // Reset when listKey itself changes (surface switch).
  const appliedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (appliedKeyRef.current === listKey) return;
    // Not yet settled (first attempt still in flight, or not yet kicked off
    // this render pass): wait for it rather than seeding from a stale/partial
    // snapshot. See useWorkspaceBootstrap's `settled` doc comment for why this
    // is `settled`, not `loading`.
    if (!bootstrapSettled) return;

    if (bootstrap) {
      appliedKeyRef.current = listKey;
      // The route returns rows already ordered by position ascending, so the
      // array index is the rank and nothing here parses a position.
      const rows: ListOrderApiRow[] = bootstrap.listOrders[listKey] ?? [];
      setOrder(rows.map((r) => r.itemId));
      setLoaded(true);
      return;
    }

    if (bootstrapError) {
      // Fail-soft, mirroring the old per-key fetch's non-200/exception path:
      // fall back to the surface's natural order rather than blocking on it.
      console.warn(
        `[list-order] ${listKey} bootstrap load failed: ${bootstrapError}; falling back to the surface's natural order.`
      );
      appliedKeyRef.current = listKey;
      setLoaded(true);
      return;
    }

    // Settled with neither data nor error: signed-out (the singleton's fetch
    // short-circuits before calling the API when there is no auth token).
    // Same fail-soft default as before — empty order, natural sort applies.
    appliedKeyRef.current = listKey;
    setLoaded(true);
  }, [listKey, bootstrap, bootstrapSettled, bootstrapError, setOrder]);

  const ranks = useMemo(() => {
    const m = new Map<string, number>();
    orderedIds.forEach((id, i) => m.set(id, i));
    return m;
  }, [orderedIds]);

  const move = useCallback<UseListOrder["move"]>(
    async ({ itemId, prevItemId, nextItemId, seedItemIds }) => {
      const snapshot = orderedRef.current;

      if (itemId.length > LIST_ORDER_ITEM_ID_MAX) {
        setError(`Item id exceeds ${LIST_ORDER_ITEM_ID_MAX} characters.`);
        return false;
      }

      // A seed the client would have to truncate is worse than no seed at all
      // (see LIST_ORDER_SEED_MAX). Send none, let the server append, and say so
      // out loud rather than shipping a silently wrong order.
      const seed = seedItemIds.length <= LIST_ORDER_SEED_MAX ? seedItemIds : null;
      if (!seed) {
        console.warn(
          `[list-order] ${listKey} has ${seedItemIds.length} rows, past the ${LIST_ORDER_SEED_MAX} seed bound; this drag appends instead of placing.`
        );
      }

      // Optimistic apply, mirroring what the RPC does with positions: the moved
      // id lands directly after its previous neighbour, else directly before its
      // next one, else at the end.
      const base =
        snapshot.length === 0 && seed ? seed.slice() : snapshot.slice();
      const without = base.filter((id) => id !== itemId);
      let at = without.length;
      if (prevItemId) {
        const i = without.indexOf(prevItemId);
        if (i >= 0) at = i + 1;
      } else if (nextItemId) {
        const i = without.indexOf(nextItemId);
        if (i >= 0) at = i;
      }
      without.splice(at, 0, itemId);
      setOrder(without);

      try {
        const headers = await authHeader();
        if (!headers) {
          setOrder(snapshot);
          setError("Sign in to arrange this list.");
          return false;
        }
        const res = await fetch("/api/user/list-order", {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            listKey,
            itemId,
            prevItemId,
            nextItemId,
            ...(seed ? { seedItemIds: seed } : {}),
          }),
        });
        if (!res.ok) {
          setOrder(snapshot);
          const detail = await res.json().catch(() => null);
          setError(
            (detail as { error?: string } | null)?.error ??
              `Could not save that move (${res.status}).`
          );
          return false;
        }
        setError(null);
        return true;
      } catch (e: unknown) {
        setOrder(snapshot);
        setError(e instanceof Error ? e.message : "Could not save that move.");
        return false;
      }
    },
    [listKey, setOrder]
  );

  const reset = useCallback(async () => {
    const snapshot = orderedRef.current;
    setOrder([]);
    try {
      const headers = await authHeader();
      if (!headers) {
        setOrder(snapshot);
        setError("Sign in to arrange this list.");
        return false;
      }
      const res = await fetch(
        `/api/user/list-order?list_key=${encodeURIComponent(listKey)}`,
        { method: "DELETE", headers }
      );
      if (!res.ok) {
        setOrder(snapshot);
        setError(`Could not clear the order (${res.status}).`);
        return false;
      }
      setError(null);
      return true;
    } catch (e: unknown) {
      setOrder(snapshot);
      setError(e instanceof Error ? e.message : "Could not clear the order.");
      return false;
    }
  }, [listKey, setOrder]);

  return { ranks, loaded, hasOrder: orderedIds.length > 0, move, reset, error };
}
