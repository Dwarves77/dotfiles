// POST /api/admin/recompute-trust
//
// Walks every source in the registry and recomputes trust_score_overall
// using the Bayesian-prior-blend formula in src/lib/trust.ts. Component
// scores (accuracy, timeliness, reliability, citation) are also updated
// to reflect current earned signals. An admin action. The scheduled/dispatched runtime of the same trust-
// score pass is the recompute-trust-scores maintenance step (scripts/maintenance/recompute-trust-scores.mjs,
// runbook section 66); the former trust-recompute.yml workflow was retired 2026-10-07. Both call the one
// planTrustScores in src/lib/trust.ts.
//
// TIER MOVEMENT (S1-C, 2026-10-04). After the trust-score pass this route moves effective_tier from the
// evidence, through the one calculator in src/lib/trust.ts (decideEffectiveTier via planTierMovements):
// citation promotion, evaluatePromotion eligible (one tier better), evaluateDemotion triggered (one tier
// worse), and tier opinions (3+ in 90 days from 2+ distinct opining sources, one step toward the median).
// Net movement is clamped to one tier either side of base_tier, an admin tier_override always wins and is
// never written over, and every applied change writes a source_trust_events row (tier_promotion or
// tier_demotion, created_by "worker", applied true). This route APPLIES; it no longer only proposes
// demotions. base_tier is never written here. scripts/maintenance/recompute-tiers.mjs runs the same
// planner and applier through injected deps.
//
// Fail-soft per source inside applyTierMovements: a failed tier write or event insert is counted and named
// in the response and never aborts the sweep. A thrown plan (a read failure) returns 500 after the
// trust-score updates already written above it.
//
// Auth: x-worker-secret header (same WORKER_SECRET pattern as
// /api/worker/check-sources). NOT user-facing.

import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/db/paginate.mjs";
import { getServiceSupabase } from "@/lib/supabase-service";

import {
  planTrustScores,
  planTierMovements,
  outcomeReaderFor,
  applyTierMovements,
  TIER_SOURCE_COLUMNS,
} from "@/lib/trust";
import type { TierSourceRow } from "@/lib/trust";
import { isGloballyPaused, getScrapeState } from "@/lib/api/pause";
import { workerAuthGuard } from "@/lib/api/worker-auth";
import { checkRateLimit } from "@/lib/api/rate-limit";
// Pure shaping logic lives in a sibling module, not here: a route.ts may
// export only route handlers/config (F34's named residual — `next build
// --webpack` rejects any other export field). See logic.ts's header.
import { tierMovementSummary, tierMovementWriters, type TierWriteClient } from "./logic";

export async function POST(request: NextRequest) {
  const denied = workerAuthGuard(request);
  if (denied) return denied;
  // ROUTES-1 (register AT2-7d): the shared 60/min sliding window, one bucket per worker route (the
  // caller is the one shared-secret holder, so the route is the principal), after the secret check.
  const limited = checkRateLimit("worker:/api/admin/recompute-trust");
  if (limited) return limited;

  const supabase = getServiceSupabase();

  // Global pause gate — skip the recompute entirely.
  if (await isGloballyPaused(supabase)) {
    return NextResponse.json({ message: "Global processing pause is active; trust recompute skipped", updated: 0 });
  }

  // Pull every source and recompute. Schema uses flat trust_score_* columns.
  // Per-source paused rows are skipped so their last-known trust score is
  // preserved while the source is intentionally on hold.
  // Phase 1.5: base_tier per scoring-internals default rule (trust
  // recompute is a scoring internal; the Bayesian prior is anchored
  // to the structural classification, not the dynamic credibility signal).
  // PAGINATED (case-file 9): the active source registry can exceed 1000 rows; a truncated read would skip
  // trust recompute for every source past row 1000 (the per-source UPDATE loop below) and under-report totals.
  let sources: TierSourceRow[];
  try {
    sources = await fetchAllRows((from, to) =>
      supabase
        .from("sources")
        .select(TIER_SOURCE_COLUMNS)
        .eq("processing_paused", false)
        .order("id", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "sources read failed" }, { status: 500 });
  }
  if (!sources?.length) {
    return NextResponse.json({ message: "No sources to recompute", updated: 0 });
  }

  const now = new Date().toISOString();
  let updated = 0;
  let failed = 0;
  const failures: string[] = [];

  // The score computation, the distribution and the per-base-tier averages are one shared plan
  // (trust.ts planTrustScores), also run by scripts/maintenance/recompute-trust-scores.mjs.
  const scorePlan = planTrustScores(sources, now);
  const distribution = scorePlan.distribution;
  const tierAverages = scorePlan.tier_averages;

  for (const r of scorePlan.rows) {
    const { error: updateErr } = await supabase.from("sources").update(r.patch).eq("id", r.id);
    if (updateErr) {
      failed++;
      failures.push(`${r.name}: ${updateErr.message}`);
    } else {
      updated++;
    }
  }

  // Tier movement: decide from the evidence, apply, record. See the header.
  let tierMovement: ReturnType<typeof tierMovementSummary>;
  try {
    // Cadence hold (CLAUDE.md rule 16): one system_state read; 'off' suppresses the scan-timestamp
    // demotion trigger. getScrapeState fails closed to 'off'.
    const { cadence: scrapeCadence } = await getScrapeState(supabase);
    const plan = await planTierMovements({
      // The whole registry, paused rows included: a paused source still weighs as a citer, and the
      // planner itself skips moving a paused row.
      readSources: () =>
        fetchAllRows((from, to) =>
          supabase
            .from("sources")
            .select(TIER_SOURCE_COLUMNS)
            .order("id", { ascending: true })
            .range(from, to)
        ),
      readOpinions: (sinceIso) =>
        fetchAllRows((from, to) =>
          supabase
            .from("source_tier_opinions")
            .select("target_source_id, opined_tier, opining_source_id, opined_at, dismissed_at, opinion_source")
            .is("dismissed_at", null)
            .gte("opined_at", sinceIso)
            .order("id", { ascending: true })
            .range(from, to)
        ),
      readCitations: () =>
        fetchAllRows((from, to) =>
          supabase
            .from("source_citations")
            .select("citing_source_id, cited_source_id, detected_at")
            .order("id", { ascending: true })
            .range(from, to)
        ),
      // Scored prediction outcomes (lane L4-D): the same reader the maintenance step uses.
      readOutcomes: outcomeReaderFor(supabase),
    }, { scrapeCadence });
    // The writers carry the tier_override guard in the UPDATE itself (logic.ts, tier-override-guard.mjs).
    const applied = await applyTierMovements(plan.movements, tierMovementWriters(supabase as unknown as TierWriteClient));
    tierMovement = tierMovementSummary(plan, applied);
  } catch (e) {
    return NextResponse.json(
      {
        updated,
        failed,
        failures: failures.slice(0, 10),
        total_sources: sources.length,
        tier_movement_error: e instanceof Error ? e.message : String(e),
        computed_at: now,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    updated,
    failed,
    failures: failures.slice(0, 10), // first 10 only — workflow log is finite
    total_sources: sources.length,
    distribution,
    tier_averages: tierAverages,
    tier_movement: tierMovement,
    computed_at: now,
  });
}
