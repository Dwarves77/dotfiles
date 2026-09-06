// author-market-series-delta.mjs — DAG authorship at producer write time for `market_series` (spec 08
// §2.2 Part 2; lane W4-DAG, 2026-09-06: "market_series has no edges" — the plan-completion audit's own
// W3-W4 finding, propagation-run-005's own "0 recomputed on 500 drained" measurement). Mirrors
// `authorAutomateVsHireForRegions` (run-envelope-producer.mjs) and `authorCarbonIntensityEdges`
// (emission-factors-common.mjs) exactly: a thin per-key orchestration shell around `authorEdges()`
// (src/lib/propagation/author-edges.mjs, THE ONE shared authoring module — see that file's own header),
// owning NO formula logic of its own. Every market_series producer that writes real, multi-observation
// history for a series_key imports and calls this AFTER its own guarded write, over the series_key(s)
// that write touched — the SAME "DAG authorship in the same guarded write" shape plan §W4.1 asks for,
// generalised from "one producer's own rows" to "one producer's own series_key set" because a
// market_series delta's second input (the PRIOR observation) is very often a row a PAST run wrote, not
// this run's own candidate — exactly the reason authorAutomateVsHireForRegions re-reads CURRENT state
// rather than trusting only this run's own rows.
//
// WHICH TWO ROWS. `computeSeriesDeltas` (../../../src/lib/market/series-deltas.mjs, imported unmodified —
// the SAME function the registered method (market-series-delta.ts) and the live Market surface
// (MarketComparativeRibbon.tsx) both call) decides which two dates form the 1-week pair; this module reads
// its OWN output (`delta1w.fromDate`, `latest.date`) to find the matching ROW IDs rather than
// re-implementing `nearestAtOrBefore`'s selection rule a second time — one source of truth for "which pair
// is the delta," here only for "which row IDs those dates correspond to."
//
// BOUNDED READ, NOT A FULL-SERIES SCAN. Reads only rows from the last `LOOKBACK_DAYS` (21 — a week's
// target plus margin for a producer's actual publish cadence) per series_key, via a `.gte("reference_period",
// cutoff)` filter — a live eia-v2 series carries 454+ rows going back to 2017; reading the whole history to
// find one week's pair would be exactly the unbounded-read class F38 exists to catch. `readAll` (db.mjs)
// still pages correctly if a bounded window somehow exceeds 1000 rows (it will not, at any real producer
// cadence), so this stays correct even if LOOKBACK_DAYS is later widened.
//
// IDEMPOTENT, NEVER THROWS PER-KEY. `authorEdges`'s own natural-key idempotency (hasBeenAuthored) makes a
// repeat call for an already-authored pair a documented no-op; every outcome (authored / already /
// insufficient-history / unit-mismatch / refused / unknown-method / errored) is counted and returned, never
// thrown — this helper runs AFTER the producer's own primary write has already committed, so a DAG-
// authorship failure must never look like the producer's own write failed.

import { readAll, readClient } from "../../lib/db.mjs";
import { authorEdges } from "../../../src/lib/propagation/author-edges.mjs";
import { computeSeriesDeltas } from "../../../src/lib/market/series-deltas.mjs";
import {
  METHOD_ID as MARKET_SERIES_DELTA_METHOD_ID,
  METHOD_VERSION as MARKET_SERIES_DELTA_METHOD_VERSION,
} from "../../../src/lib/propagation/methods/market-series-delta.ts";

const LOOKBACK_DAYS = 21;
const MARKET_SERIES_SELECT = "id, series_key, reference_period, as_at_date, value_numeric, unit, currency, origin_class";

function pointDate(row) {
  return row?.reference_period ?? row?.as_at_date ?? null;
}

function isoCutoff(now, days) {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * DAG authorship at write time for `market_series_delta` (see file header). Called once per producer run,
 * over every DISTINCT series_key this run's write touched.
 * @param {Iterable<string>} seriesKeys
 * @param {"dry"|"apply"} mode
 * @param {{
 *   readAllFn?: typeof readAll, readClientFn?: typeof readClient, sb?: object,
 *   authorEdgesFn?: typeof authorEdges, computeSeriesDeltasFn?: typeof computeSeriesDeltas,
 *   now?: () => Date,
 * }} [deps] Injectable for tests; production callers omit this entirely.
 */
export async function authorMarketSeriesDeltaEdges(seriesKeys, mode, deps = {}) {
  const counts = {
    authored: 0, skippedAlready: 0, insufficientHistory: 0, unitMismatch: 0,
    refused: 0, unknownMethod: 0, errored: 0,
  };
  const keys = [...new Set(seriesKeys)].filter(Boolean);
  if (mode !== "apply" || !keys.length) return counts;

  const readAllFn = deps.readAllFn ?? readAll;
  const authorEdgesFn = deps.authorEdgesFn ?? authorEdges;
  const computeSeriesDeltasFn = deps.computeSeriesDeltasFn ?? computeSeriesDeltas;
  const now = deps.now ?? (() => new Date());
  const sb = deps.sb ?? (deps.readClientFn ?? readClient)();

  const cutoff = isoCutoff(now(), LOOKBACK_DAYS);

  for (const seriesKey of keys) {
    try {
      const rows = await readAllFn("market_series", MARKET_SERIES_SELECT, {
        match: (qb) => qb.eq("series_key", seriesKey).gte("reference_period", cutoff),
      });
      if (rows.length < 2) { counts.insufficientHistory += 1; continue; }

      const deltas = computeSeriesDeltasFn(rows);
      const d = deltas.delta1w;
      if (!d || d.insufficientHistory) { counts.insufficientHistory += 1; continue; }
      if (d.unitMismatch) { counts.unitMismatch += 1; continue; }

      const latestRow = rows.find((r) => pointDate(r) === deltas.latest?.date);
      const priorRow = rows.find((r) => pointDate(r) === d.fromDate);
      if (!latestRow || !priorRow) { counts.insufficientHistory += 1; continue; } // defensive: should not happen

      const result = await authorEdgesFn(sb, {
        table: "market_series",
        id: latestRow.id,
        entity: null,
        method: { id: MARKET_SERIES_DELTA_METHOD_ID, version: MARKET_SERIES_DELTA_METHOD_VERSION },
        inputs: [
          { table: "market_series", pk: latestRow.id },
          { table: "market_series", pk: priorRow.id },
        ],
      });
      if (!result.ok) {
        if (result.action === "unknown-method") counts.unknownMethod += 1; else counts.refused += 1;
      } else if (result.action === "skipped-already-authored") {
        counts.skippedAlready += 1;
      } else {
        counts.authored += 1;
      }
    } catch (err) {
      counts.errored += 1;
      console.warn(`[author-edges] market_series_delta authorship failed for series_key ${seriesKey}: ${err.message}`);
    }
  }
  return counts;
}
