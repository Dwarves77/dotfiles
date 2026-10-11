import { readAll, readClient } from "../../lib/db.mjs";
import { authorEdges } from "../../../src/lib/propagation/author-edges.mjs";
import { computeSeriesDeltas } from "../../../src/lib/market/series-deltas.mjs";
import {
  METHOD_ID as MARKET_SERIES_DELTA_METHOD_ID,
  METHOD_VERSION as MARKET_SERIES_DELTA_METHOD_VERSION,
} from "../../../src/lib/propagation/methods/market-series-delta.ts";
import { writeProducerSummary } from "../lib/producer-summary.mjs";

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
 *   now?: () => Date, trace?: boolean,
 * }} [deps] Injectable for tests; production callers omit this entirely. `trace: true` turns on the
 *   stderr + returned-array trace described in the file header.
 */
export async function authorMarketSeriesDeltaEdges(seriesKeys, mode, deps = {}) {
  const counts = {
    authored: 0, skippedAlready: 0, insufficientHistory: 0, unitMismatch: 0,
    refused: 0, unknownMethod: 0, errored: 0,
  };
  const tracing = deps.trace === true;
  const traceLines = [];
  const trace = (line) => {
    if (!tracing) return;
    traceLines.push(line);
    console.error(`[trace] market_series_delta: ${line}`);
  };

  const keys = [...new Set(seriesKeys)].filter(Boolean);
  trace(`keys received: [${keys.join(", ")}] mode=${mode}`);
  if (mode !== "apply" || !keys.length) return tracing ? { ...counts, trace: traceLines } : counts;

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
      trace(`${seriesKey}: candidates computed, ${rows.length} row(s) in the ${LOOKBACK_DAYS}-day lookback window (cutoff ${cutoff})`);
      if (rows.length < 2) { counts.insufficientHistory += 1; trace(`${seriesKey}: outcome=insufficientHistory (fewer than 2 rows)`); continue; }

      const deltas = computeSeriesDeltasFn(rows);
      const d = deltas.delta1w;
      if (!d || d.insufficientHistory) { counts.insufficientHistory += 1; trace(`${seriesKey}: outcome=insufficientHistory (delta1w: ${JSON.stringify(d)})`); continue; }
      if (d.unitMismatch) { counts.unitMismatch += 1; trace(`${seriesKey}: outcome=unitMismatch (fromDate=${d.fromDate})`); continue; }

      const latestRow = rows.find((r) => pointDate(r) === deltas.latest?.date);
      const priorRow = rows.find((r) => pointDate(r) === d.fromDate);
      if (!latestRow || !priorRow) { counts.insufficientHistory += 1; trace(`${seriesKey}: outcome=insufficientHistory (latest/prior row id not resolvable, should not happen)`); continue; } // defensive: should not happen

      trace(`${seriesKey}: rows attempted, latest=${latestRow.id}@${pointDate(latestRow)} prior=${priorRow.id}@${pointDate(priorRow)}`);

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
        trace(`${seriesKey}: authorEdges refused, action=${result.action} reason=${result.reason}`);
      } else if (result.action === "skipped-already-authored") {
        counts.skippedAlready += 1;
        trace(`${seriesKey}: authorEdges result, already authored, skipped`);
      } else {
        counts.authored += 1;
        trace(`${seriesKey}: rows inserted, valueId=${result.valueId}`);
      }
    } catch (err) {
      counts.errored += 1;
      console.warn(`[author-edges] market_series_delta authorship failed for series_key ${seriesKey}: ${err.message}`);
      trace(`${seriesKey}: ERROR ${err.message}`);
    }
  }
  return tracing ? { ...counts, trace: traceLines } : counts;
}

/**
 * Fail-closed run gate (lane M5, see file header "TRACE + GATE" note). Pure, throws, never returns a
 * boolean a caller could ignore. A producer calls this AFTER logging its own authorCounts, so the reason
 * printed here is the last thing a failed run's log shows.
 *
 * @param {{ rowsChanged: number, edgesAuthored: number }} args
 * @throws {Error} when rowsChanged > 0 and edgesAuthored === 0, real data landed, DAG authorship did
 *   nothing, and (per this lane's own finding) that combination has shipped silently for every producer
 *   run to date. rowsChanged === 0 never throws (nothing was written this run for edges to be authored
 *   FROM, not this bug).
 */
export function assertEdgesAuthored({ rowsChanged, edgesAuthored }) {
  if (rowsChanged > 0 && edgesAuthored === 0) {
    throw new Error(
      `assertEdgesAuthored: this run wrote ${rowsChanged} row(s) to market_series but authored 0 ` +
      `derivation_edges, DAG authorship is wired and was called, but produced no effect. This is the ` +
      `exact defect S4 propagate (docs/audits/stage-audit-2026-09-18/s4-propagate.md, row 1) found live: ` +
      `code that looks correct and traces to nothing. Re-run with --trace to see which outcome bucket ` +
      `every touched series_key landed in (insufficientHistory/unitMismatch/refused/unknownMethod/errored).`,
    );
  }
}

/**
 * THE ONE HOME (lane M9d, 2026-09-20, F45 duplicate-code) for the "call assertEdgesAuthored, record the
 * producers-family summary, rethrow on failure" shape every one of the three market_series producers
 * (ecb-fx, eia-v2-petroleum-spot, eu-weekly-oil-bulletin) needed identically after adding
 * writeProducerSummary, and three copies of an 8-line block is exactly the class F45 exists to catch.
 * Never changes assertEdgesAuthored's own behaviour; wraps the call site.
 *
 * Positional (not options-object) on purpose: the three call sites are otherwise textually identical
 * enough to form their own new clone window against each other (F45, lane M9d); a positional signature
 * keeps each call site to the single line its own local variables already differ by.
 *
 * @param {string} producer
 * @param {number} rowsChanged
 * @param {{ authored: number }} authorCounts DAG-authorship counts; `authored` is what gets recorded.
 * @param {number} parsedCount rows this run parsed, carried into the summary's own `counts` for context.
 * @throws {Error} the same error assertEdgesAuthored throws, after recording status:"failed"
 */
export function assertEdgesAuthoredAndRecordSummary(producer, rowsChanged, authorCounts, parsedCount) {
  const edgesAuthored = authorCounts.authored;
  try {
    assertEdgesAuthored({ rowsChanged, edgesAuthored });
  } catch (err) {
    writeProducerSummary({ producer, status: "failed", rows_changed: rowsChanged, edges_authored: edgesAuthored, reason: err.message });
    throw err;
  }
  writeProducerSummary({ producer, status: "ok", rows_changed: rowsChanged, edges_authored: edgesAuthored, counts: { parsed: parsedCount, authorCounts } });
}
