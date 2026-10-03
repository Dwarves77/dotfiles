// lead-time-position.mjs, spec 02 section 6 item 5 ("Lead-time position chart: a horizontal timeline
// with x-axis in months... carrying a marker for the customer, a distribution for the direct-peer
// cohort and a band for the adjacent-industry cohort") plus section 7 ("SBTi Target Dashboard... This
// is the diffusion engine behind the lead-time chart"). Lane L10, coordinator ruling 2026-10-03
// (brief-l10.md): supersedes finish-plan-2026-09-02.md's "no data source, ruled out" hold, the chart
// IS built, fed by lane L11's SBTi Target Dashboard producer.
//
// Pure derivation behind src/components/market/LeadTimeChart.tsx. PLAIN ESM, ZERO DEPENDENCIES, same
// constraint as every other module under src/lib/market/ (carbon-cost-per-feu.mjs, signal-promotion.mjs,
// series-board-view-model.mjs), importable by `node --test` with no npm deps.
//
// WHY A RAW market_series ROW SHAPE, NOT THE BOARD'S REDUCED SeriesDisplayRow. series-board-view-model.
// mjs's buildSeriesBoard() (the reader MarketSeriesBoard.tsx/MarketComparativeRibbon.tsx already use)
// reduces every row to a FORMATTED DISPLAY STRING (`displayValue`) and discards the raw `value_numeric`,
// correct for a price board that only ever prints one number, wrong for a chart that has to sort and
// average real numbers. Parsing `displayValue` back into a number would be a second home for the same
// value (the "two-homes" bug class CLAUDE.md's reuse-before-construction rule warns against); editing
// series-board-view-model.mjs to expose the raw value is outside this lane's write set (brief-l10.md).
// This module therefore takes the RAW market_series row shape directly, `series_key`, `label`,
// `value_numeric`, `unit`, `origin_class`, `source_key`, `n_observations`, `as_at_date`,
// `reference_period`, the same envelope every producer writes (src/lib/contracts/
// provenance-envelope.mjs, migration 268). The caller (market/page.tsx) hands this module the
// sbti-prefixed subset of whatever raw rows it has in scope, same "no fetch/no derivation inside the
// component" contract CarbonCostOverlay.tsx already follows.
//
// NO SBTI-STATED MINIMUM SAMPLE SIZE EXISTS. docs/specs/02-market-intel.md section 7 names no floor
// for this dataset specifically. DEFAULT_MIN_SAMPLE reuses this SAME spec's own nearest named
// convention, Xeneta's "minimum of 5 rates per route, per day, per equipment type before anything
// publishes" (section 1), as a conservative default. This is a judgment call, stated here plainly per
// the brief's own instruction rather than invented silently (CLAUDE.md rule 2).
//
// NEVER FABRICATE (CLAUDE.md rule 2). Fewer than `minSample` usable rows returns `forecastable: false`
// with the honest reason and the real sample size, never a guessed position, never a silently-dropped
// row. A row whose `unit` is not "months" is excluded from the usable set rather than coerced.

export const DEFAULT_MIN_SAMPLE = 5;

const SBTI_PREFIX = "sbti";

/** True iff `seriesKey` belongs to the SBTi producer's namespace (lane L11, series-registry.mjs's
 *  keyPrefix convention, "sbti" is not yet a registered entry there as of this lane's build, see this
 *  module's header; a future producer owns that namespace exactly as every other prefix does). */
export function isSbtiSeriesKey(seriesKey) {
  return String(seriesKey || "").split(":")[0] === SBTI_PREFIX;
}

/** The row's lead-time value in months, or null when it cannot be read as one. Unit-gated: a row
 *  whose `unit` is not exactly "months" is never coerced, it is excluded from the usable set by the
 *  caller (buildLeadTimePosition), not silently reinterpreted here. */
function monthsValue(row) {
  if (!row || row.unit !== "months") return null;
  const raw = row.value_numeric;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @typedef {object} LeadTimePositionEntry
 * @property {string} seriesKey
 * @property {string} label
 * @property {number} months
 * @property {string|null} originClass
 * @property {string|null} sourceKey
 * @property {number|null} nObservations
 * @property {string|null} asAtDate
 * @property {string|null} referencePeriod
 */

/**
 * Build the comparative lead-time position for the sbti-prefixed subset of `rawRows`.
 *
 * @param {Array<object>} rawRows any market_series rows (mixed prefixes, this function filters to
 *   `sbti:*` itself, so a caller may pass a page's full raw-row fetch unfiltered).
 * @param {{ minSample?: number }} [opts]
 * @returns {{
 *   forecastable: boolean,
 *   sampleSize: number,
 *   minSample: number,
 *   reason: string|null,
 *   cohortMedianMonths: number|null,
 *   rows: LeadTimePositionEntry[],
 * }}
 */
export function buildLeadTimePosition(rawRows, { minSample = DEFAULT_MIN_SAMPLE } = {}) {
  const usable = [];
  for (const r of rawRows ?? []) {
    if (!r || !isSbtiSeriesKey(r.series_key)) continue;
    const months = monthsValue(r);
    if (months === null) continue;
    usable.push({
      seriesKey: r.series_key,
      label: r.label ?? r.series_key,
      months,
      originClass: r.origin_class ?? null,
      sourceKey: r.source_key ?? null,
      nObservations: typeof r.n_observations === "number" ? r.n_observations : null,
      asAtDate: r.as_at_date ?? null,
      referencePeriod: r.reference_period ?? null,
    });
  }

  const sampleSize = usable.length;

  if (sampleSize < minSample) {
    return {
      forecastable: false,
      sampleSize,
      minSample,
      reason:
        sampleSize === 0
          ? "no SBTi-sourced lead-time rows observed yet"
          : `only ${sampleSize} usable SBTi row(s) observed, below the ${minSample}-row floor`,
      cohortMedianMonths: null,
      rows: [],
    };
  }

  const sorted = [...usable].sort((a, b) => a.months - b.months);
  const mid = Math.floor(sorted.length / 2);
  const cohortMedianMonths =
    sorted.length % 2 === 1 ? sorted[mid].months : (sorted[mid - 1].months + sorted[mid].months) / 2;

  return {
    forecastable: true,
    sampleSize,
    minSample,
    reason: null,
    cohortMedianMonths,
    rows: sorted,
  };
}
