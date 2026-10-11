/**
 * Decode a JSON-stat 2.0 dataset's sparse `value` map into an array of coordinate objects.
 * @param {object} js - the JSON-stat 2.0 document (`id`, `size`, `dimension`, `value`).
 * @returns {Array<{coords: Record<string,string>, value: number}>}
 */

export function decodeJsonStat(js) {
  if (!js || !Array.isArray(js.id) || !Array.isArray(js.size) || !js.dimension || !js.value) {
    throw new Error("decodeJsonStat: not a JSON-stat 2.0 document (missing id/size/dimension/value).");
  }
  const { id, size, dimension, value } = js;

  // For each dimension, build index -> category-code lookup (category.index maps code -> position).
  const codesByPos = id.map((dimId) => {
    const cat = dimension[dimId]?.category?.index;
    if (!cat) throw new Error(`decodeJsonStat: dimension "${dimId}" has no category.index.`);
    const byPos = [];
    for (const [code, pos] of Object.entries(cat)) byPos[pos] = code;
    return byPos;
  });

  // Row-major strides: the LAST dimension in `id` varies fastest (JSON-stat 2.0 convention).
  const strides = new Array(id.length);
  strides[id.length - 1] = 1;
  for (let i = id.length - 2; i >= 0; i--) strides[i] = strides[i + 1] * size[i + 1];

  const out = [];
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  for (const [idxStr, v] of entries) {
    if (v === null || v === undefined) continue;
    const idx = Number(idxStr);
    const coords = {};
    let rem = idx;
    for (let d = 0; d < id.length; d++) {
      const pos = Math.floor(rem / strides[d]);
      rem -= pos * strides[d];
      coords[id[d]] = codesByPos[d][pos];
    }
    out.push({ coords, value: Number(v) });
  }
  return out;
}

/** Category label lookup for a dimension code (falls back to the code itself if unlabelled). */
function labelOf(js, dimId, code) {
  return js?.dimension?.[dimId]?.category?.label?.[code] ?? code;
}

// Semester -> calendar-anchor date. Eurostat's `time` codes for this dataset are "YYYY-S1"/"YYYY-S2".
// as_at_date is the PERIOD START, a documented mechanical convention (not the exact assertion day, which
// Eurostat does not publish) — S1 begins 1 January, S2 begins 1 July of the same year.
function semesterToAsAtDate(period) {
  const m = /^(\d{4})-S([12])$/.exec(String(period));
  if (!m) return null;
  const [, year, sem] = m;
  return sem === "1" ? `${year}-01-01` : `${year}-07-01`;
}

/**
 * Parse an nrg_pc_205 JSON-stat response into WO-17 envelope observations, ready for
 * regional-facts-envelope.mjs's buildEnvelopeRow(). One row per (nrg_cons band, time period) present in
 * the payload for the requested geo.
 * @param {object} js - JSON-stat 2.0 document from the Eurostat nrg_pc_205 endpoint.
 * @param {{geo: string, regionCode: string, dimension?: string}} opts - `geo` is the Eurostat geo code to
 *   select (e.g. "EU27_2020"); `regionCode` is the regional_data_facts region code it maps to (e.g. "EU").
 * @returns {Array<object>} observations shaped for buildEnvelopeRow (region_code/dimension/fact_label/
 *   value_numeric/unit/currency/derivation/origin_class/source_key/source_ref/method_version/as_at_date/
 *   reference_period).
 */
export function parseNrgPc205(js, { geo, regionCode, dimension = "operational_cost" } = {}) {
  if (!geo) throw new Error("parseNrgPc205: opts.geo is required (the Eurostat geo code to select).");
  if (!regionCode) throw new Error("parseNrgPc205: opts.regionCode is required.");

  const coordsAndValues = decodeJsonStat(js).filter((c) => c.coords.geo === geo);
  const unitCode = js?.dimension?.unit ? Object.keys(js.dimension.unit.category.index)[0] : null;
  const currencyCode = js?.dimension?.currency ? Object.keys(js.dimension.currency.category.index)[0] : null;

  const observations = [];
  for (const { coords, value } of coordsAndValues) {
    const band = coords.nrg_cons;
    const period = coords.time;
    const asAtDate = semesterToAsAtDate(period);
    if (!asAtDate) continue; // an unrecognised time-code shape: skip rather than guess a date.
    const bandLabel = labelOf(js, "nrg_cons", band);
    observations.push({
      region_code: regionCode,
      dimension,
      fact_label: `${regionCode} — Electricity price for non-household consumers, ${bandLabel} (all taxes and levies)`,
      value_numeric: value,
      // Eurostat nrg_pc_205 publishes price PER kWh in the selected currency when unit=KWH.
      unit: currencyCode && unitCode === "KWH" ? `${currencyCode}/kWh` : (unitCode ?? "unknown"),
      currency: currencyCode ?? null,
      derivation: "observed",
      origin_class: "official",
      source_key: "eurostat",
      source_ref: `nrg_pc_205:geo=${geo};nrg_cons=${band};time=${period}`,
      method_version: "eurostat-nrg-pc-205-parser@1",
      as_at_date: asAtDate,
      reference_period: period,
      n_observations: null,
    });
  }
  return observations;
}
