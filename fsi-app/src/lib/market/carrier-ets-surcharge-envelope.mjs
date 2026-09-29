// carrier-ets-surcharge-envelope.mjs, pure grounding + row-building for the ETS-proxy producer, lane
// ETS-PROXY (docs/plans/data-machine-tool-gaps-2026-09-25.md tool-gap-1 row 66; build-plan-2026-09-25
// workstream 11; operator decisions 1/2, 2026-09-24/25).
//
// WHY THIS SOURCE, NOT EEX. `market_series`'s `eex-eua` registry entry (series-registry.mjs) has been a
// documented stub since WO-16: "EEX's auction data still carries no open-reuse licence found (a licensed
// venue, not a free-and-clear source, and no producer exists)." Decisions 1/2 (2026-09-24/25, carried in
// build-plan-2026-09-25.md section 1.11 and tool-gap-1's own register) rule the licence-clear proxy this
// module builds instead: "no freight-rate tracking; carbon cost per container/tonne from
// carrier-published ETS surcharges, per carrier/period/source, never blended without a range, client
// override labelled client-supplied, EEX licence deferred." EEX stays deferred (not evaluated further by
// this lane); this module's whole job is the ruled alternative.
//
// WHAT "CARRIER-PUBLISHED ETS SURCHARGE" MEANS HERE. Ocean carriers (Maersk, MSC, CMA CGM, Hapag-Lloyd,
// ONE, Evergreen, ...) publish their own EU ETS / FuelEU / UKA surcharge notices on their own corporate
// sites, per trade/lane and per effective period, as part of their published tariff/BAF communications.
// This is each carrier's OWN announcement of what IT charges, exactly the "any host with a stored
// registry name and no earlier class match, since its own site is a primary only for its own
// announcements" case source-credibility-model's `company` class (SC-13, D14 ruling) names, so every
// carrier host this module writes a row for rates at T7 through `classTierForHost(host, name)` (the
// producer's job, not this module's, see carrier-ets-surcharge-producer.mjs). T7 does not block a
// market_series write (market_series carries no per-item authority floor, unlike a regulatory FACT); it
// is the honest rating rule 18 requires ("get the source, then rate the source... never the figure
// refused"). `origin_class="official"` is still correct per envelope.mjs's own axis (a carrier's notice
// of its OWN surcharge is a primary, unmodified statement about itself), tier and origin_class are
// orthogonal (source-credibility-model Section 3), never conflated.
//
// GROUNDING (CLAUDE.md rule 18 / ADR-016, the same verbatim-span discipline
// state-cost-facts-envelope.mjs applies): a candidate's claimed surcharge figure must be a verbatim
// (whitespace-insensitive) substring of its own captured notice text, or it is refused, never invented.
//
// NEVER BLENDED WITHOUT A RANGE (decision 1/2, verbatim). This module writes ONE market_series row PER
// CARRIER PER PERIOD (buildCarrierEtsSurchargeRow, series_key `carrier-ets:<carrier-slug>`), carriers'
// published surcharges are never averaged into a single series row pretending to be "the" EU ETS
// surcharge. A caller that wants ONE representative proxy figure across carriers for a period (e.g. to
// supply carbon-cost-per-feu.mjs's `carbonPrice` input, see that module's GAP.NO_CARBON_PRICE) calls
// `buildEtsProxyBand`, which returns low/point/high from the ACTUAL observed spread across that period's
// carrier rows, never a bare point. low/high are the real min/max, not an invented uncertainty band
// (contrast carbon-cost-per-feu.mjs's own `band()`, which invents ±UNCERTAINTY_PCT only for a
// non-contractable derivation; here the spread is real cross-carrier data, so it is reported as-is).
//
// PLAIN ESM, ZERO DEPENDENCIES, no I/O, no clock read (as_at_date/reference_period always come from the
// candidate's own notice, never `new Date()`), same posture as ecb-fx-producer.mjs's parser and
// carbon-cost-per-feu.mjs.

// isVerbatimSpan / groundCandidate: the shared ADR-016 / rule 18 verbatim-span grounding check, extracted
// to src/lib/contracts/verbatim-grounding.mjs (F45 duplicate-code gate), state-cost-facts-envelope.mjs
// carried an identical pair. Re-exported here so every existing importer of THIS module keeps working
// unchanged.
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
