// eurostat-lc-lci-lev-parser.mjs — pure decoder + aggregator for Eurostat dataset `lc_lci_lev` ("Labour
// cost levels by NACE Rev. 2 activity", https://ec.europa.eu/eurostat/databrowser/view/lc_lci_lev), the
// EU-side `labor_markets` producer that closes the BLS/Eurostat region disjointness (2026-09-02 coordinator
// follow-up, Lane DP-SURF, system-completion train task 3: "no region has both facts").
//
// $0, no key: same Eurostat dissemination API as nrg_pc_205 (CC BY 4.0 per `data_sources.licence` for
// source_key='eurostat', open, unauthenticated — see eurostat-nrg-pc-205-parser.mjs's own header for the
// licence confirmation, which applies to every Eurostat dataset under the same source_key, not
// per-dataset).
//
// REUSES eurostat-nrg-pc-205-parser.mjs's `decodeJsonStat` DIRECTLY rather than re-implementing the
// JSON-stat 2.0 sparse-value decode — "use the same JSON-stat API client/parse pattern as
// eurostat-nrg-pc-205-producer.mjs" (coordinator's own instruction), taken literally: one canonical
// decoder, not a second drifting copy.
//
// DIMENSION CODES — CONFIRMED live this session (coordinator follow-up, 2026-09-02, via WebFetch against
// https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lc_lci_lev — several exploratory
// fetches, not one; see this lane's REPORT for the full trail):
//   - id order: ["freq","unit","lcstruct","nace_r2","geo","time"] (confirmed across every fetch).
//   - unit: "EUR" (Euro) is what this parser requests — confirmed present with real populated values.
//   - lcstruct: "D1_D4_MD5" = "Labour cost for LCI (compensation of employees plus taxes minus subsidies)"
//     — the TOTAL labour cost measure, matching the coordinator's "labour cost levels" framing. (Other
//     lcstruct codes split out wages-only or non-wage costs; not used here.)
//   - nace_r2: "B-N" = "Business economy" — CONFIRMED to carry real 2023 data for every one of this
//     parser's target member states (DE/NL/BE/FR/IT/ES); the more literal-sounding "B-S" (all-economy
//     total, including public administration) was tried FIRST and is NOT published for this lcstruct at
//     all (empty for every geo, every year, confirmed twice) — Eurostat's own coverage gap, not a parser
//     bug. "B-N" is the cross-industry aggregate this dataset actually publishes, the closest honest match
//     to BLS OEWS's own "cross-industry" (INDUSTRY_CROSS="000000") convention (bls-oews-parser.mjs).
//   - geo: standard Eurostat 2-letter country codes (DE, FR, ...) plus several EU/EA aggregate pseudo-codes
//     (EU27_2020, EA20, ...).
//   - time: PLAIN 4-digit years ("2023"), unlike nrg_pc_205's semester codes ("2023-S1") — this dataset is
//     annual, confirmed by the coordinator's brief and by every fetch's own `freq: "A"` (Annual) dimension.
//
// *** NO EU-WIDE AGGREGATE IS PUBLISHED FOR THIS MEASURE — CONFIRMED, NOT ASSUMED. *** Unlike nrg_pc_205
// (which DOES publish an EU27_2020 electricity-price aggregate, letting that producer write one 'EU'-region
// row straight from the source), `lc_lci_lev` with unit=EUR/lcstruct=D1_D4_MD5 returns an EMPTY value for
// EU27_2020 (and every other EU/EA aggregate code) across every year tried — confirmed via two independent
// fetches, one with geo pinned to EU27_2020 and no time filter (every one of 9 available years empty), one
// with no geo filter at all (EU27_2020 absent from the populated-data list; only individual member states
// were populated). This is consistent with Eurostat's own practice: a national-currency labour-cost LEVEL
// cannot be aggregated across the euro area without an employment-share weighting Eurostat evidently does
// not publish for this series (unlike a per-unit price, which nrg_pc_205's aggregate is).
//
// THIS PARSER'S ANSWER: aggregateLcLciLevForRegion computes a SIMPLE ARITHMETIC MEAN across the specific
// member states the `regions` table's own 'EU' row already names in its `iso_codes` (migration 106:
// ARRAY['EU','DE','NL','BE','FR','IT','ES'] — DE/NL/BE/FR/IT/ES are this parser's EU_MEMBER_GEO_CODES,
// below), each individually confirmed to publish real unit=EUR/lcstruct=D1_D4_MD5/nace_r2=B-N data. This
// is NOT inventing a number Eurostat does not publish for each country (every input is Eurostat's own
// published figure); it IS a computation this module performs and must be labelled as such — hence
// `derivation: "calculated"` / `origin_class: "derived"` (NOT "observed"/"official", which the sibling
// nrg_pc_205 parser correctly uses for its own single, directly-published aggregate) and
// `n_observations` set to the actual country count behind the mean, per that column's own documented
// purpose ("Sample size behind an aggregated figure, where the derivation is an aggregate" — migration
// 267). A country whose fetch failed or carries no data for this exact filter combination is EXCLUDED from
// the mean, never zero-filled or estimated — the mean is honestly over however many of the six actually
// resolved, and `source_ref` names exactly which ones and which year(s) contributed.
//
// A NAMED SIMPLIFICATION (stated, not hidden): each country contributes its OWN latest available year
// (some member states may lag others in publishing a given year), and the aggregate's single
// `reference_period`/`as_at_date` is the MOST RECENT year among the countries actually included — so a
// country whose latest available year is older than that is still averaged in, at its own latest figure,
// under a `reference_period` label that is technically the newest contributor's year, not necessarily
// every contributor's year. `source_ref` records the full set of contributing years for exactly this
// reason (an auditor can see the spread, not just the label). A weighted-by-employment or
// exact-year-matched mean would be more rigorous; this is the simplest, most transparent aggregation this
// module commits to, matching this module's own stated non-goal of inventing precision the source data
// does not itself support.
//
// NETWORK-FREE BY CONSTRUCTION, same split as every parser in this directory: this module takes
// already-fetched JSON-stat documents and returns pure data. The producer script
// (scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs) owns the HTTP calls (one per member
// state — see that file's header for why a per-geo fetch was chosen over a single multi-geo query); this
// file is exercised entirely against a committed fixture
// (fixtures/eurostat-lc-lci-lev-sample.json), never touching the network.

import { decodeJsonStat } from "./eurostat-nrg-pc-205-parser.mjs";

export { decodeJsonStat };

/** The 'EU' region's own constituent member states (migration 106: regions.iso_codes for code='EU' is
 *  ARRAY['EU','DE','NL','BE','FR','IT','ES'] — this list is that array MINUS the 'EU' pseudo-code itself,
 *  which is not a real Eurostat country geo). Kept here, not re-derived from a live `regions` read, because
 *  this module is network-free and DB-free by construction (see header) — a change to the region's own
 *  iso_codes is a deliberate, reviewed edit to this constant, matching how bls-oews-parser.mjs's
 *  OEWS_OCCUPATIONS is a reviewed, hand-maintained list rather than derived at runtime. */
export const EU_MEMBER_GEO_CODES = Object.freeze(["DE", "NL", "BE", "FR", "IT", "ES"]);

const UNIT_CODE = "EUR";
const LCSTRUCT_CODE = "D1_D4_MD5";
const NACE_R2_CODE = "B-N";

/** The exact Eurostat filter this parser expects a fetched payload to have been queried with — exported so
 *  the producer's fetch URL and this parser's own reasoning can never silently drift apart. */
export const LC_LCI_LEV_REQUEST_FILTER = Object.freeze({ unit: UNIT_CODE, lcstruct: LCSTRUCT_CODE, nace_r2: NACE_R2_CODE });

/**
 * Decode ONE member state's JSON-stat 2.0 `lc_lci_lev` response (queried for exactly that geo, unit=EUR,
 * lcstruct=D1_D4_MD5, nace_r2=B-N — see LC_LCI_LEV_REQUEST_FILTER; every OTHER dimension is expected to be
 * a size-1 singleton in the payload, but this function does not assume that — it filters explicitly on
 * `coords.geo === geo` the same way parseNrgPc205 filters on the requested geo) into that geo's LATEST
 * available (year, value) pair. Returns `null` when the geo carries no populated cell at all (an honest
 * gap, never guessed) — never throws for a merely-empty payload (a network hiccup or a genuinely
 * unpublished country should not abort the whole EU aggregate; see the producer's per-geo fetch loop).
 * @param {object} js - JSON-stat 2.0 document for one geo.
 * @param {string} geo - the Eurostat geo code this document was queried for (e.g. "DE").
 * @returns {{geo: string, value: number, year: string, unit: string, currency: string|null} | null}
 */
export function latestLcLciLevValueForGeo(js, geo) {
  if (!geo) throw new Error("latestLcLciLevValueForGeo: geo is required.");
  const rows = decodeJsonStat(js).filter((c) => c.coords.geo === geo);
  if (!rows.length) return null;
  // Plain 4-digit-year time codes (unlike nrg_pc_205's semester codes) — numeric compare picks latest.
  rows.sort((a, b) => Number(b.coords.time) - Number(a.coords.time));
  const best = rows[0];
  const unitCode = js?.dimension?.unit ? Object.keys(js.dimension.unit.category.index)[0] : null;
  return {
    geo,
    value: Number(best.value),
    year: String(best.coords.time),
    // Eurostat lc_lci_lev publishes labour cost LEVELS per hour worked, in the selected currency, when
    // unit=EUR (coordinator's brief + magnitude sanity check: real confirmed values cluster 5-65, the
    // right order of magnitude for an hourly wage, not an annual one — see file header).
    unit: unitCode === "EUR" ? "EUR/hour" : (unitCode ?? "unknown"),
    currency: unitCode === "EUR" ? "EUR" : null,
  };
}

/**
 * Aggregate one already-fetched JSON-stat document PER member state into a SINGLE region-level
 * `labor_markets` observation (see file header for why a mean, and why this is `derivation: "calculated"`
 * not `"observed"`). `jsByGeo` is a plain object keyed by geo code (the producer's own per-geo fetch loop
 * builds this); a geo absent from `jsByGeo`, or present but carrying no data, is excluded from the mean —
 * never zero-filled. Returns an array of 0 or 1 observations (0 when NO requested geo resolved any data
 * at all — an honest empty result, never an "average of nothing"), shaped for
 * regional-facts-envelope.mjs's `buildEnvelopeRow`, the SAME contract every parser in this directory
 * returns (see parseNrgPc205/parseOewsResponse).
 * @param {Record<string, object>} jsByGeo - geo code -> that geo's JSON-stat 2.0 document (or absent).
 * @param {{geoCodes?: string[], regionCode: string, dimension?: string}} opts
 * @returns {Array<object>} 0 or 1 observations.
 */
export function aggregateLcLciLevForRegion(jsByGeo, { geoCodes = EU_MEMBER_GEO_CODES, regionCode, dimension = "labor_markets" } = {}) {
  if (!regionCode) throw new Error("aggregateLcLciLevForRegion: opts.regionCode is required.");
  if (!Array.isArray(geoCodes) || !geoCodes.length) throw new Error("aggregateLcLciLevForRegion: opts.geoCodes must be a non-empty array.");

  const perCountry = [];
  for (const geo of geoCodes) {
    const js = jsByGeo?.[geo];
    if (!js) continue; // this geo's fetch failed or was never attempted: honestly excluded.
    const fact = latestLcLciLevValueForGeo(js, geo);
    if (fact) perCountry.push(fact);
  }
  if (perCountry.length === 0) return [];

  const mean = perCountry.reduce((sum, f) => sum + f.value, 0) / perCountry.length;
  const geosUsed = perCountry.map((f) => f.geo).sort();
  const yearsUsed = [...new Set(perCountry.map((f) => f.year))].sort();
  const latestYear = yearsUsed[yearsUsed.length - 1];

  return [
    {
      region_code: regionCode,
      dimension,
      fact_label: `${regionCode} — Labour cost, business economy (EUR/hour), mean across member states (Eurostat lc_lci_lev)`,
      // Rounded to 2dp — the source's own published precision is coarser (1dp in the databrowser UI); an
      // unrounded mean of two 1dp figures can carry a spurious third/fourth decimal a plain arithmetic
      // division introduces, which is precision this module did not earn. See file header's simplification
      // note.
      value_numeric: Math.round(mean * 100) / 100,
      unit: perCountry[0].unit,
      currency: perCountry[0].currency,
      derivation: "calculated",
      origin_class: "derived",
      source_key: "eurostat",
      source_ref:
        `lc_lci_lev:unit=${UNIT_CODE};lcstruct=${LCSTRUCT_CODE};nace_r2=${NACE_R2_CODE};` +
        `geo_mean_of=${geosUsed.join(",")};years=${yearsUsed.join(",")}`,
      method_version: "eurostat-lc-lci-lev-parser@1",
      as_at_date: `${latestYear}-01-01`, // annual reference; year-start anchor, same mechanical convention as bls-oews-parser.mjs's annualAsAtDate.
      reference_period: latestYear,
      n_observations: perCountry.length,
    },
  ];
}
