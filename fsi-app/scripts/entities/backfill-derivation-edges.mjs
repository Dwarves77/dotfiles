#!/usr/bin/env node
// backfill-derivation-edges.mjs — lane DAG-AUTHOR, propagation build-out, 2026-09-04. Closes the ONE
// historical gap DAG authorship-at-write-time cannot reach on its own: every `emission_factors` /
// `regional_data_facts` row that was written BEFORE this lane wired `authorCarbonIntensityEdges` /
// `authorAutomateVsHireForRegions` into the two producer chokepoints (scripts/gen/emission-factors-
// common.mjs's seedFactors, scripts/producers/regional/run-envelope-producer.mjs's runEnvelopeProducer)
// carries no `derivation_edges` row and never will unless something walks the live tables once, after
// the fact, and authors them.
//
// NO REIMPLEMENTED AUTHORING LOGIC — the whole point of this script is to have none of its own. It calls
// the SAME TWO EXPORTED FUNCTIONS the live producers call, over historical rows those producers were never
// handed (they only ever see rows from their OWN run):
//   - authorCarbonIntensityEdges (scripts/gen/emission-factors-common.mjs) — one derivation_edges +
//     derived_values pair per live, licence-clear (mayEmbedAsSeed) emission_factors row.
//   - authorAutomateVsHireForRegions (scripts/producers/regional/run-envelope-producer.mjs) — one
//     derivation_edges pair (wage + energy) + derived_values row per region with BOTH an hourly wage
//     (labor_markets, unit matching /\/hour$/i — see src/lib/operations/automate-vs-hire.mjs's
//     isHourlyWageUnit) and an operational_cost fact.
// Both functions are individually idempotent (they delegate to author-edges.mjs's hasBeenAuthored, which
// checks EVERY declared input against live derivation_edges before writing anything) — so this script is
// safe to re-run at any bound, any number of times, and a producer's own future write racing this backfill
// can never double-author the same figure.
//
// RETIREMENT — THIS SCRIPT IS A ONE-TIME BRIDGE, NOT A STANDING JOB:
//   Run it once, unbounded (no --limit), with --apply. Confirm the printed summary reports
//   `candidates: 0` on BOTH counters (emission_factors and regions) on a SECOND unbounded --apply run
//   immediately after — that second run finding nothing left is the retirement signal, because every row
//   written from that point forward is already authored at write time by the two chokepoints above.
//   At that point: delete this file, drop its `workflow_dispatch` checkbox from propagation-drain.yml, and
//   remove its section from the propagation runbook (docs/runbooks). Until that second confirming run has
//   actually been observed, LEAVE IT WIRED — a single "0 candidates" run does not by itself prove no
//   in-flight write raced it.
//
// SAFETY POSTURE — --dry is the DEFAULT (mirrors backfill-lineage-edges.mjs's posture, for the same
// reason: this script touches every non-superseded emission_factors row and every region with either
// dimension, corpus-wide, not a scoped/pre-verified subset).
//   --dry        (default) report candidate counts, write nothing
//   --apply      required to actually author
//   --limit N    bound EACH of the two candidate lists independently to at most N (pilot runs)
// Exit 0 done · 1 unexpected fatal (never expected in normal operation — both delegates already catch
// and count per-row failures rather than throwing) · 2 no DB creds (self-skip, never crash — sibling-audit
// contract).
//
// TESTABILITY: all I/O and both delegate calls are injectable via `deps` on `runBackfill` (below), so
// author-edges.test.mjs-style fakes can prove this orchestrator's counting/limit/dry-vs-apply behaviour
// with zero DB/network — see backfill-derivation-edges.test.mjs. Env-creds checking and real client
// construction live ONLY inside `main()`, gated by the IS_MAIN check at the bottom (mirrors
// seed-derived-values.mjs), so importing this module for tests never touches the environment.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, readClient } from "../lib/db.mjs";
import { authorCarbonIntensityEdges } from "../gen/emission-factors-common.mjs";
import { authorAutomateVsHireForRegions } from "../producers/regional/run-envelope-producer.mjs";

/** Every live (non-superseded) emission_factors row, the same shape authorCarbonIntensityEdges wants for
 *  BOTH its `writtenRows` and `insertRes.rows` arguments — each live row already carries both
 *  `source_key` (for the licence gate) and `factor_id` (the value to correlate the edge to), so the same
 *  array serves both parameters unmodified; there is no separate "candidate" shape to build. */
export async function loadLiveEmissionFactors(readAllFn = readAll) {
  return readAllFn(
    "emission_factors",
    "factor_id, source_key",
    { match: (qb) => qb.is("superseded_by", null), orderBy: "factor_id" }
  );
}

/** Every region_id that carries at least one labor_markets or operational_cost regional_data_facts row.
 *  Deliberately UNFILTERED beyond that (no hourly-unit / pairing check here) — authorAutomateVsHireForRegions
 *  already applies isHourlyWageUnit and the pairing rule internally and counts every outcome by name; this
 *  script's job is only to hand it every region that could possibly qualify, not to pre-judge which do. */
export async function loadCandidateRegionIds(readAllFn = readAll) {
  const rows = await readAllFn("regional_data_facts", "region_id, dimension", {
    match: (qb) => qb.in("dimension", ["labor_markets", "operational_cost"]),
  });
  return [...new Set(rows.map((r) => r.region_id).filter(Boolean))];
}

/**
 * The whole orchestration, DI'd for testing. `sb` is only ever constructed (or required) when `apply` is
 * true — a dry run never touches a client, mirroring authorAutomateVsHireForRegions's own dry posture.
 * @param {{apply: boolean, limit?: number|null}} opts
 * @param {{
 *   loadEfFn?: typeof loadLiveEmissionFactors, loadRegionsFn?: typeof loadCandidateRegionIds,
 *   authorCarbonIntensityEdgesFn?: typeof authorCarbonIntensityEdges,
 *   authorAutomateVsHireForRegionsFn?: typeof authorAutomateVsHireForRegions,
 *   readAllFn?: typeof readAll, sb?: object, readClientFn?: typeof readClient,
 * }} [deps]
 */
export async function runBackfill({ apply, limit = null }, deps = {}) {
  const loadEfFn = deps.loadEfFn ?? loadLiveEmissionFactors;
  const loadRegionsFn = deps.loadRegionsFn ?? loadCandidateRegionIds;
  const authorEfFn = deps.authorCarbonIntensityEdgesFn ?? authorCarbonIntensityEdges;
  const authorRegionsFn = deps.authorAutomateVsHireForRegionsFn ?? authorAutomateVsHireForRegions;
  const readAllFn = deps.readAllFn ?? readAll;

  let efRows = await loadEfFn(readAllFn);
  let regionIds = await loadRegionsFn(readAllFn);
  if (limit) { efRows = efRows.slice(0, limit); regionIds = regionIds.slice(0, limit); }

  const candidates = { emissionFactors: efRows.length, regions: regionIds.length };

  if (!apply) {
    return { mode: "dry-run", candidates };
  }

  const sb = deps.sb ?? (deps.readClientFn ?? readClient)();
  const efCounts = await authorEfFn(efRows, { rows: efRows }, { sb });
  const regionCounts = await authorRegionsFn(regionIds, "apply", { sb });

  return { mode: "apply", candidates, efCounts, regionCounts };
}

// ── CLI entrypoint — never reached on import (proved by backfill-derivation-edges.test.mjs importing the
// exports above with no DB creds present) ──────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

async function main() {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("backfill-derivation-edges: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : null;

  console.log(`[backfill-derivation-edges] mode = ${apply ? "APPLY" : "DRY-RUN (default)"}${limit ? ` limit=${limit}` : ""}`);

  const result = await runBackfill({ apply, limit });
  console.log(`[backfill-derivation-edges] candidates: emission_factors=${result.candidates.emissionFactors} (live, non-superseded) regions=${result.candidates.regions} (carry labor_markets or operational_cost facts)`);

  if (result.mode === "dry-run") {
    console.log("[backfill-derivation-edges] DRY RUN — nothing authored. Re-run with --apply to write.");
    console.log("[backfill-derivation-edges] see file header for the retirement condition (two consecutive 0-candidate unbounded --apply runs).");
    process.exit(0);
  }

  const ef = result.efCounts;
  console.log(
    `[backfill-derivation-edges] emission_factors (carbon_intensity_tkm): authored=${ef.authored} ` +
    `already=${ef.skippedAlready} licence-blocked=${ef.licenceBlocked} ` +
    `refused=${ef.refused} unknown-method=${ef.unknownMethod} errored=${ef.errored}`
  );
  const rg = result.regionCounts;
  console.log(
    `[backfill-derivation-edges] regional_data_facts (automate_vs_hire): authored=${rg.authored} ` +
    `already=${rg.skippedAlready} incomplete-pair=${rg.skippedIncomplete} ` +
    `no-hourly-wage=${rg.skippedNoHourlyWage} no-entity=${rg.skippedNoEntity} ` +
    `refused=${rg.refused} unknown-method=${rg.unknownMethod} errored=${rg.errored}`
  );

  const hardFailures = ef.errored + rg.errored;
  console.log(`[backfill-derivation-edges] APPLY complete.${hardFailures ? ` ${hardFailures} row(s) errored — see warnings above.` : ""}`);
  process.exit(0);
}

if (IS_MAIN) {
  main().catch((e) => {
    console.error(`[backfill-derivation-edges] FATAL: ${e.message}`);
    process.exit(1);
  });
}
