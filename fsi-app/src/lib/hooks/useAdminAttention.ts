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
 */
export function useAdminAttention(): UseAdminAttention {
  const { user, loading: authLoading } = useAuth();
  const userRole = useWorkspaceStore((s) => s.userRole);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const enabled = !authLoading && !!user && isAdmin;

  const [counts, setCounts] = useState<AdminAttentionCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable refs so the polling effect doesn't re-subscribe on every re-render.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCounts = useCallback(async () => {
    if (!enabledRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLoading(false);
        return;
      }
      const resp = await fetch("/api/admin/attention", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!resp.ok) {
        // 403 means we're not a platform admin after all — stay silent.
        if (resp.status === 403) {
          setCounts(ZERO);
          setLoading(false);
          return;
        }
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as AdminAttentionCounts;
      setCounts(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    // Immediate fetch on start so the badge populates without a 60s wait.
    fetchCounts();
    intervalRef.current = setInterval(fetchCounts, POLL_INTERVAL_MS);
  }, [fetchCounts]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopPolling();
      // Reset to null when role/auth changes away from admin so a stale
      // count never leaks across role transitions.
      setCounts(null);
      return;
    }

    // Skip polling when document is hidden at mount; the visibility
    // listener below will start it when the tab becomes visible again.
    const visible =
      typeof document === "undefined" || document.visibilityState === "visible";
    if (visible) startPolling();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopPolling();
    };
  }, [enabled, startPolling, stopPolling]);

  return {
    counts,
    total: counts?.total ?? 0,
    loading,
    error,
    refresh: fetchCounts,
  };
}
