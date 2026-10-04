#!/usr/bin/env node
// recompute-tiers.mjs: MAINT dispatch step (lane S1-C, s1c-tier-movement, 2026-10-04).
//
// The source tier system runs itself. This step moves sources.effective_tier from the evidence, through
// the ONE calculator in src/lib/trust.ts (planTierMovements / applyTierMovements, built on
// decideEffectiveTier). It is the same logic the POST /api/admin/recompute-trust route runs; this entry
// exists so the loop can run it by explicit dispatch and from downstream-chain.yml with no web call.
//
// Evidence, each applied automatically and each reversible on the next recompute:
//   a. citation promotion          one tier better than base_tier
//   b. evaluatePromotion eligible  one tier better
//   c. evaluateDemotion triggered  one tier worse
//   d. tier opinions               3+ non-dismissed opinions in 90 days from 2+ distinct opining sources,
//                                  median differs from base_tier: one step toward the median
//                                  (host_class_table opinions are not evidence; institution-canonicalize
//                                  owns those)
// Net movement is clamped to one tier either side of base_tier. An admin tier_override always wins and
// is never written over. base_tier is never written. Every applied change writes a source_trust_events
// row (tier_promotion or tier_demotion, created_by "worker", details.applied true).
//
// DRY BY DEFAULT: dry reads and plans, writes nothing. --mode apply writes through db.mjs's guarded
// helpers (guardedUpdateByIds snapshots the prior row; guardedInsert snapshots the event). Idempotent: a
// second run over unchanged inputs finds every stored effective_tier already equal to its decision and
// writes nothing. No LLM call, no network fetch, no schedule.
//
// WHY THE CALCULATOR ARRIVES THROUGH deps (never a top-level import). trust.ts resolves its types and
// constants through the `@/` alias, which plain node cannot do; a top-level jiti import would break any
// *.test.mjs in the no-npm discipline job. buildDeps loads jiti lazily, the same shape
// backfill-format-type.mjs uses; recompute-tiers.npmtest.mjs is the real-wiring proof.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, fsiRoot } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "source-credibility-model",
  reason:
    "S1-C recompute-tiers: machine movement of sources.effective_tier from citation promotion, " +
    "evaluatePromotion, evaluateDemotion and tier opinions (one tier either side of base_tier, admin " +
    "tier_override never written over), each change recorded as an applied source_trust_events row.",
});

const SAMPLE_LIMIT = 25;

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   tierMovement: { planTierMovements: Function, applyTierMovements: Function },
 *   readers: { readSources: Function, readOpinions: Function, readCitations: Function },
 *   writers: { setEffectiveTier: Function, insertEvent: Function },
 *   now?: () => Date,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const now = deps.now ? deps.now() : new Date();
  const plan = await deps.tierMovement.planTierMovements(deps.readers, { now });

  const summary = {
    step: "recompute-tiers",
    mode,
    counts: {
      sources_scanned: plan.scanned,
      override_held: plan.override_held,
      skipped: plan.skipped.length,
      movements: plan.movements.length,
      promotions: plan.movements.filter((m) => m.decision.after_tier < m.decision.before_tier).length,
      demotions: plan.movements.filter((m) => m.decision.after_tier > m.decision.before_tier).length,
      sample: plan.movements.slice(0, SAMPLE_LIMIT).map((m) => ({
        source_id: m.source_id,
        source: m.name,
        base_tier: m.decision.base_tier,
        before_tier: m.decision.before_tier,
        after_tier: m.decision.after_tier,
        rules: m.decision.rules,
      })),
    },
    applied: 0,
    read_back: {},
    exitCode: 0,
  };

  if (!apply) return summary;

  const result = await deps.tierMovement.applyTierMovements(plan.movements, deps.writers);
  summary.applied = result.applied;
  summary.read_back = {
    attempted: result.attempted,
    applied: result.applied,
    promotions: result.promotions,
    demotions: result.demotions,
    write_failed: result.write_failed,
    event_failed: result.event_failed,
    failures: result.failures.slice(0, 10),
  };
  // A failed write or event is surfaced in the exit code, never swallowed at this layer.
  if (result.write_failed > 0 || result.event_failed > 0) summary.exitCode = 1;
  return summary;
}

/**
 * Real wiring for main(): the one calculator through jiti, reads through db.mjs's paginated readAll,
 * writes through db.mjs's guarded helpers. EXPORTED so the npmtest can drive it with a fake client.
 */
export async function buildDeps() {
  const { readAll, guardedUpdateByIds, guardedInsert } = await import("../lib/db.mjs");
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(fsiRoot(), "src") } });
  const tierMovement = await jiti.import("../../src/lib/trust.ts");
  return {
    tierMovement,
    readers: {
      // The whole registry, paused rows included: a paused source still weighs as a citer, and the
      // planner itself skips moving a paused row.
      readSources: () => readAll("sources", tierMovement.TIER_SOURCE_COLUMNS),
      readOpinions: (sinceIso) =>
        readAll(
          "source_tier_opinions",
          "target_source_id, opined_tier, opining_source_id, opined_at, dismissed_at, opinion_source",
          { match: (q) => q.is("dismissed_at", null).gte("opined_at", sinceIso) }
        ),
      readCitations: () => readAll("source_citations", "citing_source_id, cited_source_id, detected_at"),
    },
    writers: {
      // applyMatch repeats the planner's own override rule at the write: an override set between the
      // read and this write is never written over.
      setEffectiveTier: async (sourceId, tier) => {
        await guardedUpdateByIds("sources", [sourceId], { effective_tier: tier }, {
          cite: CITE,
          select: "id, effective_tier",
          applyMatch: (q) => q.is("tier_override", null),
        });
      },
      insertEvent: async (event) => {
        await guardedInsert("source_trust_events", event, { cite: CITE, select: "id" });
      },
    },
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({ step: "recompute-tiers", main, needsDb: true, buildDeps });
}
