// Pure response shaping for POST /api/admin/recompute-trust, split out of route.ts (BUILDGATE,
// 2026-09-02, F34's named residual / build-graph proof). Next 16's route-type validator rejects a
// route.ts that exports anything besides route handlers/config fields, so the pure function lives in
// this sibling module and route.ts imports it. route.npmtest.mjs imports this module directly.
//
// S1-C (2026-10-04): this module used to hold demotionOutcomeFor, the propose-only demotion recorder
// (applied: false, never a tier write). The route now applies tier movement through the one calculator in
// src/lib/trust.ts (planTierMovements / applyTierMovements), so the proposal recorder is gone and this
// module shapes the route's tier_movement response block from the plan and the apply result.

import type { TierMovementApplyResult, TierMovementPlan } from "@/lib/trust";

export function tierMovementSummary(plan: TierMovementPlan, applied: TierMovementApplyResult) {
  return {
    scanned: plan.scanned,
    override_held: plan.override_held,
    skipped: plan.skipped.length,
    planned: plan.movements.length,
    applied: applied.applied,
    promotions: applied.promotions,
    demotions: applied.demotions,
    write_failed: applied.write_failed,
    event_failed: applied.event_failed,
    failures: applied.failures.slice(0, 10), // first 10 only, the workflow log is finite
    samples: plan.movements.slice(0, 10).map((m) => ({
      source: m.name ?? m.source_id,
      before_tier: m.decision.before_tier,
      after_tier: m.decision.after_tier,
      rules: m.decision.rules,
    })),
  };
}
