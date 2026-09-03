// Pure decision logic for POST /api/admin/recompute-trust, split out of route.ts (BUILDGATE,
// 2026-09-02, F34's named residual / build-graph proof). Next 16's route-type validator rejects a
// route.ts that exports anything besides route handlers/config fields — `next build --webpack`
// failed on `demotionOutcomeFor` here with "is not a valid Route export field" — so the pure
// function moves to this sibling module and route.ts imports it. Behaviour is unchanged; only the
// file it lives in moved. route.npmtest.mjs now imports this module directly instead of route.ts.

import type { DemotionEvaluation } from "@/lib/trust";
import type { SourceTier } from "@/types/source";

// ── Demotion recording decision (pure, exported for testability — same
// route-exports-a-pure-function pattern src/app/api/admin/sources/
// bulk-import/logic.ts's headReachabilityDecision and src/app/api/
// watchlist/logic.ts's teamOnlyError already use). ──
//
// WHY PROPOSE-ONLY (applied: false, always, regardless of a fired trigger's
// own `severity: "immediate" | "flagged"`):
//   1. evaluateDemotion's own return shape names its result `recommended_tier`
//      — a recommendation, not a directive — computed as `min(7, base_tier+1)`
//      (src/lib/trust.ts).
//   2. Every other live tier-mutation path in this codebase writes
//      `effective_tier`, the DYNAMIC column, and explicitly documents
//      `base_tier` as never machine-written: src/lib/sources/source-growth.ts
//      "Writes effective_tier ONLY (the dynamic column; base_tier + the
//      compat `tier` are never touched — the moat)". evaluateDemotion's
//      recommended_tier is base_tier-relative, so applying it live would mean
//      this monthly cron writing base_tier — the one column every sibling
//      mechanism (recomputeEffectiveTier, tier-override) deliberately never
//      touches. That is a new capability this wave was not asked to build.
//   3. The register's own WIRE recommendation (unwired-disposition-
//      2026-08-31.md #25) describes the gap as "sources can currently only
//      ever be promoted, never automatically demoted" and asks only that the
//      evaluation run in this loop and its verdict be acted on "the same way
//      the route already acts on promotion verdicts" — but this route does
//      not itself act on any promotion verdict today (it only writes
//      trust_score_* columns), so there is no live auto-apply pattern here to
//      mirror. Recording every fired verdict (this function) with no tier
//      write is the conservative reading of that instruction.
// A later, deliberately-scoped wave can flip `applied` to true for
// `severity: "immediate"` triggers once an operator ruling authorizes a
// base_tier (or effective_tier) write from this path — the recorded rows
// already carry everything that decision would need (recommended_tier,
// every fired trigger + its current_value).
export function demotionOutcomeFor(
  sourceId: string,
  evalResult: DemotionEvaluation
):
  | { proposed: false }
  | {
      proposed: true;
      event: {
        source_id: string;
        event_type: "tier_demotion";
        details: {
          proposed: true;
          applied: false;
          recommended_tier: SourceTier;
          triggers_fired: DemotionEvaluation["triggers_fired"];
        };
        created_by: "worker";
      };
    } {
  if (!evalResult.triggered) return { proposed: false };
  return {
    proposed: true,
    event: {
      source_id: sourceId,
      event_type: "tier_demotion",
      details: {
        proposed: true,
        applied: false,
        recommended_tier: evalResult.recommended_tier,
        triggers_fired: evalResult.triggers_fired,
      },
      created_by: "worker",
    },
  };
}
