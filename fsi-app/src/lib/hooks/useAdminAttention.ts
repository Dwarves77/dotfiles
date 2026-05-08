"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export interface AdminAttentionCounts {
  provisional_sources_pending: number;
  staged_updates_pending: number;
  staged_updates_materialization_failed: number;
  integrity_flags_unresolved: number;
  source_attribution_mismatches: number;
  auto_approved_awaiting_spotcheck: number;
  coverage_gaps_critical: number;
  total: number;
}

export interface UseAdminAttention {
  counts: AdminAttentionCounts | null;
  total: number;
  loading: boolean;
  error: string | null;
  /** Manually trigger a fetch outside the polling cadence. */
  refresh: () => void;
}

const ZERO: AdminAttentionCounts = {
  provisional_sources_pending: 0,
  staged_updates_pending: 0,
  staged_updates_materialization_failed: 0,
  integrity_flags_unresolved: 0,
  source_attribution_mismatches: 0,
  auto_approved_awaiting_spotcheck: 0,
  coverage_gaps_critical: 0,
  total: 0,
};

const POLL_INTERVAL_MS = 60_000;

// ─── Module-level singleton (perf v2 — 2026-05-08) ────────────────────────
// Multiple components mount this hook simultaneously (UserMenu in the
// shared layout, IssuesQueue on /admin, AtAGlanceBlock on /profile, plus
// React 19 StrictMode + workspace-store hydration races that can fire two
// effects in quick succession on the same component). Per-instance fetch
// state used to fan out into 2+ /api/admin/attention round-trips per
// navigation, each paying the 500-1500 ms auth+RPC cost reported in the
// perf v2 baseline.
//
// This singleton hoists the in-flight promise, the latest snapshot, and a
// subscriber set into module scope. The hook becomes a thin React adapter
// over the singleton: any number of mounted hooks coalesce onto ONE
// in-flight request, and the polling timer + visibility listener also live
// at module scope so re-mounts don't restart the timer.
//
// Non-admins never reach the singleton — `enabled === false` short-circuits
// before any module state is touched, so no fetch ever fires for them.
// ──────────────────────────────────────────────────────────────────────────

interface SingletonState {
  counts: AdminAttentionCounts | null;
  loading: boolean;
  error: string | null;
}

const singleton: {
  state: SingletonState;
  inFlight: Promise<void> | null;
  subscribers: Set<(s: SingletonState) => void>;
  intervalId: ReturnType<typeof setInterval> | null;
  visibilityHandler: (() => void) | null;
  // True once at least one component has registered as enabled (admin user
  // mounted the hook). Used so subsequent hook instances skip the
  // immediate-fetch path when a fresh snapshot is already cached.
  bootstrapped: boolean;
} = {
  state: { counts: null, loading: false, error: null },
  inFlight: null,
  subscribers: new Set(),
  intervalId: null,
  visibilityHandler: null,
  bootstrapped: false,
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
      if (!session?.access_token) {
        singleton.state = {
          counts: singleton.state.counts,
          loading: false,
          error: null,
        };
        publish();
        return;
      }
      const resp = await fetch("/api/admin/attention", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        // Drop the no-store override so the browser HTTP cache honours
        // the route's `Cache-Control: private, max-age=30` (perf v2 —
        // 2026-05-08). Within the cache window, duplicate calls (from
        // visibility-change races, hydration timing, etc.) resolve from
        // the disk/memory cache instead of round-tripping to the API.
      });
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          // Not an admin (or session expired between gate-check and fetch).
          // Treat as zero counts so the UI dot stays hidden, but DON'T set
          // an error — a 401/403 here is the expected non-admin path.
          singleton.state = {
            counts: ZERO,
            loading: false,
            error: null,
          };
          publish();
          return;
        }
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as AdminAttentionCounts;
      singleton.state = { counts: data, loading: false, error: null };
      publish();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      singleton.state = {
        counts: singleton.state.counts,
        loading: false,
        error: msg,
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

function ensurePolling() {
  if (typeof window === "undefined") return;
  if (singleton.intervalId !== null) return;
  const tick = () => {
    if (document.visibilityState !== "visible") return;
    void performFetch();
  };
  singleton.intervalId = setInterval(tick, POLL_INTERVAL_MS);
  if (!singleton.visibilityHandler) {
    singleton.visibilityHandler = () => {
      if (document.visibilityState === "visible") void performFetch();
    };
    document.addEventListener("visibilitychange", singleton.visibilityHandler);
  }
}

function teardownPollingIfIdle() {
  if (singleton.subscribers.size > 0) return;
  if (singleton.intervalId !== null) {
    clearInterval(singleton.intervalId);
    singleton.intervalId = null;
  }
  if (singleton.visibilityHandler) {
    document.removeEventListener("visibilitychange", singleton.visibilityHandler);
    singleton.visibilityHandler = null;
  }
  // Reset bootstrapped so a re-mount after sign-out → sign-in fetches fresh.
  singleton.bootstrapped = false;
  singleton.state = { counts: null, loading: false, error: null };
}

function subscribe(cb: (s: SingletonState) => void): () => void {
  singleton.subscribers.add(cb);
  return () => {
    singleton.subscribers.delete(cb);
    teardownPollingIfIdle();
  };
}

/**
 * Hook: useAdminAttention.
 *
 * Polls /api/admin/attention every 60 seconds when ALL of the following hold:
 *   - the user is authenticated
 *   - the user is a platform admin (workspace role owner|admin)
 *   - the document is visible (document.visibilityState === "visible")
 *
 * Stops polling automatically when the tab is hidden and resumes on
 * visibilitychange. No Supabase Realtime / WebSocket — explicit polling
 * per the W2.E spec.
 *
 * Non-admins (and signed-out users) get { counts: null, total: 0 } and
 * never trigger a network request — the sidebar dot must stay invisible
 * for them regardless of the API answer.
 *
 * Multiple mounted instances share ONE in-flight request and ONE polling
 * timer via a module-level singleton (perf v2 — 2026-05-08). Previously
 * each call site fired its own /api/admin/attention round-trip; on the
 * shared layout that fanned out to 2+ duplicate fetches per navigation.
 */
export function useAdminAttention(): UseAdminAttention {
  const { user, loading: authLoading } = useAuth();
  const userRole = useWorkspaceStore((s) => s.userRole);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const enabled = !authLoading && !!user && isAdmin;

  const [snapshot, setSnapshot] = useState<SingletonState>(() =>
    enabled ? singleton.state : { counts: null, loading: false, error: null }
  );
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const refresh = useCallback(() => {
    if (!enabledRef.current) return;
    void performFetch();
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Reset local snapshot so a stale count doesn't leak across role
      // transitions (e.g., admin signs out, hook re-renders for the
      // anonymous request that might follow).
      setSnapshot({ counts: null, loading: false, error: null });
      return;
    }

    // Subscribe BEFORE bootstrapping so we receive the publish() that
    // performFetch issues during its initial loading -> resolved cycle.
    const unsubscribe = subscribe(setSnapshot);

    // Sync the snapshot to the singleton's current state — if another
    // hook instance already populated counts, we render them immediately
    // without waiting for our own subscribe-then-fetch cycle to land.
    setSnapshot(singleton.state);

    if (!singleton.bootstrapped) {
      singleton.bootstrapped = true;
      // Immediate fetch on first admin mount so the badge populates
      // without waiting on the polling cadence.
      void performFetch();
    } else if (singleton.state.counts === null && !singleton.inFlight) {
      // A previous teardown cleared the snapshot; fetch fresh.
      void performFetch();
    }
    // Polling and visibility-change handler live at module scope; ensure
    // they exist for the lifetime of any subscribed hook instance.
    ensurePolling();

    return unsubscribe;
  }, [enabled]);

  return {
    counts: enabled ? snapshot.counts : null,
    total: enabled ? snapshot.counts?.total ?? 0 : 0,
    loading: enabled ? snapshot.loading : false,
    error: enabled ? snapshot.error : null,
    refresh,
  };
}
