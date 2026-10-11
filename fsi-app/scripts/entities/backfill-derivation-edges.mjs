#!/usr/bin/env node

import { readAll, readClient } from "../lib/db.mjs";
import { authorCarbonIntensityEdges } from "../gen/emission-factors-common.mjs";
import { authorMarketSeriesDeltaEdges } from "../producers/market/author-market-series-delta.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";

/** Every live (non-superseded) emission_factors row, the same shape authorCarbonIntensityEdges wants for
 *  BOTH its `writtenRows` and `insertRes.rows` arguments — each live row already carries both
 *  `source_key` (for the licence gate) and `factor_id` (the value to correlate the edge to), so the same
 *  array serves both parameters unmodified; there is no separate "candidate" shape to build. */
async function loadLiveEmissionFactors(readAllFn = readAll) {
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
async function loadCandidateSeriesKeys(readAllFn = readAll) {
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
