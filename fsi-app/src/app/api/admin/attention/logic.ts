// Shared admin-attention-counts fetcher, split out of route.ts (BUILDGATE, 2026-09-02, F34's named
// residual: a route.ts may export only route handlers/config — see list-order/logic.ts's identical
// precedent). PERF-9 (2026-09-04, item 5, ADR-026 §4): pulled out specifically so
// /api/workspace/bootstrap/route.ts can reuse the SAME unstable_cache entry (same cache key
// "admin-attention-counts-v1", same APP_DATA_TAG) instead of standing up a second, independently
// entry for the identical RPC — one cache, two callers, no duplicate admin_attention_counts() calls
// under load.

import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase-service";
import { APP_DATA_TAG } from "@/lib/data";

export interface AttentionCounts {
  provisional_sources_pending: number;
  staged_updates_pending: number;
  staged_updates_materialization_failed: number;
  integrity_flags_unresolved: number;
  // Platform integrity_flags table (migration 048) open+in_review — added in migration 140 so the
  // Issues Queue / red-dot no longer reads blind to the platform quarantine backlog.
  platform_integrity_flags_open: number;
  source_attribution_mismatches: number;
  auto_approved_awaiting_spotcheck: number;
  coverage_gaps_critical: number;
  total: number;
}

export const EMPTY_COUNTS: AttentionCounts = {
  provisional_sources_pending: 0,
  staged_updates_pending: 0,
  staged_updates_materialization_failed: 0,
  integrity_flags_unresolved: 0,
  platform_integrity_flags_open: 0,
  source_attribution_mismatches: 0,
  auto_approved_awaiting_spotcheck: 0,
  coverage_gaps_critical: 0,
  total: 0,
};

export type AttentionFetchResult = { row: AttentionCounts; rpcError: string | null };

// Server-side cache around the RPC. Keyed by admin user id so each admin gets an isolated entry.
// The RPC currently returns platform-wide counts (so all entries are content-identical), but the
// userId key future-proofs against the RPC becoming workspace-scoped. 30s TTL matches the HTTP
// positive cache; APP_DATA_TAG aligns with existing mutation revalidation.
export const fetchAttentionCounts = unstable_cache(
  async (_userId: string): Promise<AttentionFetchResult> => {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.rpc("admin_attention_counts");
    if (error) return { row: EMPTY_COUNTS, rpcError: error.message };
    const row: AttentionCounts =
      Array.isArray(data) && data.length > 0
        ? (data[0] as AttentionCounts)
        : EMPTY_COUNTS;
    return { row, rpcError: null };
  },
  ["admin-attention-counts-v1"],
  { revalidate: 30, tags: [APP_DATA_TAG] }
);
