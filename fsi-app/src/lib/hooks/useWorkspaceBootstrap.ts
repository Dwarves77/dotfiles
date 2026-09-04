"use client";

// useWorkspaceBootstrap — PERF-9 (2026-09-04, item 5, ADR-026 §4).
//
// Module-level singleton (mirrors useAdminAttention.ts's dedup pattern, 2026-05-08)
// fetching /api/workspace/bootstrap ONCE per session and sharing the result across
// every mounted consumer. Before this, a single navigation could fire THREE
// independent per-user round trips fanning out from three different hooks/
// components: usePersonalStateHydration (personal-state), useListOrder (one call
// per list surface), and OwnerTeamCard (members) — each with its own auth-session
// read and its own fetch. Now all three read from the ONE shared response.
//
// CACHEABLE FOR THE SESSION, not polled: unlike admin-attention (which changes
// server-side from OTHER users' actions and needs a 60s heartbeat), personal-state,
// list-order, and members only change from THIS user's own mutations, which already
// apply optimistically in their own local state (resourceStore / useListOrder's
// orderedIds) and are never read back from this singleton after the initial seed.
// So one fetch per page-load session is correct — no polling loop needed here.
//
// Non-blocking: nothing awaits this before first paint. The shell renders
// immediately; consumers apply bootstrap data when (if) it arrives, same fail-soft
// contract each hook already had (signed out / offline / non-200 → empty defaults).

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export interface BootstrapPersonalStateItem {
  itemId: string;
  legacyId: string | null;
  title: string | null;
  isArchived: boolean;
  archiveNote: string | null;
  archivedAt: string | null;
}

export interface BootstrapListOrderEntry {
  itemId: string;
  position: string;
}

export interface BootstrapMember {
  user_id: string;
  role: string;
  display_name: string;
  avatar_url: string | null;
}

export interface BootstrapAdminAttention {
  provisional_sources_pending: number;
  staged_updates_pending: number;
  staged_updates_materialization_failed: number;
  integrity_flags_unresolved: number;
  platform_integrity_flags_open: number;
  source_attribution_mismatches: number;
  auto_approved_awaiting_spotcheck: number;
  coverage_gaps_critical: number;
  total: number;
}

// PERF-10 (2026-09-04, ADR-026 Follow-up / migration 306): structural echo of
// WorkspaceOverrideRow (src/lib/supabase-server.ts) — which is itself the same
// shape resourceStore.ts's WorkspaceOverride expects verbatim (setOverrides
// takes WorkspaceOverride[] and keys a Map by itemId). Duplicated rather than
// imported because this is a "use client" hook — supabase-server.ts value-
// imports next/cache's unstable_cache, which is server-only. Field names/
// shapes must stay in sync by hand; see bootstrap/logic.ts's loadOverrides
// header for the server side of this contract.
export interface BootstrapOverrideRow {
  itemId: string;
  priorityOverride: string | null;
  isArchived: boolean;
  archiveReason: string | null;
  archiveNote: string | null;
  notes: string;
  dismissedAt?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
}

export interface WorkspaceBootstrapData {
  personalState: BootstrapPersonalStateItem[];
  listOrders: Record<string, BootstrapListOrderEntry[]>;
  members: BootstrapMember[] | null;
  adminAttention: BootstrapAdminAttention | null;
  // Absent/undefined on responses from before this field existed — callers
  // must treat `overrides` as optional, never assume presence.
  overrides?: BootstrapOverrideRow[];
  /** PERF-12 (2026-09-04, ADR-027 §5/item 4): the caller's own org_id, session-resolved server-side
   *  (route.ts's `loadOrgId`) — forwarded by listing-route callers as `X-Org-Id` for the server to
   *  VERIFY against its own session-derived value, never trusted as the thing that scopes a query.
   *  `null` when signed out or org-less, same as `members`. */
  orgId: string | null;
}

interface SingletonState {
  data: WorkspaceBootstrapData | null;
  loading: boolean;
  error: string | null;
  // False until the FIRST fetch attempt has fully resolved (success, HTTP
  // error, thrown exception, or "no auth token"). Consumers that need to
  // distinguish "not fetched yet" from "fetched and genuinely empty" (the
  // signed-out case, where data stays null and error stays null) must gate
  // on this rather than on `loading` — `loading` starts false and only flips
  // true partway through the FIRST render's effect pass (performFetch sets it
  // synchronously, but that state write is published on a LATER commit), so a
  // consumer's own effect can observe stale `loading: false` in the very same
  // commit performFetch was kicked off in, before the singleton has done
  // anything. `settled` has no such window: it starts false and is flipped
  // true only from inside performFetch's async continuation, strictly after
  // the initial commit.
  settled: boolean;
}

const singleton: {
  state: SingletonState;
  inFlight: Promise<void> | null;
  subscribers: Set<(s: SingletonState) => void>;
  attempted: boolean;
} = {
  state: { data: null, loading: false, error: null, settled: false },
  inFlight: null,
  subscribers: new Set(),
  attempted: false,
};

function publish() {
  for (const sub of singleton.subscribers) sub(singleton.state);
}

async function performFetch(): Promise<void> {
  if (singleton.inFlight) return singleton.inFlight;
  singleton.state = { ...singleton.state, loading: true, error: null };
  publish();
  const promise = (async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        // Signed out — nothing personal to load. Leave prior data (if any) in
        // place and clear loading; every consumer's own empty-default applies.
        singleton.state = {
          data: singleton.state.data,
          loading: false,
          error: null,
          settled: true,
        };
        publish();
        return;
      }
      const resp = await fetch("/api/workspace/bootstrap", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        singleton.state = {
          data: singleton.state.data,
          loading: false,
          error: `HTTP ${resp.status}`,
          settled: true,
        };
        publish();
        return;
      }
      const body = (await resp.json()) as WorkspaceBootstrapData;
      singleton.state = { data: body, loading: false, error: null, settled: true };
      publish();
    } catch (e: unknown) {
      singleton.state = {
        data: singleton.state.data,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
        settled: true,
      };
      publish();
    }
  })();
  singleton.inFlight = promise;
  try {
    await promise;
  } finally {
    singleton.inFlight = null;
  }
}

function subscribe(cb: (s: SingletonState) => void): () => void {
  singleton.subscribers.add(cb);
  return () => {
    singleton.subscribers.delete(cb);
  };
}

export interface UseWorkspaceBootstrap extends SingletonState {
  /** Manually re-fetch, e.g. after sign-in when the singleton's first attempt
   *  ran signed-out and cached an empty result. */
  refresh: () => void;
}

export function useWorkspaceBootstrap(): UseWorkspaceBootstrap {
  const [snapshot, setSnapshot] = useState<SingletonState>(singleton.state);

  useEffect(() => {
    const unsubscribe = subscribe(setSnapshot);
    // Sync immediately — another mounted consumer may already hold data.
    setSnapshot(singleton.state);

    if (!singleton.attempted) {
      singleton.attempted = true;
      void performFetch();
    } else if (
      singleton.state.data === null &&
      !singleton.inFlight &&
      singleton.state.error === null
    ) {
      // Prior attempt ran signed-out (no token) and cached a null result.
      // A later mount (post sign-in) retries rather than staying empty forever.
      void performFetch();
    }

    return unsubscribe;
  }, []);

  const refresh = useCallback(() => {
    void performFetch();
  }, []);

  return { ...snapshot, refresh };
}
