#!/usr/bin/env node
// backfill-derivation-edges.mjs: lane DAG-AUTHOR, propagation build-out, 2026-09-04 (extended by lane
// W4-DAG, 2026-09-06, for market_series; the regional wage-versus-automation step it once also ran was
// retired by ADR-043, 2026-10-03). Closes the ONE historical gap DAG
// authorship-at-write-time cannot reach on its own: every `emission_factors` / `market_series` row that was
// written BEFORE the relevant producer chokepoint was wired to author its own
// edges (scripts/gen/emission-factors-common.mjs's seedFactors, scripts/producers/market/
// eia-v2-petroleum-spot-producer.mjs's main) carries no `derivation_edges` row and never will unless
// something walks the live tables once, after the fact, and authors them. 2026-09-06: `market_series` had
// 2,727 live `eia-v2:*` rows (2017-12-15 through 2026-08-28, six series) written before this lane wired
// `authorMarketSeriesDeltaEdges` into that producer — the exact same historical-gap shape this script
// already closes for the other two tables, extended here rather than given a second script.
//
// NO REIMPLEMENTED AUTHORING LOGIC — the whole point of this script is to have none of its own. It calls
// the SAME TWO EXPORTED FUNCTIONS the live producers call, over historical rows those producers were
// never handed (they only ever see rows from their OWN run):
//   - authorCarbonIntensityEdges (scripts/gen/emission-factors-common.mjs) — one derivation_edges +
//     derived_values pair per live, licence-clear (mayEmbedAsSeed) emission_factors row.
//   - authorMarketSeriesDeltaEdges (scripts/producers/market/author-market-series-delta.mjs) — one
//     derivation_edges pair (latest + nearest-at-or-before-7-days-prior observation) + derived_values row
//     per series_key with at least 2 observations inside its own bounded lookback window (21 days).
// Every function is individually idempotent (they delegate to author-edges.mjs's hasBeenAuthored, which
// checks EVERY declared input against live derivation_edges before writing anything) — so this script is
// safe to re-run at any bound, any number of times, and a producer's own future write racing this backfill
// can never double-author the same figure.
//
// RETIREMENT — THIS SCRIPT IS A ONE-TIME BRIDGE, NOT A STANDING JOB:
//   Run it once, unbounded (no --limit), with --apply. Confirm the printed summary reports `authored: 0`
//   on BOTH counters (emission_factors, market_series) on a SECOND unbounded --apply run
//   immediately after — that second run authoring nothing new (every candidate resolving to `already`/
//   `insufficient-history`/etc, never a fresh `authored`) is the retirement signal, because every row
//   written from that point forward is already authored at write time by the two chokepoints above.
//   At that point: delete this file, drop its `workflow_dispatch` checkbox from propagation-drain.yml, and
//   remove its section from the propagation runbook (docs/runbooks). Until that second confirming run has
//   actually been observed, LEAVE IT WIRED — a single "0 authored" run does not by itself prove no
//   in-flight write raced it.
//
// SAFETY POSTURE — --dry is the DEFAULT (mirrors backfill-lineage-edges.mjs's posture, for the same
// reason: this script touches every non-superseded emission_factors row and every market series,
// corpus-wide, not a scoped/pre-verified subset).
//   --dry        (default) report candidate counts, write nothing
//   --apply      required to actually author
//   --limit N    bound EACH of the candidate lists independently to at most N (pilot runs)
// Exit 0 done · 1 unexpected fatal (never expected in normal operation — both delegates already catch
// and count per-row failures rather than throwing) · 2 no DB creds (self-skip, never crash — sibling-audit
// contract).
//
// TESTABILITY: all I/O and both delegate calls are injectable via `deps` on `runBackfill` (below), so
// author-edges.test.mjs-style fakes can prove this orchestrator's counting/limit/dry-vs-apply behaviour
// with zero DB/network — see backfill-derivation-edges.test.mjs. Env-creds checking and real client
// construction live ONLY inside `main()`, gated by the IS_MAIN check at the bottom (mirrors
// seed-derived-values.mjs), so importing this module for tests never touches the environment.

import { readAll, readClient } from "../lib/db.mjs";
import { authorCarbonIntensityEdges } from "../gen/emission-factors-common.mjs";
import { authorMarketSeriesDeltaEdges } from "../producers/market/author-market-series-delta.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";

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

/** Every distinct series_key present in `market_series` today (lane W4-DAG, 2026-09-06). Deliberately
 *  UNFILTERED beyond distinctness (no "has at least 2 observations" pre-check here)
 *  and authorMarketSeriesDeltaEdges already applies its own bounded
 *  lookback window and counts every outcome (insufficientHistory/unitMismatch/authored/...) by name; this
 *  script's job is only to hand it every series_key that could possibly qualify, never to pre-judge which
 *  do. Reads only the `series_key` column (no date filter) — the set of distinct keys is small (6 today)
 *  even though the underlying row count (2,727+) is not; `readAll` still pages correctly either way. */
export async function loadCandidateSeriesKeys(readAllFn = readAll) {
  const rows = await readAllFn("market_series", "series_key");
  return [...new Set(rows.map((r) => r.series_key).filter(Boolean))];
}

/**
 * The whole orchestration, DI'd for testing. `sb` is only ever constructed (or required) when `apply` is
 * true, a dry run never touches a client.
 * @param {{apply: boolean, limit?: number|null}} opts
 * @param {{
 *   loadEfFn?: typeof loadLiveEmissionFactors,
 *   loadSeriesKeysFn?: typeof loadCandidateSeriesKeys,
 *   authorCarbonIntensityEdgesFn?: typeof authorCarbonIntensityEdges,
  *   authorMarketSeriesDeltaEdgesFn?: typeof authorMarketSeriesDeltaEdges,
 *   readAllFn?: typeof readAll, sb?: object, readClientFn?: typeof readClient,
 * }} [deps]
 */
export async function runBackfill({ apply, limit = null }, deps = {}) {
  const loadEfFn = deps.loadEfFn ?? loadLiveEmissionFactors;
  const loadSeriesKeysFn = deps.loadSeriesKeysFn ?? loadCandidateSeriesKeys;
  const authorEfFn = deps.authorCarbonIntensityEdgesFn ?? authorCarbonIntensityEdges;
  const authorSeriesFn = deps.authorMarketSeriesDeltaEdgesFn ?? authorMarketSeriesDeltaEdges;
  const readAllFn = deps.readAllFn ?? readAll;

  let efRows = await loadEfFn(readAllFn);
  let seriesKeys = await loadSeriesKeysFn(readAllFn);
  if (limit) { efRows = efRows.slice(0, limit); seriesKeys = seriesKeys.slice(0, limit); }

  const candidates = { emissionFactors: efRows.length, marketSeries: seriesKeys.length };

  if (!apply) {
    return { mode: "dry-run", candidates };
  }

  const sb = deps.sb ?? (deps.readClientFn ?? readClient)();
  const efCounts = await authorEfFn(efRows, { rows: efRows }, { sb });
  const seriesCounts = await authorSeriesFn(seriesKeys, "apply", { sb });

  return { mode: "apply", candidates, efCounts, seriesCounts };
}

// ── CLI entrypoint — never reached on import (proved by backfill-derivation-edges.test.mjs importing the
// exports above with no DB creds present) ──────────────────────────────────────────────────────────────

async function main() {
  loadLocalEnvFile();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("backfill-derivation-edges: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : null;

  console.log(`[backfill-derivation-edges] mode = ${apply ? "APPLY" : "DRY-RUN (default)"}${limit ? ` limit=${limit}` : ""}`);

  const result = await runBackfill({ apply, limit });
  console.log(`[backfill-derivation-edges] candidates: emission_factors=${result.candidates.emissionFactors} (live, non-superseded) market_series=${result.candidates.marketSeries} (distinct series_key)`);

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
  const ms = result.seriesCounts;
  console.log(
    `[backfill-derivation-edges] market_series (market_series_delta): authored=${ms.authored} ` +
    `already=${ms.skippedAlready} insufficient-history=${ms.insufficientHistory} ` +
    `unit-mismatch=${ms.unitMismatch} refused=${ms.refused} unknown-method=${ms.unknownMethod} errored=${ms.errored}`
  );

  const hardFailures = ef.errored + ms.errored;
  console.log(`[backfill-derivation-edges] APPLY complete.${hardFailures ? ` ${hardFailures} row(s) errored — see warnings above.` : ""}`);
  process.exit(0);
}

// F67 (lane R20, 2026-10-01): standardized on isMainModule from scripts/lib/is-main.mjs, replacing the
// inlined fileURLToPath/resolve comparison this file used before (same correct semantics, now consistent
// with the repo-wide convention rather than a locally reinvented one).
if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(`[backfill-derivation-edges] FATAL: ${e.message}`);
    process.exit(1);
  });
}
