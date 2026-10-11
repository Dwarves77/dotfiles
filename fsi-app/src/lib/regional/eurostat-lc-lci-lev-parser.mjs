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
