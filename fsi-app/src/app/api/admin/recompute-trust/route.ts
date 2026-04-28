// POST /api/admin/recompute-trust
//
// Walks every source in the registry and recomputes trust_score_overall
// using the Bayesian-prior-blend formula in src/lib/trust.ts. Component
// scores (accuracy, timeliness, reliability, citation) are also updated
// to reflect current earned signals. Designed to run on a monthly cron
// from .github/workflows/trust-recompute.yml.
//
// Auth: x-worker-secret header (same WORKER_SECRET pattern as
// /api/worker/check-sources). NOT user-facing.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  computeTrustScore,
  computeOverallScore,
} from "@/lib/trust";
import type { TrustMetrics, SourceTier } from "@/types/source";

const WORKER_SECRET = process.env.WORKER_SECRET || "dev-worker-secret";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-worker-secret");
  if (secret !== WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Pull every source and recompute. Schema uses flat trust_score_* columns.
  const { data: sources, error } = await supabase
    .from("sources")
    .select(
      "id, name, tier, confirmation_count, conflict_count, accuracy_rate, accessibility_rate, total_checks, lead_time_samples, avg_lead_time_days, independent_citers, highest_citing_tier, total_citations, self_citation_count, conflict_total, last_checked"
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!sources?.length) {
    return NextResponse.json({ message: "No sources to recompute", updated: 0 });
  }

  const now = new Date().toISOString();
  let updated = 0;
  let failed = 0;
  const failures: string[] = [];

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
      last_accessible: null,
      last_inaccessible: null,
      lead_time_samples: s.lead_time_samples || 0,
      avg_lead_time_days: s.avg_lead_time_days || 0,
      independent_citers: s.independent_citers || 0,
      total_citations: s.total_citations || 0,
      self_citation_count: s.self_citation_count || 0,
      highest_citing_tier: s.highest_citing_tier || null,
    };

    const score = computeTrustScore(metrics);
    const overall = computeOverallScore(metrics, s.tier as SourceTier);

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

    if (overall <= 20) distribution["0-20"]++;
    else if (overall <= 40) distribution["21-40"]++;
    else if (overall <= 60) distribution["41-60"]++;
    else if (overall <= 80) distribution["61-80"]++;
    else distribution["81-100"]++;

    if (!byTier[s.tier]) byTier[s.tier] = [];
    byTier[s.tier].push(overall);
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
    computed_at: now,
  });
}
