// Pure response shaping for POST /api/admin/recompute-trust, split out of route.ts (BUILDGATE,
// 2026-09-02, F34's named residual / build-graph proof). Next 16's route-type validator rejects a
// route.ts that exports anything besides route handlers/config fields, so the pure function lives in
// this sibling module and route.ts imports it. route.npmtest.mjs imports this module directly.
//
// S1-C (2026-10-04): this module used to hold demotionOutcomeFor, the propose-only demotion recorder
// (applied: false, never a tier write). The route now applies tier movement through the one calculator in
// src/lib/trust.ts (planTierMovements / applyTierMovements), so the proposal recorder is gone and this
// module shapes the route's tier_movement response block from the plan and the apply result.

import { notUnderTierOverride } from "@/lib/sources/tier-override-guard.mjs";
import type { TierMovementApplyResult, TierMovementPlan, TierMovementWriters } from "@/lib/trust";

type WriteResult = PromiseLike<{ data?: Array<{ id: string }> | null; error: { message: string } | null }>;

/** Only the calls the route's tier and event writers make. */
export interface TierWriteClient {
  from(table: "sources"): {
    update(patch: { effective_tier: number }): {
      eq(column: string, value: string): { is(column: string, value: null): { select(columns: string): WriteResult } };
    };
  };
  from(table: "source_trust_events"): { insert(row: Record<string, unknown>): WriteResult };
}

/**
 * The route's tier-movement writers. The tier write is one UPDATE with `tier_override IS NULL` in the
 * statement; zero matched rows means an override was set after the plan was read, so it returns
 * `{ written: false }` and applyTierMovements records no audit event for it (G7-TIER).
 */
export function tierMovementWriters(supabase: TierWriteClient): TierMovementWriters {
  return {
    setEffectiveTier: async (sourceId, tier) => {
      const { data, error } = await notUnderTierOverride(supabase.from("sources").update({ effective_tier: tier }).eq("id", sourceId)).select("id");
      if (error) throw new Error(error.message);
      return { written: Array.isArray(data) && data.length > 0 };
    },
    insertEvent: async (event) => {
      const { error } = await supabase.from("source_trust_events").insert(event);
      if (error) throw new Error(error.message);
    },
  };
}

export function tierMovementSummary(plan: TierMovementPlan, applied: TierMovementApplyResult) {
  return {
    scanned: plan.scanned,
    override_held: plan.override_held,
    held_cadence_off: plan.held_cadence_off,
    skipped: plan.skipped.length,
    planned: plan.movements.length,
    applied: applied.applied,
    promotions: applied.promotions,
    demotions: applied.demotions,
    write_failed: applied.write_failed,
    event_failed: applied.event_failed,
    override_skipped: applied.override_skipped,
    failures: applied.failures.slice(0, 10), // first 10 only, the workflow log is finite
    samples: plan.movements.slice(0, 10).map((m) => ({
      source: m.name ?? m.source_id,
      before_tier: m.decision.before_tier,
      after_tier: m.decision.after_tier,
      rules: m.decision.rules,
    })),
  };
}
