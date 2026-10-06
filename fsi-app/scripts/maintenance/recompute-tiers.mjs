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
//   e. scored prediction outcomes  the source_reliability_ledger (lane L4-D, ADR-044 decision 4): with 5+
//                                  scored outcomes in 365 days, refuted over held is one step toward demotion,
//                                  held with no refuted is one step toward promotion. One bounded read of the
//                                  window per run; reported apart from the other movements (outcome_*)
// Cadence hold (CLAUDE.md rule 16): while system_state.scrape_cadence is 'off' the no_substantive_update
// demotion trigger is suppressed (it reads scan timestamps that cannot advance during the hold) and the
// summary reports the count as held_cadence_off. system_state is read once per run.
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
 *   readers: { readSources: Function, readOpinions: Function, readCitations: Function, readOutcomes?: Function },
 *   writers: { setEffectiveTier: Function, insertEvent: Function },
 *   readCadence: () => Promise<string>,
 *   now?: () => Date,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const now = deps.now ? deps.now() : new Date();
  const scrapeCadence = await deps.readCadence();
  const plan = await deps.tierMovement.planTierMovements(deps.readers, { now, scrapeCadence });

  const summary = {
    step: "recompute-tiers",
    mode,
    counts: {
      sources_scanned: plan.scanned,
      override_held: plan.override_held,
      scrape_cadence: scrapeCadence,
      held_cadence_off: plan.held_cadence_off,
      skipped: plan.skipped.length,
      movements: plan.movements.length,
      // Outcome-driven movements (lane L4-D) are reported apart: they exist because of scored prediction
      // outcomes, the rest because of citations, promotion or demotion evaluation, or opinions.
      outcome_movements: plan.outcome_driven_movements ?? 0,
      outcome_promotions: plan.movements.filter((m) => m.decision.outcome_driven && m.decision.after_tier < m.decision.before_tier).length,
      outcome_demotions: plan.movements.filter((m) => m.decision.outcome_driven && m.decision.after_tier > m.decision.before_tier).length,
      other_movements: plan.movements.length - (plan.outcome_driven_movements ?? 0),
      outcome_read_error: plan.outcome_read_error ?? null,
      promotions: plan.movements.filter((m) => m.decision.after_tier < m.decision.before_tier).length,
      demotions: plan.movements.filter((m) => m.decision.after_tier > m.decision.before_tier).length,
      sample: plan.movements.slice(0, SAMPLE_LIMIT).map((m) => ({
        source_id: m.source_id,
        source: m.name,
        base_tier: m.decision.base_tier,
        before_tier: m.decision.before_tier,
        after_tier: m.decision.after_tier,
        rules: m.decision.rules,
        outcome_driven: m.decision.outcome_driven === true,
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
    // One read per run of the system_state singleton. A missing row or value reads as 'off' (fail closed,
    // the same default src/lib/api/pause.ts uses).
    readCadence: async () => {
      const rows = await readAll("system_state", "scrape_cadence");
      return rows?.[0]?.scrape_cadence ?? "off";
    },
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
      // Scored prediction outcomes (lane L4-D): one read of the ledger window, every source. The planner tallies.
      readOutcomes: (sinceIso) =>
        readAll("source_reliability_ledger", "source_id, outcome, scored_at", { orderBy: "id", match: (q) => q.gte("scored_at", sinceIso) }),
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
