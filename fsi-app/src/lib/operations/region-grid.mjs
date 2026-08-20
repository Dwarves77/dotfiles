// region-grid.mjs — the ONE computation home for the Operations region x dimension grid.
// PURE: no React, no DOM, no DB, no npm. Consumed by RegionDimensionMatrix.tsx (renders it) and
// OperationsLedger.tsx (its coverage rail reads the same numbers), so the surface cannot show two
// different coverage truths for one page.
//
// WHY THIS EXISTS. Spec 04 §10 records two contradictory truths on this surface: the ledger
// recomputed dimension coverage from raw facts while `region_dimension_coverage` was fetched,
// threaded through the page, and consumed only by a console.log. Separately, D1 (regulatory
// feasibility) has ZERO rows in `regional_data_facts` — it is derived from regulation cross-references
// — so counting it in the same coverage figure as the five sourced dimensions mixes two populations
// silently. ADR-013's rule that a population count must state its predicate is the same discipline.
//
// THE RULE THIS ENCODES: every number leaves here carrying its BASIS. `coverage.basis` is
// 'sourced-facts' or 'cross-references', never blank, and the two are never summed into one figure.
//
// WHAT THIS DELIBERATELY DOES NOT DO: no index, no normalisation, no base-region arithmetic.
// `regional_data_facts.value` is free text ("AED 0.23-0.38/kWh (tiered); blended business rate approx.
// AED 0.405/kWh (USD 0.110/kWh) all-in") with no numeric, unit, currency or reference-period column,
// and `source_id` is NULL on all 75 live rows. Spec 04 component 2's index-vs-base layer is therefore
// not computable on this schema; it needs the number envelope (WO-12) plus a schema migration.
// Inventing a number from that text is the fabricated-claim failure the spec names as worse than a gap.

/** Cell state vocabulary. `absent` means no producer has ever written this cell — an honest hole,
 *  not a rendering failure, and it must be shown as such rather than left blank. */
export const CELL_STATES = /** @type {const} */ (["populated", "absent"]);

const arr = (x) => (Array.isArray(x) ? x : []);
const keyOf = (region, dimension) => `${region}|${dimension}`;

/**
 * @param {{regionKeys: string[], sourcedDimensions: string[], facts: Array<{regionKey:string, dimension:string, factLabel?:string, value?:string, sourceNote?:string|null, lastUpdated?:string|null, status?:string|null}>, coverageRows?: Array<{regionKey:string, dimension:string, state?:string|null, factCount?:number|null}>, crossRefCountsByRegion?: Record<string, number>}} input
 * @returns {{cells: Array, byCell: Record<string, any>, regionCoverage: Array, dimensionCoverage: Array, fillRate: {filled:number, total:number, pct:number, basis:string}, reconciliation: {checked:number, agreed:number, disagreed:Array}, emptyRegions: string[]}}
 */
export function buildRegionGrid({
  regionKeys,
  sourcedDimensions,
  facts,
  coverageRows = [],
  crossRefCountsByRegion = {},
} = {}) {
  const regions = arr(regionKeys).filter((r) => typeof r === "string" && r);
  const dims = arr(sourcedDimensions).filter((d) => typeof d === "string" && d);

  // Bucket facts by (region, dimension). Facts for an unknown region or dimension are dropped —
  // rendering a cell the roster does not contain would invent a column.
  const bucket = new Map();
  for (const f of arr(facts)) {
    if (!f || !regions.includes(f.regionKey) || !dims.includes(f.dimension)) continue;
    const k = keyOf(f.regionKey, f.dimension);
    if (!bucket.has(k)) bucket.set(k, []);
    bucket.get(k).push(f);
  }

  const cells = [];
  const byCell = {};
  for (const regionKey of regions) {
    for (const dimension of dims) {
      const k = keyOf(regionKey, dimension);
      const list = bucket.get(k) ?? [];
      // Deterministic order: facts as delivered, then by label, so the same data always renders the
      // same way (the determinism rule cluster.mjs states for the flywheel applies here too).
      const factList = list.slice().sort((a, b) => String(a.factLabel ?? "").localeCompare(String(b.factLabel ?? "")));
      const cell = {
        regionKey,
        dimension,
        factCount: factList.length,
        state: factList.length > 0 ? "populated" : "absent",
        facts: factList,
        // Newest provenance timestamp present in this cell, or null. Never defaulted to "now".
        lastUpdated: factList.reduce((acc, f) => (f.lastUpdated && (!acc || f.lastUpdated > acc) ? f.lastUpdated : acc), null),
      };
      cells.push(cell);
      byCell[k] = cell;
    }
  }

  // Per-region coverage over the SOURCED dimensions only.
  const regionCoverage = regions.map((regionKey) => {
    const filled = dims.filter((d) => byCell[keyOf(regionKey, d)].factCount > 0).length;
    return {
      regionKey,
      filled,
      total: dims.length,
      pct: dims.length > 0 ? Math.round((filled / dims.length) * 100) : 0,
      basis: "sourced-facts",
      // Reported alongside, never added in: D1 has no rows in regional_data_facts.
      crossReferenceCount: Number.isFinite(crossRefCountsByRegion?.[regionKey]) ? crossRefCountsByRegion[regionKey] : 0,
    };
  });

  const dimensionCoverage = dims.map((dimension) => {
    const filled = regions.filter((r) => byCell[keyOf(r, dimension)].factCount > 0).length;
    return {
      dimension,
      filled,
      total: regions.length,
      pct: regions.length > 0 ? Math.round((filled / regions.length) * 100) : 0,
      basis: "sourced-facts",
    };
  });

  const total = regions.length * dims.length;
  const filled = cells.filter((c) => c.factCount > 0).length;

  // Reconcile against region_dimension_coverage instead of ignoring it. Disagreements are RETURNED,
  // not resolved silently — the table and the facts are two claims about one thing, and a surface
  // that picks one without saying so is how two truths ship on one page.
  const covByCell = new Map();
  for (const row of arr(coverageRows)) {
    if (!row || !regions.includes(row.regionKey) || !dims.includes(row.dimension)) continue;
    covByCell.set(keyOf(row.regionKey, row.dimension), row);
  }
  const disagreed = [];
  let checked = 0;
  for (const [k, row] of covByCell) {
    const claimed = Number.isFinite(row.factCount) ? row.factCount : null;
    if (claimed === null) continue;
    checked++;
    const actual = byCell[k].factCount;
    if (claimed !== actual) disagreed.push({ cell: k, claimed, actual });
  }
  disagreed.sort((a, b) => a.cell.localeCompare(b.cell));

  return {
    cells,
    byCell,
    regionCoverage,
    dimensionCoverage,
    fillRate: { filled, total, pct: total > 0 ? Math.round((filled / total) * 100) : 0, basis: "sourced-facts" },
    reconciliation: { checked, agreed: checked - disagreed.length, disagreed },
    // Regions with no sourced fact in ANY dimension — the hole the surface must show in one glance.
    emptyRegions: regionCoverage.filter((r) => r.filled === 0).map((r) => r.regionKey),
  };
}

/**
 * Order region columns with the chosen base first, remaining regions in roster order.
 * ARRANGEMENT ONLY — this moves a column, it does not compute an index against the base. See the
 * module header for why an index is not computable on the current schema.
 */
export function orderRegions(regionKeys, baseRegionKey) {
  const regions = arr(regionKeys).filter((r) => typeof r === "string" && r);
  if (!baseRegionKey || !regions.includes(baseRegionKey)) return regions.slice();
  return [baseRegionKey, ...regions.filter((r) => r !== baseRegionKey)];
}

/** Extract a bare URL from a free-text source note, or null. Notes look like
 *  "SP Group (Singapore Power) · https://www.spgroup.com.sg/...". Never guesses when absent. */
export function sourceUrlFromNote(note) {
  if (typeof note !== "string") return null;
  const m = note.match(/https?:\/\/[^\s)]+/);
  return m ? m[0] : null;
}

/** The human-facing part of a source note with the URL stripped. */
export function sourceNameFromNote(note) {
  if (typeof note !== "string") return null;
  const cleaned = note.replace(/https?:\/\/[^\s)]+/g, "").replace(/[·|\-–—\s]+$/, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}
