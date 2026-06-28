// POST /api/admin/q7-daily-recompute
//
// FULL-CORPUS effective_tier recompute (every source) per the Q7 promotion thresholds + tier-weighted
// decayed citation-network sum. Imports recomputeEffectiveTier from src/lib/trust.ts directly.
//
// PHASE 1 (2026-06-28) — NIGHTLY CRON RETIRED (removed from vercel.json). The per-source reputation
// recompute now runs as an END-OF-CYCLE STEP inside growSourcesFromBrief (src/lib/sources/source-growth.ts),
// right after recordCitations writes the fresh citation edges — so reputation recomputes exactly when its
// input (citations) changes, inheriting the scrape cadence, never on an independent nightly timer that
// recomputed identical input most nights. This endpoint is now MANUAL-ONLY: a full-corpus recompute for
// admin use (e.g. after a tier-model change). It writes effective_tier (the dynamic column), never base_tier.
//
// Closes OBS-Q7-B: this endpoint imports trust.ts directly, eliminating
// the .mjs script's duplicated Q7 logic. The script's manual-run utility
// is preserved alongside; future refactor can either add tsx devDep to
// have the .mjs script import trust.ts via tsx loader, or retire the
// script in favor of curl-based manual triggers against this endpoint.
//
// Auth: x-worker-secret header (matches the established cron-endpoint
// pattern from /api/admin/recompute-trust and /api/admin/spot-check/recurring).
// NOT user-facing; admin gate via isPlatformAdmin would block cron access.
//
// Cron wiring: NOT done by this dispatch. The endpoint exists; whoever
// owns cron infrastructure decides what fires it. Three established options:
//
//   1. GitHub Actions cron (matches the comment in recompute-trust route
//      that mentions ".github/workflows/trust-recompute.yml" though no
//      workflow file exists yet). Add .github/workflows/q7-daily.yml with
//      schedule + curl POST to this endpoint + WORKER_SECRET in repo secrets.
//
//   2. Vercel Cron (add crons array to fsi-app/vercel.json with this
//      endpoint's path + daily schedule). Vercel handles WORKER_SECRET via
//      its own internal call signature, so the x-worker-secret check would
//      need extension to accept Vercel's signature; out of scope here.
//
//   3. External cron service (cron-job.org, EasyCron, etc.) POSTing with
//      WORKER_SECRET in headers. Lowest infrastructure dependency.
//
// Per the operator's Item 5 dispatch brief: recommend whichever pattern is
// already established. Neither GitHub Actions nor Vercel Cron is wired yet,
// so this dispatch ships the endpoint and documents the wiring options;
// the cron-platform decision is a separate small dispatch.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recomputeEffectiveTier } from "@/lib/trust";

const WORKER_SECRET = process.env.WORKER_SECRET || "dev-worker-secret";
const Q7_CONFIG_VERSION = "q7-2026-05-20";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  // Accept either x-worker-secret (external cron / manual curl) or
  // Authorization: Bearer ${CRON_SECRET} (Vercel Cron convention; see
  // vercel.json crons array). Both auth paths converge on the same
  // WORKER_SECRET / CRON_SECRET value (single source of truth deploy-side).
  const workerSecret = request.headers.get("x-worker-secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (workerSecret !== WORKER_SECRET && bearerSecret !== WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const halfLifeMonthsParam = url.searchParams.get("half_life_months");
  const halfLifeMonths = halfLifeMonthsParam
    ? Number(halfLifeMonthsParam)
    : undefined;
  if (halfLifeMonthsParam && (!Number.isFinite(halfLifeMonths!) || halfLifeMonths! <= 0)) {
    return NextResponse.json(
      { error: "half_life_months must be a positive number" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();
  const startedAt = new Date().toISOString();

  // Page through every source so the endpoint scales past Supabase's
  // default 1000-row limit.
  const PAGE_SIZE = 1000;
  const sources: Array<{ id: string; name: string }> = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("sources")
      .select("id, name")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json(
        { error: `Failed to enumerate sources at offset=${offset}: ${error.message}` },
        { status: 500 }
      );
    }
    const rows = data ?? [];
    sources.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const tierChanges: Array<{
    source_id: string;
    name: string;
    before_tier: number;
    after_tier: number;
    weighted_sum: number;
    citation_count: number;
    reasoning: string;
    base_tier: number;
    computed_dynamic_tier: number;
    tier_override: number | null;
  }> = [];
  const computeErrors: string[] = [];

  for (const s of sources) {
    try {
      const result = await recomputeEffectiveTier(
        supabase as unknown as { from: (t: string) => unknown },
        s.id,
        halfLifeMonths
      );
      if (result.changed) {
        tierChanges.push({
          source_id: s.id,
          name: s.name,
          before_tier: result.before_tier,
          after_tier: result.after_tier,
          weighted_sum: result.weighted_sum,
          citation_count: result.citation_count,
          reasoning: result.reasoning,
          base_tier: result.base_tier,
          computed_dynamic_tier: result.computed_dynamic_tier,
          tier_override: result.tier_override,
        });
      }
    } catch (err) {
      computeErrors.push(`${s.name}: ${(err as Error).message}`);
    }
  }

  // Apply changes. UPDATE sources.effective_tier + INSERT source_trust_events per change.
  // Phase 1 (2026-06-28): writes `effective_tier` (the DYNAMIC reputation column), NOT `tier`. The prior
  // `.update({ tier })` routed through the migration-094 compat-shim trigger into `base_tier` — corrupting
  // the STATIC authority-origin anchor (the moat) on any real promotion, while `effective_tier` never moved.
  // Writing `effective_tier` directly leaves base_tier untouched (094 couples only tier<->base_tier), so a
  // reputation promotion now lands in the dynamic column and the structural anchor is never touched.
  let updateCount = 0;
  let eventInsertCount = 0;
  const writeErrors: string[] = [];

  for (const change of tierChanges) {
    const direction =
      change.after_tier < change.before_tier ? "tier_promotion" : "tier_demotion";

    const { error: upErr } = await supabase
      .from("sources")
      .update({ effective_tier: change.after_tier })
      .eq("id", change.source_id);

    if (upErr) {
      writeErrors.push(`UPDATE ${change.source_id}: ${upErr.message}`);
      continue;
    }
    updateCount++;

    const { error: evErr } = await supabase
      .from("source_trust_events")
      .insert({
        source_id: change.source_id,
        event_type: direction,
        details: {
          recompute: true,
          q7_config_version: Q7_CONFIG_VERSION,
          before_tier: change.before_tier,
          after_tier: change.after_tier,
          base_tier: change.base_tier,
          computed_dynamic_tier: change.computed_dynamic_tier,
          tier_override: change.tier_override,
          weighted_sum: Number(change.weighted_sum.toFixed(4)),
          citation_count: change.citation_count,
          reasoning: change.reasoning,
          batch_run_at: startedAt,
        },
        created_by: "worker",
      });

    if (evErr) {
      writeErrors.push(`INSERT trust_events ${change.source_id}: ${evErr.message}`);
      continue;
    }
    eventInsertCount++;
  }

  const promotions = tierChanges.filter((c) => c.after_tier < c.before_tier);
  const demotions = tierChanges.filter((c) => c.after_tier > c.before_tier);

  return NextResponse.json({
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    sources_processed: sources.length,
    tier_changes: tierChanges.length,
    promotions: promotions.length,
    demotions: demotions.length,
    sources_updated: updateCount,
    events_inserted: eventInsertCount,
    compute_errors: computeErrors.length,
    write_errors: writeErrors.length,
    compute_error_samples: computeErrors.slice(0, 10),
    write_error_samples: writeErrors.slice(0, 10),
    top_promotions: promotions
      .sort((a, b) => Math.abs(b.weighted_sum) - Math.abs(a.weighted_sum))
      .slice(0, 10)
      .map((p) => ({
        source_id: p.source_id,
        name: p.name,
        before_tier: p.before_tier,
        after_tier: p.after_tier,
        weighted_sum: Number(p.weighted_sum.toFixed(3)),
        citation_count: p.citation_count,
      })),
  });
}
