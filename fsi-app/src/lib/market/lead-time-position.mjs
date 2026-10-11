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
