// POST /api/admin/recompute-trust
//
// Walks every source in the registry and recomputes trust_score_overall
// using the Bayesian-prior-blend formula in src/lib/trust.ts. Component
// scores (accuracy, timeliness, reliability, citation) are also updated
// to reflect current earned signals. Designed to run on a monthly cron
// from .github/workflows/trust-recompute.yml.
//
// DEMOTION (Wave W2, wire #25 of the unwired-module disposition register,
// docs/plans/unwired-disposition-2026-08-31.md §J). evaluateDemotion had
// ZERO production callers before this wave — sources could only ever be
// promoted or manually tier-overridden; nothing in the live system ever
// reduced a source's tier from its own degrading accuracy/reliability/
// accessibility history. This loop now calls it per source, same as the
// trust-score recompute above, and RECORDS every fired verdict to
// source_trust_events (event_type='tier_demotion', details.applied=false)
// — see demotionOutcomeFor below.
//
// PROPOSE-ONLY, not auto-apply (deliberate, conservative choice — see
// demotionOutcomeFor's doc comment in ./logic.ts for the full basis). No
// sources.base_tier or sources.effective_tier write happens here. Every
// fired verdict is still recorded and surfaced loudly in this route's
// response summary (demotions_proposed / demotion_record_failed), so
// nothing is silent — only the tier mutation itself is deferred to an
// operator/future wave.
//
// Fail-soft per source: a thrown demotion evaluation or a failed
// source_trust_events insert is caught, counted, and named in the
// response's demotion_failures — it never aborts the sweep and never
// blocks that source's trust-score update (already written above it).
//
// Auth: x-worker-secret header (same WORKER_SECRET pattern as
// /api/worker/check-sources). NOT user-facing.

import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/db/paginate.mjs";
import { getServiceSupabase } from "@/lib/supabase-service";

import {
  computeTrustScore,
  computeOverallScore,
  evaluateDemotion,
} from "@/lib/trust";
import type { TrustMetrics, SourceTier, Source } from "@/types/source";
import { isGloballyPaused } from "@/lib/api/pause";
import { workerAuthGuard } from "@/lib/api/worker-auth";
// Pure decision logic lives in a sibling module, not here: a route.ts may
// export only route handlers/config (F34's named residual — `next build
// --webpack` rejects any other export field). See logic.ts's header.
import { demotionOutcomeFor } from "./logic";

export async function POST(request: NextRequest) {
  const denied = workerAuthGuard(request);
  if (denied) return denied;

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
  let sources: any[];
  try {
    sources = await fetchAllRows((from, to) =>
      supabase
        .from("sources")
        .select(
          "id, name, base_tier, confirmation_count, conflict_count, accuracy_rate, accessibility_rate, total_checks, lead_time_samples, avg_lead_time_days, independent_citers, highest_citing_tier, total_citations, self_citation_count, conflict_total, last_checked, last_accessible, created_at, last_substantive_change, update_frequency"
        )
        .eq("processing_paused", false)
        .order("id", { ascending: true })
        .range(from, to)
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "sources read failed" }, { status: 500 });
  }
  if (!sources?.length) {
    return NextResponse.json({ message: "No sources to recompute", updated: 0 });
  }

  const now = new Date().toISOString();
  let updated = 0;
  let failed = 0;
  const failures: string[] = [];

  // Demotion (Wave W2, wire #25) — loud counters, separate from the trust-score
  // failures above: a demotion evaluation/record failure never blocks or is
  // blocked by that source's trust-score update.
  let demotionsProposed = 0;
  let demotionRecordFailed = 0;
  let demotionEvalFailed = 0;
  const demotionFailures: string[] = [];
  const demotionSamples: Array<{ source: string; recommended_tier: number; triggers: string[] }> = [];

  // Distribution buckets reported back to the workflow log so the cron run
  // surfaces meaningful telemetry, not just a count.
  const distribution = { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0 };
  const byTier: Record<number, number[]> = {};

  for (const s of sources) {
    // Build a TrustMetrics shape from the flat columns. Fields that don't
    // exist on the row default to 0 / null per TrustMetrics defaults.
    const metrics: TrustMetrics = {
      confirmation_count: s.confirmation_count || 0,
      conflict_count: s.conflict_count || 0,
      conflict_total: s.conflict_total || 0,
      accuracy_rate: s.accuracy_rate ?? 0,
      total_checks: s.total_checks || 0,
      successful_checks: 0, // not on this select; not used by the formula
      consecutive_accessible: 0,
      accessibility_rate: s.accessibility_rate ?? 0,
      last_accessible: s.last_accessible ?? null,
      last_inaccessible: null,
      lead_time_samples: s.lead_time_samples || 0,
      avg_lead_time_days: s.avg_lead_time_days || 0,
      independent_citers: s.independent_citers || 0,
      total_citations: s.total_citations || 0,
      self_citation_count: s.self_citation_count || 0,
      highest_citing_tier: s.highest_citing_tier || null,
    };

    const score = computeTrustScore(metrics);
    // Phase 1.5: base_tier per scoring-internals default rule.
    const overall = computeOverallScore(metrics, s.base_tier as SourceTier);

    const { error: updateErr } = await supabase
      .from("sources")
      .update({
        trust_score_overall: overall,
        trust_score_accuracy: score.accuracy_component,
        trust_score_timeliness: score.timeliness_component,
        trust_score_reliability: score.reliability_component,
        trust_score_citation: score.citation_component,
        trust_score_computed_at: now,
      })
      .eq("id", s.id);

    if (updateErr) {
      failed++;
      failures.push(`${s.name}: ${updateErr.message}`);
    } else {
      updated++;
    }

    // DEMOTION (Wave W2, wire #25 — evaluateDemotion has never been called from
    // production before this). Own try/catch: a thrown evaluation or a failed
    // source_trust_events insert is fail-soft PER SOURCE — it must not abort the
    // sweep and must not roll back the trust-score update already written above.
    // See demotionOutcomeFor's doc comment for why this is propose-only.
    try {
      const demotionSource = {
        base_tier: s.base_tier,
        created_at: s.created_at,
        last_substantive_change: s.last_substantive_change,
        update_frequency: s.update_frequency,
        trust_metrics: metrics,
        // evaluateDemotion (src/lib/trust.ts) reads ONLY base_tier, trust_metrics,
        // last_substantive_change, update_frequency, and created_at — every other
        // Source field is irrelevant to its verdict, so this narrow object stands
        // in for the full row the admin surfaces read elsewhere.
      } as unknown as Source;
      const demotionEval = evaluateDemotion(demotionSource);
      const outcome = demotionOutcomeFor(s.id, demotionEval);
      if (outcome.proposed) {
        demotionsProposed++;
        demotionSamples.push({
          source: s.name,
          recommended_tier: outcome.event.details.recommended_tier,
          triggers: outcome.event.details.triggers_fired.map((t) => t.trigger.trigger),
        });
        const { error: evErr } = await supabase.from("source_trust_events").insert(outcome.event);
        if (evErr) {
          demotionRecordFailed++;
          demotionFailures.push(`${s.name}: source_trust_events insert failed: ${evErr.message}`);
        }
      }
    } catch (e: any) {
      demotionEvalFailed++;
      demotionFailures.push(`${s.name}: demotion evaluation threw: ${e?.message ?? String(e)}`);
    }

    if (overall <= 20) distribution["0-20"]++;
    else if (overall <= 40) distribution["21-40"]++;
    else if (overall <= 60) distribution["41-60"]++;
    else if (overall <= 80) distribution["61-80"]++;
    else distribution["81-100"]++;

    // Phase 1.5: byTier rollup keyed on base_tier per scoring-internals rule.
    if (!byTier[s.base_tier]) byTier[s.base_tier] = [];
    byTier[s.base_tier].push(overall);
  }

  const tierAverages: Record<string, { n: number; avg: number; min: number; max: number }> = {};
  for (const [t, arr] of Object.entries(byTier)) {
    const sum = arr.reduce((a, b) => a + b, 0);
    tierAverages[`T${t}`] = {
      n: arr.length,
      avg: Math.round((sum / arr.length) * 10) / 10,
      min: Math.min(...arr),
      max: Math.max(...arr),
    };
  }

  return NextResponse.json({
    updated,
    failed,
    failures: failures.slice(0, 10), // first 10 only — workflow log is finite
    total_sources: sources.length,
    distribution,
    tier_averages: tierAverages,
    // DEMOTION (Wave W2, wire #25). PROPOSE-ONLY: demotions_proposed counts sources
    // with >=1 fired trigger this pass, each recorded to source_trust_events
    // (event_type='tier_demotion', details.applied=false) — no sources.base_tier or
    // effective_tier write happens here. See demotionOutcomeFor's doc comment.
    demotions_proposed: demotionsProposed,
    demotion_record_failed: demotionRecordFailed,
    demotion_eval_failed: demotionEvalFailed,
    demotion_failures: demotionFailures.slice(0, 10), // first 10 only — workflow log is finite
    demotion_samples: demotionSamples.slice(0, 10), // first 10 only — response body is finite
    computed_at: now,
  });
}
