// Pure response-body builder for GET /api/health/spend, split out of route.ts (BUILDGATE,
// 2026-09-02, F34's named residual / build-graph proof). Next 16's route-type validator rejects
// a route.ts that exports anything besides route handlers/config fields, so this function moves
// to this sibling module and route.ts imports it. Behaviour is unchanged; only the file it lives
// in moved. route.npmtest.mjs now imports this module directly instead of route.ts.

import type { computeSpendHealth } from "@/lib/health/spend-health.mjs";
import type { readSpendGauge } from "@/lib/llm/spend-gauge.mjs";

// ── Response-body builder (pure, exported for testability — same sibling-logic-module pattern
// src/app/api/admin/sources/bulk-import/logic.ts's headReachabilityDecision and
// src/app/api/admin/recompute-trust/logic.ts's demotionOutcomeFor already use). Proves the wire's
// two load-bearing properties without a live DB: every pre-existing field/name/semantic survives byte-
// for-byte (the uptime workflow's jq consumers), and `spend_gauge` is additive — present when the
// gauge read succeeded, `null` (never a missing key, never a thrown response) when it didn't.
export function buildSpendResponseBody(
  v: ReturnType<typeof computeSpendHealth>,
  spendGauge: Awaited<ReturnType<typeof readSpendGauge>> | null,
  ctx: { monthlyCeilingUsd: number; freezeSinceIso: string; monthStartIso: string; checkedAtIso: string }
) {
  return {
    ok: true,
    healthy: v.healthy,
    reason: v.reason,
    mtd_usd: v.mtdUsd,
    monthly_ceiling_usd: ctx.monthlyCeilingUsd,
    pct: v.pct,
    frozen: v.frozen,
    acquire_lock_on: v.acquireEnabled,
    freeze_since: ctx.freezeSinceIso,
    latest_paid_at: v.latestPaidAt,
    paid_after_freeze: v.paidAfterFreeze,
    all_justified: v.allJustified,
    // Enumerate the post-freeze paid rows (operational metadata only — UUIDs, $ figures, and the I2
    // justification enum; never brief content). Empty in the frozen-and-quiet state.
    paid_after_rows: v.paidAfterRows.map((r) => ({
      item_id: r.itemId, source_id: r.sourceId, cost_usd: r.costUsd, started_at: r.startedAt, justification: r.justification,
    })),
    // ADDITIVE (wire #2, spend-gauge.mjs) — informational only, never gates the verdict above. null
    // when the gauge read itself failed; every other field on this response is unaffected either way.
    spend_gauge: spendGauge,
    month_start: ctx.monthStartIso,
    checked_at: ctx.checkedAtIso,
  };
}
