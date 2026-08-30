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

/** Curated freight/logistics occupations (SOC codes + titles are BLS's own published taxonomy, not
 *  invented). Extend this list by adding an entry — nothing else in the parser is occupation-specific. */
export const OEWS_OCCUPATIONS = Object.freeze([
  { socCode: "53-3032", title: "Heavy and Tractor-Trailer Truck Drivers" },
  { socCode: "53-7062", title: "Laborers and Freight, Stock, and Material Movers, Hand" },
  { socCode: "53-1047", title: "First-Line Supervisors of Transportation and Material-Moving Machine and Vehicle Operators" },
]);

// OEWS data-type codes (BLS's own published list, https://www.bls.gov/help/hlpforma.htm#OE): 13 = annual
// median wage. We stamp exactly one datatype (annual median) per occupation — the smallest slice that is
// still a directly comparable, unambiguous figure across occupations.
const ANNUAL_MEDIAN_WAGE_DATATYPE = "13";

/** Build a 25-character OEWS series ID for the national, cross-industry, annual-median-wage series for
 *  one SOC occupation code (e.g. "53-3032" -> "OEUN000000000000053303213"). */
export function buildOewsSeriesId(socCode, datatype = ANNUAL_MEDIAN_WAGE_DATATYPE) {
  const occCode = String(socCode).replace(/-/g, "");
  if (!/^\d{6}$/.test(occCode)) throw new Error(`buildOewsSeriesId: socCode must be 6 digits (dash optional), got "${socCode}"`);
  if (!/^\d{2}$/.test(String(datatype))) throw new Error(`buildOewsSeriesId: datatype must be 2 digits, got "${datatype}"`);
  const AREA_NATIONAL = "0000000"; // 7 digits
  const INDUSTRY_CROSS = "000000"; // 6 digits
  return `OEU` + `N` + AREA_NATIONAL + INDUSTRY_CROSS + occCode + datatype;
}

const seriesIndex = () =>
  new Map(OEWS_OCCUPATIONS.map((o) => [buildOewsSeriesId(o.socCode), o]));

// OEWS's reference period is the pay period including May 12 of the survey year (BLS OEWS technical
// notes). The v2 API returns only {year, period:"A01"} — no exact day — so as_at_date anchors to 1 May of
// that year as a DOCUMENTED convention, not a fabricated precise date (see the module header on the
// analogous Eurostat semester anchor).
function annualAsAtDate(year) {
  return `${year}-05-01`;
}

/**
 * Parse a BLS v2 timeseries response for the OEWS_OCCUPATIONS catalog into WO-17 envelope observations.
 * One row per occupation whose series is present with a usable (non-suppressed, non-footnoted-blank)
 * annual value, using the MOST RECENT year returned for that series.
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
    const occ = idx.get(s.seriesID);
    if (!occ) continue; // a series BLS returned that we did not ask about / do not have catalogued: skip.
    const rows = Array.isArray(s.data) ? s.data : [];
    // Annual-only ("A01"), with a real numeric value (BLS marks suppressed cells "*" or footnoted-blank).
    const annual = rows.filter((r) => r.period === "A01" && /^-?\d+(\.\d+)?$/.test(String(r.value ?? "").trim()));
    if (!annual.length) continue; // no usable observation for this series: honest gap, never guessed.
    // Most recent year (BLS returns newest-first by convention, but sort explicitly rather than assume).
    annual.sort((a, b) => Number(b.year) - Number(a.year));
    const latest = annual[0];
    const value = Number(latest.value);
    observations.push({
      region_code: regionCode,
      dimension,
      fact_label: `${regionCode} — ${occ.title} annual median wage (OEWS)`,
      value_numeric: value,
      unit: "USD/year",
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
