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

type AttentionFetchResult = { row: AttentionCounts; rpcError: string | null };

// Server-side cache around the RPC. Keyed by admin user id so each admin gets an isolated entry.
// The RPC currently returns platform-wide counts (so all entries are content-identical), but the
// userId key future-proofs against the RPC becoming workspace-scoped. 30s TTL matches the HTTP
// positive cache; APP_DATA_TAG aligns with existing mutation revalidation.
export const fetchAttentionCounts = unstable_cache(
  async (_userId: string): Promise<AttentionFetchResult> => {
    void _userId; // unused in the body by design: unstable_cache keys the cache entry off this
    // argument's value (see the per-admin cache-key comment above), the callback never reads it.
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
