export { isVerbatimSpan, groundCandidate } from "../contracts/verbatim-grounding.mjs";

const SLUG_RE = /[^a-z0-9]+/g;

/** Deterministic series-key slug for a carrier name, lower-case, hyphen-separated, no npm dep. */
export function carrierSlug(carrierName) {
  return String(carrierName ?? "")
    .toLowerCase()
    .trim()
    .replace(SLUG_RE, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build one market_series row for one carrier's own ETS/FuelEU/UKA surcharge notice, for one period.
 * PURE, caller has already grounded the candidate (groundCandidate) and resolved the source (tier
 * from classTierForHost, never hand-typed here).
 *
 * @param {object} candidate {carrierName, tradeLane, currency, value, unit, effectivePeriod,
 *   surchargeType, sourceUrl}
 * @param {{source_id: string, source_key: string|null, tier: number|null}} source
 * @returns {object} a market_series-shaped row (series_key, label, value_numeric, unit, currency,
 *   derivation, origin_class, source_key, source_ref, n_observations, method_version, as_at_date,
 *   reference_period)
 */
export function buildCarrierEtsSurchargeRow(candidate, source) {
  const slug = carrierSlug(candidate.carrierName);
  const laneSlug = candidate.tradeLane ? `-${carrierSlug(candidate.tradeLane)}` : "";
  return {
    series_key: `carrier-ets:${slug}${laneSlug}`,
    label: `${candidate.carrierName}, ${candidate.surchargeType ?? "EU ETS"} surcharge` +
      (candidate.tradeLane ? ` (${candidate.tradeLane})` : ""),
    value_numeric: Number(candidate.value),
    unit: candidate.unit,
    currency: candidate.currency,
    derivation: "observed",
    origin_class: "official",
    source_key: source.source_key ?? null,
    source_ref: `${candidate.carrierName} published surcharge notice, effective ${candidate.effectivePeriod}` +
      (typeof source.tier === "number" ? ` (institution tier T${source.tier})` : ""),
    n_observations: null,
    method_version: null,
    as_at_date: candidate.effectivePeriod,
    reference_period: candidate.effectivePeriod,
  };
}

/**
 * The (series_key, reference_period) key, same shape write-market-series.mjs's planMarketSeriesUpsert
 * uses, so a caller can reuse that planner's diffing directly for this producer's own upsert.
 */
export function rowKey(row) {
  return `${row.series_key}\u0000${row.reference_period ?? ""}`;
}

/**
 * Build the cross-carrier ETS proxy band for one reference period, NEVER a bare blended point (decision
 * 1/2). low/high are the real observed min/max across the period's carrier rows; point is the median.
 * Refuses (returns null) rather than fabricating a band from zero or one row's worth of REAL spread, * a lone carrier's figure is that carrier's own row, not a "proxy," and is never mis-reported as a market
 * range from a single observation.
 *
 * @param {Array<{value_numeric:number, currency:string, reference_period:string}>} carrierRows all rows
 *   already resolved to the SAME reference_period (caller's job to filter/group; pure function, no
 *   grouping logic here)
 * @returns {{low:number, point:number, high:number, currency:string, n_carriers:number,
 *   derivation:"calculated", reference_period:string} | null}
 */
export function buildEtsProxyBand(carrierRows) {
  const rows = (carrierRows ?? []).filter((r) => Number.isFinite(r?.value_numeric));
  if (rows.length < 2) return null; // one or zero observations is not a cross-carrier proxy, never faked

  const currencies = new Set(rows.map((r) => r.currency));
  if (currencies.size > 1) {
    throw new Error(
      `buildEtsProxyBand: mixed currencies in one period's carrier rows (${[...currencies].join(", ")}), ` +
        "convert to one currency before banding, never blend across currencies",
    );
  }
  const periods = new Set(rows.map((r) => r.reference_period));
  if (periods.size > 1) {
    throw new Error(`buildEtsProxyBand: rows span multiple reference_period values (${[...periods].join(", ")}), group by period first`);
  }

  const values = rows.map((r) => r.value_numeric).sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const point = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];

  return {
    low: values[0],
    point,
    high: values[values.length - 1],
    currency: rows[0].currency,
    n_carriers: rows.length,
    derivation: "calculated",
    reference_period: rows[0].reference_period,
  };
}
