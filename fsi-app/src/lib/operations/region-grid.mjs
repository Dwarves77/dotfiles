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
// LAYER 2 (WO-9's deferred half, landed here 2026-08-30): migration 267 added the full number
// envelope (value_numeric, unit, currency, derivation, origin_class, ...) to `regional_data_facts` —
// see src/lib/contracts/provenance-envelope.mjs. `isEnvelopedFact` below is the ONE gate deciding
// whether a fact row gets the indexed numeric treatment or the original free-text prose treatment;
// `indexAgainstBase` is the ONE place a cross-region index is computed. Both are pure and exported so
// RegionDimensionMatrix.tsx never re-derives the gate itself — a second inline check is how the two
// truths this file exists to prevent happen again, one layer up.
//
// LIVE STATE 2026-08-30 (rule 0.15, re-read this session against kwrsbpiseruzbfwjpvsp): all 75 rows are
// still legacy free text — value_numeric IS NOT NULL on 0 of 75 (both WO-17 producers are kill-switched
// off, ENABLED=false). The legacy prose path below is therefore the path that actually renders live
// today and must not regress; the enveloped path is proven by unit tests against constructed fixtures,
// not yet by any live row.

import { ORIGIN_CLASS } from "../contracts/vocabularies.mjs";
import { DERIVATION, roundToSampleSupport } from "../contracts/envelope.mjs";

/** Cell state vocabulary. `absent` means no producer has ever written this cell — an honest hole,
 *  not a rendering failure, and it must be shown as such rather than left blank. */
export const CELL_STATES = /** @type {const} */ (["populated", "absent"]);

const arr = (x) => (Array.isArray(x) ? x : []);
const keyOf = (region, dimension) => `${region}|${dimension}`;

/**
 * THE gate for the dual-layer render rule (WO-12 step 4, master execution plan): a fact renders as
 * an indexed envelope number ONLY when it carries an interpretable number — `valueNumeric` AND `unit`
 * both populated. A `valueNumeric` with no `unit` is a MALFORMED envelope (migration 267's own column
 * comment: "a populated value_numeric with a NULL unit is a malformed envelope, not a valid one"), and
 * this function is the enforcement the migration comment says the DB itself does not add: a malformed
 * row falls back to the legacy prose path below, never a bare number with no unit.
 * @param {{valueNumeric?: number|null, unit?: string|null}} f
 * @returns {boolean}
 */
export function isEnvelopedFact(f) {
  return (
    !!f &&
    typeof f.valueNumeric === "number" &&
    Number.isFinite(f.valueNumeric) &&
    typeof f.unit === "string" &&
    f.unit.length > 0
  );
}

/**
 * Index one enveloped fact against a base region's enveloped fact for the same cell. 100 = parity
 * with the base. Returns null — never a fabricated number — when either input is not a valid envelope
 * (per `isEnvelopedFact`), when the two units differ (an index across mismatched units is noise, not a
 * number), or when the base value is 0 (division is undefined).
 * @param {{valueNumeric?: number|null, unit?: string|null}} fact
 * @param {{valueNumeric?: number|null, unit?: string|null}|null|undefined} baseFact
 * @returns {number|null}
 */
export function indexAgainstBase(fact, baseFact) {
  if (!isEnvelopedFact(fact) || !isEnvelopedFact(baseFact)) return null;
  if (fact.unit !== baseFact.unit) return null;
  if (baseFact.valueNumeric === 0) return null;
  return (fact.valueNumeric / baseFact.valueNumeric) * 100;
}

/** Render-ready numeric string for an enveloped fact, rounded to what `nObservations` honestly
 *  supports (envelope.mjs `roundToSampleSupport` / `significantFigures` — never a raw, over-precise
 *  float). Returns null for a non-enveloped (or malformed) fact; callers fall back to the legacy
 *  free-text `value` column in that case. */
export function formatEnvelopedValue(fact) {
  if (!isEnvelopedFact(fact)) return null;
  const rounded = roundToSampleSupport(fact.valueNumeric, fact.nObservations ?? null);
  return `${rounded} ${fact.unit}`;
}

/** Human label for an origin_class code, or null for an absent/unknown code. Single lookup home so
 *  the matrix never hand-copies the vocabulary text. */
export function originClassLabel(code) {
  return ORIGIN_CLASS[code]?.label ?? null;
}

/** 1 (weakest) .. 7 (strongest) — see vocabularies.mjs ORIGIN_CLASS. Null for an absent/unknown code. */
export function originClassStrength(code) {
  return ORIGIN_CLASS[code]?.strength ?? null;
}

/** Human label for a derivation code, or null for an absent/unknown code. */
export function derivationLabel(code) {
  return DERIVATION[code]?.label ?? null;
}

/**
 * @param {{regionKeys: string[], sourcedDimensions: string[], facts: Array<{regionKey:string, dimension:string, factLabel?:string, value?:string, sourceNote?:string|null, lastUpdated?:string|null, status?:string|null, valueNumeric?:number|null, unit?:string|null, currency?:string|null, derivation?:string|null, originClass?:string|null, sourceKey?:string|null, sourceRef?:string|null, nObservations?:number|null, methodVersion?:string|null, asAtDate?:string|null, referencePeriod?:string|null}>, coverageRows?: Array<{regionKey:string, dimension:string, state?:string|null, factCount?:number|null}>, crossRefCountsByRegion?: Record<string, number>}} input
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
 * ARRANGEMENT ONLY — this moves a column, it does not itself compute an index against the base. That
 * is `indexAgainstBase`'s job, per enveloped fact, and only for facts `isEnvelopedFact` accepts; a
 * legacy free-text fact is never indexed no matter which column is chosen as base.
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
