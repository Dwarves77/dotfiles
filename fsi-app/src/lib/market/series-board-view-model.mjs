// series-board-view-model.mjs — WO-16 layer 3: the pure transform behind the /market series board
// (src/components/market/MarketSeriesBoard.tsx). Turns raw market_series rows into the grouped,
// formatted, honestly-labelled display shape the board renders.
//
// WHY THIS EXISTS AS ITS OWN MODULE, AND WHY PURE. Same reasoning write-market-series.mjs's header
// gives for planMarketSeriesUpsert: the DECISION of what to show and how lives here, testable with
// zero I/O and zero mocked client, importable by `node --test` directly. The fetcher
// (src/lib/supabase-server.ts:fetchMarketSeriesBoard) is the thin I/O boundary — it queries
// market_series and hands the raw rows straight to buildSeriesBoard(); nothing about "latest wins",
// "group by registry prefix", or "how a value renders" lives in the fetcher, and nothing about
// Supabase lives here.
//
// REUSES latestPerSeries FROM refresh-published-price-statistics.mjs rather than reimplementing the
// same "greatest reference_period wins" reduction a second time — ONE home for that decision
// (run-test-suite.sh's own header names the "two-homes class" of bug this avoids), the same function
// WO-16.2's published_price_statistics feed already uses and already tests
// (src/__tests__/market-refresh-published-price-statistics.test.mjs).
//
// EMPTY-TABLE HONESTY (population-report.mjs's own philosophy: mid-build empty is a legitimate state
// that must say so out loud, never a blank hole). buildSeriesBoard ALWAYS returns one group per
// registry entry (src/lib/market/series-registry.mjs), in registry order, whether or not that
// producer has written a single row yet:
//   - implemented producer, zero rows for its prefix -> state "registered_unpopulated"
//       (wired to write, nothing has landed — the honest mid-build state, not an error)
//   - implemented producer, >=1 row for its prefix   -> state "populated"
//   - un-implemented producer (documented stub)       -> state "not_built"
//       (no producer script exists yet; series-registry.mjs's own stub, not this module's guess)
// A row whose series_key prefix matches NO registry entry (should not happen in practice — a
// producer only ever writes inside its own registered prefix, series-registry.mjs's own header) is
// never silently dropped: it lands in the returned `unregistered` array instead of vanishing.
//
// CURRENCY / VALUE HONESTY: a null value_numeric renders as an em dash with a stated reason, never a
// fabricated number. A recognised currency renders its real symbol; an unrecognised-but-present
// currency renders the raw ISO code inline (never an invented symbol); an absent currency renders no
// currency marker at all. Mirrors the "falls back … never guesses one" rule
// refresh-published-price-statistics.mjs's splitEnvelopeUnit/formatValueDisplay already apply to the
// price-statistics feed, restated here for the board's own display shape.
//
// PLAIN ESM, ZERO DEPENDENCIES — importable by `node --test` with no npm deps, same constraint as
// every module under src/lib/contracts/ and the rest of src/lib/market/.

import { MARKET_SERIES_PRODUCERS } from "./series-registry.mjs";
import { latestPerSeries } from "./refresh-published-price-statistics.mjs";
import { computeSeriesDeltas } from "./series-deltas.mjs";

/** Recognised currency codes -> their real symbol. Absent from this map = show the raw code, never a guess. */
const CURRENCY_SYMBOL = Object.freeze({ EUR: "€", USD: "$", GBP: "£" });

/**
 * Format one market_series row's value_numeric + unit + currency into a display string.
 * @param {{value_numeric:number|string|null, unit?:string|null, currency?:string|null}} row
 * @returns {{ text: string, emptyReason: string|null }}
 */
export function formatSeriesValue(row) {
  const raw = row?.value_numeric;
  if (raw === null || raw === undefined) {
    return { text: "—", emptyReason: "not yet observed" };
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    return { text: "—", emptyReason: "non-numeric value_numeric" };
  }
  const numberStr = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const currency = row.currency || null;
  const symbol = currency ? CURRENCY_SYMBOL[currency] : undefined;

  let text;
  if (symbol) {
    text = `${symbol}${numberStr}`;
  } else if (currency) {
    // Present but unrecognised currency: show the raw ISO code, never an invented symbol.
    text = `${numberStr} ${currency}`;
  } else {
    // No currency at all — a unit-only series (or a future non-monetary one). No symbol, no code.
    text = numberStr;
  }

  if (row.unit) {
    // Strip a redundant "<CURRENCY>/" unit prefix once the currency is already shown (e.g.
    // value_numeric=1493.6, currency="EUR", unit="EUR/1000L" -> "€1,493.60/1000L", not
    // "€1,493.60 EUR/1000L"). Any other unit shape is appended verbatim, space-separated.
    const prefix = currency ? `${currency}/` : null;
    text += prefix && row.unit.startsWith(prefix) ? row.unit.slice(prefix.length - 1) : ` ${row.unit}`;
  }

  return { text, emptyReason: null };
}

function seriesKeyPrefix(seriesKey) {
  return String(seriesKey || "").split(":")[0];
}

/**
 * @typedef {object} SeriesDisplayRow
 * @property {string} seriesKey
 * @property {string|null} id  the WINNING row's own market_series.id (uuid) — the specific observation
 *   this display row renders (latest reference_period per series_key). This is the identity a
 *   WatchButton mounted on this row must watch: fetchWatchlist's resolveWatchlistTypeFields (WO-23)
 *   resolves a watched market_series row by `id` against the market_series table, NOT by series_key
 *   (see supabase-server.ts's own comment on that branch) — so this field is what MarketSeriesBoard.tsx
 *   passes as WatchButton's itemId. Null only if the raw row the caller fetched omitted `id` (defensive;
 *   fetchMarketSeriesBoard's select always includes it).
 * @property {string} label
 * @property {string} displayValue
 * @property {string|null} emptyReason
 * @property {string|null} asAtDate
 * @property {string|null} referencePeriod
 * @property {number} observationCount  count of rows for this series_key in the input (bounded by
 *   whatever window/limit the caller fetched — see fetchMarketSeriesBoard's own note).
 * @property {string|null} sourceKey
 * @property {string|null} sourceRef
 * @property {string|null} unit
 * @property {string|null} currency
 * @property {string|null} derivation  IOSCO/PD391 derivation class (src/lib/contracts/envelope.mjs
 *   DERIVATION) — already selected by fetchMarketSeriesBoard's query, just not threaded through until
 *   Lane SURF's methodology/provenance drawer (spec 02 §6 item 10) needed it.
 * @property {string|null} originClass  spec 00 §3.6 ORIGIN_CLASS code for this observation.
 * @property {string|null} methodVersion
 * @property {number|null} nObservations  sample size behind this observation, when the source reports
 *   one (governs significant-figure rounding at render — src/lib/contracts/envelope.mjs
 *   significantFigures()). Distinct from `observationCount` below, which counts ROWS THIS BOARD SAW for
 *   the series_key, not the source's own reported sample size.
 * @property {object} deltas  Lane SURF (spec 02 §6 item 1, comparative ribbon): Δ1w/Δ1m/ΔYoY + sparkline
 *   computed from EVERY row this board saw for this series_key (not just the latest-wins row above) —
 *   computed HERE, inside buildSeriesBoard, because this is the one place that still has the full
 *   unreduced row list in scope; the fetcher (fetchMarketSeriesBoard) discards it once buildSeriesBoard
 *   returns. See series-deltas.mjs's computeSeriesDeltas for the return shape and the single-point / gap
 *   / unit-mismatch honesty rules this inherits unchanged.
 */

/**
 * @typedef {object} ProducerGroup
 * @property {string} keyPrefix
 * @property {string} name
 * @property {boolean} implemented
 * @property {string} cadence
 * @property {string} sourceName
 * @property {string} sourceUrl
 * @property {string} licenceStatus
 * @property {"not_built"|"registered_unpopulated"|"populated"} state
 * @property {SeriesDisplayRow[]} series
 */

/**
 * Build the /market series board's display model from raw market_series rows.
 *
 * @param {Array<object>} rawRows any market_series rows (any mix of series_key / reference_period —
 *   NOT pre-reduced; this function does the latest-per-series reduction itself).
 * @param {{ producers?: typeof MARKET_SERIES_PRODUCERS }} [opts] override the registry (tests only).
 * @returns {{
 *   groups: ProducerGroup[],
 *   unregistered: SeriesDisplayRow[],
 *   totalObservedSeries: number,
 *   totalProducers: number,
 *   implementedProducerCount: number,
 *   isEmpty: boolean,
 * }}
 */
export function buildSeriesBoard(rawRows, { producers = MARKET_SERIES_PRODUCERS } = {}) {
  const latest = latestPerSeries(rawRows); // Map<series_key, row> — greatest reference_period wins

  const countBySeriesKey = new Map();
  const rowsBySeriesKey = new Map();
  for (const r of rawRows ?? []) {
    if (!r?.series_key) continue;
    countBySeriesKey.set(r.series_key, (countBySeriesKey.get(r.series_key) ?? 0) + 1);
    if (!rowsBySeriesKey.has(r.series_key)) rowsBySeriesKey.set(r.series_key, []);
    rowsBySeriesKey.get(r.series_key).push(r);
  }

  const toDisplayRow = (seriesKey, row) => {
    const { text, emptyReason } = formatSeriesValue(row);
    return {
      seriesKey,
      id: row.id ?? null,
      label: row.label ?? seriesKey,
      displayValue: text,
      emptyReason,
      asAtDate: row.as_at_date ?? null,
      referencePeriod: row.reference_period ?? null,
      observationCount: countBySeriesKey.get(seriesKey) ?? 0,
      sourceKey: row.source_key ?? null,
      sourceRef: row.source_ref ?? null,
      unit: row.unit ?? null,
      currency: row.currency ?? null,
      derivation: row.derivation ?? null,
      originClass: row.origin_class ?? null,
      methodVersion: row.method_version ?? null,
      nObservations: typeof row.n_observations === "number" ? row.n_observations : null,
      // Comparative ribbon (spec 02 §6 item 1) — computed from the FULL row list for this series_key,
      // not just the latest-wins `row` argument above. See this function's own SeriesDisplayRow typedef.
      deltas: computeSeriesDeltas(rowsBySeriesKey.get(seriesKey) ?? [row]),
    };
  };

  const claimedKeys = new Set();
  const groups = producers.map((p) => {
    const series = [];
    for (const [seriesKey, row] of latest) {
      if (seriesKeyPrefix(seriesKey) !== p.keyPrefix) continue;
      claimedKeys.add(seriesKey);
      series.push(toDisplayRow(seriesKey, row));
    }
    series.sort((a, b) => a.seriesKey.localeCompare(b.seriesKey));

    const state = !p.implemented ? "not_built" : series.length === 0 ? "registered_unpopulated" : "populated";

    return {
      keyPrefix: p.keyPrefix,
      name: p.name,
      implemented: p.implemented,
      cadence: p.cadence,
      sourceName: p.sourceName,
      sourceUrl: p.sourceUrl,
      licenceStatus: p.licenceStatus,
      state,
      series,
    };
  });

  // Honest catch-all: a row under a prefix no registry entry claims is surfaced, never dropped.
  const unregistered = [];
  for (const [seriesKey, row] of latest) {
    if (claimedKeys.has(seriesKey)) continue;
    unregistered.push(toDisplayRow(seriesKey, row));
  }
  unregistered.sort((a, b) => a.seriesKey.localeCompare(b.seriesKey));

  const totalObservedSeries =
    groups.reduce((n, g) => n + g.series.length, 0) + unregistered.length;

  return {
    groups,
    unregistered,
    totalObservedSeries,
    totalProducers: producers.length,
    implementedProducerCount: producers.filter((p) => p.implemented).length,
    isEmpty: totalObservedSeries === 0,
  };
}
