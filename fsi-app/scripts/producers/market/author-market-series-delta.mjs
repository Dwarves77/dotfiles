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
//
// TRACE + GATE (lane M5, 2026-09-18, S4 propagate audit's own finding: all three producers call this
// unconditionally, a static contract test passes, and the live table still holds 0 `derivation_edges`
// rows for `market_series`). Two additions, both in this ONE home rather than copied into the three
// producer scripts (the brief's own instruction):
//   1. `deps.trace` (boolean), when true, every step (keys received, rows read per key, the delta1w
//      outcome, the candidate pair attempted, the authorEdges result, every caught error verbatim) is
//      logged to stderr AND collected into a `trace` array attached to the returned counts object (a
//      future producer-artifact writer's `config.trace` field reads directly off this; see the M5 lane
//      report for why no `scripts/harness-runs/market/` artifact exists yet to write it into today, no
//      market/regional producer family is registered in `scripts/lib/run-artifact.mjs`'s
//      `ALLOWED_FAMILIES`, and registering one is out of this lane's file list). Omitted entirely (no
//      `trace` key on the return) when `deps.trace` is falsy, so every existing counts-shape assertion in
//      this file's own test stays exact.
//   2. `assertEdgesAuthored({ rowsChanged, edgesAuthored })`, pure, exported separately so a producer (or
//      a test) can call it without going through a live run. Throws when the producer's own guarded write
//      landed real rows (`rowsChanged > 0`) but authorship landed zero edges (`edgesAuthored === 0`),
//      "wired, called, zero effect" is exactly the bug this lane exists to close, so a repeat of it must
//      fail the run (non-zero exit), never pass silently the way it has for every producer run to date.
//      `rowsChanged === 0` (nothing created or updated this run) never asserts, a no-op write has nothing
//      to author edges FROM, and is not this bug.

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
