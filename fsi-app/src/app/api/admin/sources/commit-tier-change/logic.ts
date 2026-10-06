// Decision + write for POST /api/admin/sources/commit-tier-change, kept beside route.ts because a route
// file may export only handlers (F34). Lane G7-TIER (2026-10-05).

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

interface PriorSourceRow {
  id: string;
  base_tier: number | null;
  tier_override: number | null;
}

/** Only the calls commitSeededTierChange makes on the sources table. */
interface SourcesSelectChain {
  eq(column: string, value: string): SourcesSelectChain;
  maybeSingle(): QueryResult<PriorSourceRow>;
}
interface SourcesUpdateChain {
  eq(column: string, value: string): SourcesUpdateChain;
  is(column: string, value: null): SourcesUpdateChain;
  select(columns: string): QueryResult<Array<{ id: string }>>;
}
interface SourcesTable {
  select(columns: string): SourcesSelectChain;
  update(patch: { base_tier: number }): SourcesUpdateChain;
}

export interface CommitTierChangeClient {
  from(table: "sources"): SourcesTable;
}

export type CommitTierChangeResult =
  | { status: 200; body: { success: true; source_id: string; prior_tier: number | null; tier: number } }
  | { status: 404 | 409 | 500; body: { error: string } };

import { notUnderTierOverride } from "@/lib/sources/tier-override-guard.mjs";

function overrideRefusal(sourceId: string, override: number | null): CommitTierChangeResult {
  return {
    status: 409,
    body: {
      error:
        `source ${sourceId} carries an admin tier_override${override == null ? "" : ` (tier ${override})`}; ` +
        `base_tier is not written underneath it. Revert the override first via ` +
        `/api/admin/sources/${sourceId}/tier-override, then commit the tier change.`,
    },
  };
}

/**
 * Operator-decided base_tier update for a seeded source. Refuses (409) a source under an admin override,
 * both on the read and, for an override set after the read, in the UPDATE statement itself.
 */
export async function commitSeededTierChange(
  supabase: CommitTierChangeClient,
  sourceId: string,
  tier: number
): Promise<CommitTierChangeResult> {
  const { data: prior } = await supabase.from("sources").select("id, base_tier, tier_override").eq("id", sourceId).maybeSingle();
  if (!prior) return { status: 404, body: { error: "source not found" } };
  if (prior.tier_override != null) return overrideRefusal(sourceId, prior.tier_override);

  const { data: written, error: updErr } = await notUnderTierOverride(
    supabase.from("sources").update({ base_tier: tier }).eq("id", sourceId)
  ).select("id");
  if (updErr) return { status: 500, body: { error: `tier update failed: ${updErr.message}` } };
  if (!written || written.length === 0) return overrideRefusal(sourceId, null);

  return { status: 200, body: { success: true, source_id: sourceId, prior_tier: prior.base_tier ?? null, tier } };
}
