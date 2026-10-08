#!/usr/bin/env node
// recompute-trust-scores.mjs: MAINT dispatch step (lane TRUST-RET, 2026-10-07; CLAUDE.md rules 13 and 17).
//
// The trust-score pass of the retired .github/workflows/trust-recompute.yml, as a maintenance step. That
// workflow POSTed /api/admin/recompute-trust; the route keeps working as an admin action, and this step is the
// runtime that needs no deployed app, no WORKER_SECRET and no web call. For every source that is not on a
// per-source hold (processing_paused) it recomputes trust_score_overall (the Bayesian-prior blend anchored to
// base_tier) and the accuracy, timeliness, reliability and citation components, and stamps
// trust_score_computed_at.
//
// ONE LOGIC, NOT A COPY. The computation is planTrustScores in src/lib/trust.ts, the same function the route
// calls; this file only reads the registry, hands it to that function, and writes each patch.
//
// WHAT IT NEVER TOUCHES. It writes the six trust_score_* columns and nothing else: never effective_tier, never
// base_tier, never tier_override (tier movement is recompute-tiers, section 58, and the admin override check
// lives on that writer). A trust score is a pure function of the source row, so a tier_override cannot make a
// score wrong, and no override can be written over here.
//
// Emergency stop (scripts/maintenance/lib/emergency-pause.mjs): system_state.global_processing_paused halts the
// run before any plan or write, as the route does.
//
// DRY BY DEFAULT: dry reads and plans, writes nothing. --mode apply writes through db.mjs's guardedUpdateByIds
// (snapshots the prior row, requires the skill cite). Re-running over unchanged inputs rewrites the same score
// values (only trust_score_computed_at moves). No LLM call, no network fetch, no schedule.
//
// WHY THE CALCULATOR ARRIVES THROUGH deps (never a top-level import): trust.ts resolves its types through the
// `@/` alias, which plain node cannot do; buildDeps loads jiti lazily, the shape recompute-tiers.mjs uses.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import { readEmergencyPause, pausedSummary } from "./lib/emergency-pause.mjs";

export const CITE = Object.freeze({
  skill: "source-credibility-model",
  reason:
    "TRUST-RET recompute-trust-scores: machine recompute of the sources.trust_score_* columns from the earned " +
    "metrics and the base_tier prior (src/lib/trust.ts planTrustScores); no tier column is written.",
});

const SAMPLE_LIMIT = 10;
const FAILURE_LIMIT = 10;

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   trust: { planTrustScores: Function },
 *   readSources: () => Promise<Array<object>>,
 *   writeScores: (sourceId: string, patch: object) => Promise<{ written: boolean }>,
 *   readPause?: () => Promise<{ paused: boolean, error: string|null }>,
 *   now?: () => Date,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const pause = deps.readPause ? await deps.readPause() : { paused: false, error: null };
  if (pause.paused) return pausedSummary({ step: "recompute-trust-scores", mode, pause });

  const now = deps.now ? deps.now() : new Date();
  const sources = await deps.readSources();
  const plan = deps.trust.planTrustScores(sources, now.toISOString());

  const summary = {
    step: "recompute-trust-scores",
    mode,
    counts: {
      sources_read: sources.length,
      sources_scored: plan.rows.length,
      skipped_paused: plan.skipped_paused,
      distribution: plan.distribution,
      tier_averages: plan.tier_averages,
      sample: plan.rows.slice(0, SAMPLE_LIMIT).map((r) => ({
        source_id: r.id,
        source: r.name,
        base_tier: r.base_tier,
        trust_score_overall: r.overall,
      })),
    },
    applied: 0,
    read_back: {},
    exitCode: 0,
  };

  if (!apply) return summary;

  let updated = 0;
  let skipped_unmatched = 0;
  const failures = [];
  for (const r of plan.rows) {
    try {
      const res = await deps.writeScores(r.id, r.patch);
      if (res.written) updated++;
      else skipped_unmatched++;
    } catch (e) {
      failures.push(`${r.name ?? r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  summary.applied = updated;
  summary.read_back = {
    attempted: plan.rows.length,
    applied: updated,
    write_failed: failures.length,
    row_not_matched: skipped_unmatched,
    failures: failures.slice(0, FAILURE_LIMIT),
  };
  // A failed write is surfaced in the exit code, never swallowed at this layer.
  if (failures.length > 0) summary.exitCode = 1;
  return summary;
}

/**
 * Real wiring for main(): the one calculator through jiti, reads through db.mjs's paginated readAll, writes
 * through db.mjs's guarded helper. EXPORTED so the npmtest can drive it with a fake client.
 */
export async function buildDeps() {
  const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(fsiRoot(), "src") } });
  const trust = await jiti.import("../../src/lib/trust.ts");
  return {
    trust,
    readPause: () => readEmergencyPause(readAll),
    // The route's own scope: every source not on a per-source hold. planTrustScores skips a held row too.
    readSources: () => readAll("sources", trust.TIER_SOURCE_COLUMNS, { match: (q) => q.eq("processing_paused", false) }),
    writeScores: async (sourceId, patch) => {
      const res = await guardedUpdateByIds("sources", [sourceId], patch, { cite: CITE, select: "id" });
      return { written: res.updated > 0 };
    },
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({ step: "recompute-trust-scores", main, needsDb: true, buildDeps });
}
