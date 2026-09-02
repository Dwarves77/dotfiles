// bls-oews-parser.mjs — pure decoder for the BLS Occupational Employment and Wage Statistics (OEWS)
// programme via the BLS Public Data API v2 timeseries endpoint
// (https://api.bls.gov/publicAPI/v2/timeseries/data/), for a small curated set of freight/logistics
// occupations relevant to Operations D3 labor_markets.
//
// $0, NO KEY REQUIRED: BLS's v2 API accepts unregistered requests (public-domain data,
// data_sources.source_key='bls' confirmed live this session: redistribution='permitted',
// embeddable=true, licence='US public domain'). Registration is OPTIONAL and only raises the daily
// query cap / history depth — per this lane's hard rule 4 ("if a key is required, STOP"), no key is
// obtained or assumed; the producer calls the endpoint unregistered.
//
// NETWORK-FREE BY CONSTRUCTION, same split as the Eurostat parser: this module takes an already-fetched
// BLS v2 JSON response and returns pure data. The producer script owns the HTTP call; this file is
// exercised entirely against a committed fixture (fixtures/bls-oews-sample.json).
//
// SERIES ID CONSTRUCTION — INFERENCE, not verified against a live call this session (network egress to
// api.bls.gov was unavailable in this sandbox; see the producer script header). Built per BLS's PUBLISHED
// series-ID convention for OEWS (https://www.bls.gov/help/hlpforma.htm#OE): survey abbreviation "OEU"
// (Occupational Employment and Wage Statistics, not seasonally adjusted) + area type "N" (national) +
// a 7-digit area code (all zeros for the national total) + a 6-digit industry code (all zeros for
// cross-industry) + the 6-digit SOC occupation code with its dash removed + a 2-digit data-type code.
// Built PROGRAMMATICALLY (buildOewsSeriesId) rather than as hand-typed literals, so the fixed-width
// convention can't silently drift between occupations.
//
// DATA-TYPE CODE 08 (HOURLY MEDIAN WAGE) — CONFIRMED this session (coordinator follow-up, 2026-09-02,
// "BLS OEWS wage fact is hourly (H_MEAN), matching what automate-vs-hire reads"), by the same
// no-network-access constraint as above: api.bls.gov and BLS's own flat-file mirror
// (downloadt.bls.gov/pub/time.series/nw/nw.datatype_id — "nw" is OEWS's own BLS time-series database
// abbreviation) both refused this sandbox's egress (403 at the agent proxy). Confirmed instead via
// WebSearch -> a third-party OEWS API tutorial's own committed reference table
// (github.com/govex/bls-oews-api-tutorial, reference/series_id_codes.json — the FULL 01-17 datatype list,
// not a single cherry-picked code), independently corroborating this file's own PRE-EXISTING datatype 13
// comment below (both the tutorial and this file's original author independently name 13 = "Annual median
// wage") and adding: 03 = Hourly mean wage, 04 = Annual mean wage, 08 = Hourly median wage. This module
// deliberately requests 08 (hourly MEDIAN), not 03 (hourly MEAN) — matching the MEASURE family (median)
// this file already committed to for the annual figure (see the datatype-13 comment's own stated reason,
// "the smallest slice that is still a directly comparable, unambiguous figure"); introducing a MEAN
// statistic for one granularity and a MEDIAN for the other would make the two numbers not directly
// comparable to each other for the same occupation, which is the one thing this pairing must not do.

/** Curated freight/logistics occupations (SOC codes + titles are BLS's own published taxonomy, not
 *  invented). Extend this list by adding an entry — nothing else in the parser is occupation-specific. */
export const OEWS_OCCUPATIONS = Object.freeze([
  { socCode: "53-3032", title: "Heavy and Tractor-Trailer Truck Drivers" },
  { socCode: "53-7062", title: "Laborers and Freight, Stock, and Material Movers, Hand" },
  { socCode: "53-1047", title: "First-Line Supervisors of Transportation and Material-Moving Machine and Vehicle Operators" },
]);

// OEWS data-type codes (BLS's own published list, https://www.bls.gov/help/hlpforma.htm#OE, full list
// confirmed this session — see file header): 13 = annual median wage, 08 = hourly median wage. We stamp
// exactly TWO datatypes (annual median, hourly median) per occupation — the annual figure for the
// cross-occupation display OEWS reports already led with when this producer was first built, and the
// hourly figure `automate-vs-hire.mjs`'s own `labourCostPerHour` input has always documented itself as
// requiring (see that module's header: "Point wage (USD/hour)") but this producer never actually supplied
// until this fix (2026-09-02 coordinator follow-up: "BLS OEWS wage fact is hourly (H_MEAN)... matching
// what automate-vs-hire reads"). NEVER derived from one another by a fixed hours-per-year divisor (2080) —
// each is requested and parsed as BLS's OWN independently published series; see aggregateLcLciLevForRegion
// in the sibling Eurostat parser for the same "never invent a number the source itself did not publish"
// discipline applied to a different measure.
export const ANNUAL_MEDIAN_WAGE_DATATYPE = "13";
export const HOURLY_MEDIAN_WAGE_DATATYPE = "08";

/** Build a 25-character OEWS series ID for the national, cross-industry series for one SOC occupation
 *  code and datatype (default: annual median wage) — e.g. "53-3032" -> "OEUN000000000000053303213" for
 *  the annual series, or pass HOURLY_MEDIAN_WAGE_DATATYPE for the hourly one. */
export function buildOewsSeriesId(socCode, datatype = ANNUAL_MEDIAN_WAGE_DATATYPE) {
  const occCode = String(socCode).replace(/-/g, "");
  if (!/^\d{6}$/.test(occCode)) throw new Error(`buildOewsSeriesId: socCode must be 6 digits (dash optional), got "${socCode}"`);
  if (!/^\d{2}$/.test(String(datatype))) throw new Error(`buildOewsSeriesId: datatype must be 2 digits, got "${datatype}"`);
  const AREA_NATIONAL = "0000000"; // 7 digits
  const INDUSTRY_CROSS = "000000"; // 6 digits
  return `OEU` + `N` + AREA_NATIONAL + INDUSTRY_CROSS + occCode + datatype;
}

/** Per-measure envelope shaping (unit/currency/fact_label-suffix) — the only thing that differs between
 *  the annual and hourly rows this parser emits for the same occupation. */
const MEASURES = Object.freeze({
  annual: { datatype: ANNUAL_MEDIAN_WAGE_DATATYPE, unit: "USD/year", labelSuffix: "annual median wage" },
  hourly: { datatype: HOURLY_MEDIAN_WAGE_DATATYPE, unit: "USD/hour", labelSuffix: "hourly median wage" },
});

/** Maps every (occupation, measure) series ID this producer requests back to {occ, measureKey}, so the
 *  response parser below can shape each series' row correctly regardless of which order BLS returns them
 *  in, and silently ignores any series BLS returns that we did not ask about (same discipline the
 *  pre-existing single-measure index already had). */
const seriesIndex = () => {
  const idx = new Map();
  for (const occ of OEWS_OCCUPATIONS) {
    for (const [measureKey, m] of Object.entries(MEASURES)) {
      idx.set(buildOewsSeriesId(occ.socCode, m.datatype), { occ, measureKey });
    }
  }
  return idx;
};

// OEWS's reference period is the pay period including May 12 of the survey year (BLS OEWS technical
// notes). The v2 API returns only {year, period:"A01"} — no exact day — so as_at_date anchors to 1 May of
// that year as a DOCUMENTED convention, not a fabricated precise date (see the module header on the
// analogous Eurostat semester anchor).
function annualAsAtDate(year) {
  return `${year}-05-01`;
}

/**
 * Parse a BLS v2 timeseries response for the OEWS_OCCUPATIONS catalog into WO-17 envelope observations.
 * Up to TWO rows per occupation (annual median wage, hourly median wage — see MEASURES above), each only
 * when that occupation's series is present with a usable (non-suppressed, non-footnoted-blank) value,
 * using the MOST RECENT year returned for THAT series independently — an occupation whose hourly series
 * lags or is suppressed for the newest year (or entirely absent from the response) still yields its
 * annual row, and vice versa; the two measures are never required to co-occur, and neither is ever
 * computed from the other.
 * @param {object} blsJson - the BLS v2 API response ({status, Results: {series: [...]}}).
 * @param {{regionCode?: string, dimension?: string}} [opts]
 * @returns {Array<object>} observations shaped for buildEnvelopeRow.
 */
export function parseOewsResponse(blsJson, { regionCode = "US", dimension = "labor_markets" } = {}) {
  if (!blsJson || typeof blsJson !== "object") throw new Error("parseOewsResponse: response required.");
  if (blsJson.status && blsJson.status !== "REQUEST_SUCCEEDED") {
    throw new Error(`parseOewsResponse: BLS API did not succeed (status=${blsJson.status}, message=${JSON.stringify(blsJson.message ?? [])})`);
  }
  const series = blsJson?.Results?.series;
  if (!Array.isArray(series)) throw new Error("parseOewsResponse: Results.series missing or not an array.");

  const idx = seriesIndex();
  const observations = [];
  for (const s of series) {
    const hit = idx.get(s.seriesID);
    if (!hit) continue; // a series BLS returned that we did not ask about / do not have catalogued: skip.
    const { occ, measureKey } = hit;
    const measure = MEASURES[measureKey];
    const rows = Array.isArray(s.data) ? s.data : [];
    // Annual-only period code ("A01" — OEWS's own single annual data point per year, for BOTH the annual-
    // and hourly-wage datatypes: BLS publishes one hourly figure per year, not a sub-annual series), with a
    // real numeric value (BLS marks suppressed cells "*" or footnoted-blank).
    const usable = rows.filter((r) => r.period === "A01" && /^-?\d+(\.\d+)?$/.test(String(r.value ?? "").trim()));
    if (!usable.length) continue; // no usable observation for this series: honest gap, never guessed.
    // Most recent year (BLS returns newest-first by convention, but sort explicitly rather than assume).
    usable.sort((a, b) => Number(b.year) - Number(a.year));
    const latest = usable[0];
    const value = Number(latest.value);
    observations.push({
      region_code: regionCode,
      dimension,
      fact_label: `${regionCode} — ${occ.title} ${measure.labelSuffix} (OEWS)`,
      value_numeric: value,
      unit: measure.unit,
      currency: "USD",
      derivation: "observed",
      origin_class: "official",
      source_key: "bls",
      source_ref: s.seriesID,
      method_version: "bls-oews-parser@1",
      as_at_date: annualAsAtDate(latest.year),
      reference_period: String(latest.year),
      n_observations: null,
    });
  }
  return observations;
}
