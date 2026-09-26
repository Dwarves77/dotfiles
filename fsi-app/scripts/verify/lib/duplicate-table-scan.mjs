// @ts-check
// DUPLICATE/PARALLEL-TABLE pure core (lane TOOL-GAP-2, 2026-09-25, closing audit finding DUP-1). GOVERNING
// SKILL: remediation-discipline (section 4, the "F45-shaped structural comparison" DUP-1 itself calls for: a
// structural comparison over information_schema, not a human re-reading every table comment). PURE, no
// DB, no fs; the runner (duplicate-table-audit.mjs) supplies the live column catalog and FK edges.
//
// WHAT IT MEASURES. DUP-1's own manual pass reviewed ~100 table comments by hand and found six candidate
// pairs that LOOKED like they might overlap by name, then closed all six as intentionally-parallel using
// each pair's own migration comment. That method does not scale and would miss an accidental duplication
// introduced without an honest comment (DUP-1's own stated risk). This module replaces "read the comment"
// with two structural signals, neither of which depends on a human writing an honest comment:
//   1. COLUMN-NAME SIMILARITY, Jaccard index over each table's column-name set. Two tables that store the
//      same kind of row tend to have near-identical column vocabularies even when their actual roles differ
//      by grain or direction (DUP-1's own worked examples: source_citations vs intelligence_item_citations,
//      regional_data_facts vs state_cost_facts).
//   2. FOREIGN-KEY-TARGET OVERLAP, Jaccard index over each table's set of tables-it-references via FK.
//      Two tables that point at the same set of other tables are structurally playing a similar role in the
//      schema graph (an edge table between the same two node types, most obviously).
// A pair is a CANDIDATE when either signal clears its threshold. Both signals are reported per pair (the
// evidence), so a human reviewing the output sees WHY a pair was flagged, not just that it was.

/** Jaccard similarity of two string sets: |A∩B| / |A∪B|. 0 when both sets are empty (no basis to compare). */
export function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Build a per-table shape summary from the raw column/FK rows: column-name set and FK-target-table set.
 * @param {Array<{table:string, column:string}>} columns
 * @param {Array<{table:string, refTable:string}>} foreignKeys
 * @returns {Map<string, {columnNames: Set<string>, fkTargets: Set<string>}>}
 */
export function buildTableShapes(columns, foreignKeys) {
  const shapes = new Map();
  const get = (t) => {
    let s = shapes.get(t);
    if (!s) { s = { columnNames: new Set(), fkTargets: new Set() }; shapes.set(t, s); }
    return s;
  };
  for (const c of columns) get(c.table).columnNames.add(c.column);
  for (const f of foreignKeys) get(f.table).fkTargets.add(f.refTable);
  return shapes;
}

/** Minimum FK-target-set size (on BOTH sides of a pair) for the FK-target signal to apply at all. A
 * table with a single FK trivially has fkTargetSimilarity=1.0 against every OTHER single-FK table that
 * happens to point at the same one table (an item_id-shaped edge table pointing at intelligence_items,
 * for instance), that is not structural similarity, it is the single most common shape in the schema.
 * Requiring at least 2 distinct FK targets on each side is the same reasoning F45 uses for its own
 * window size: a signal only means something once it has enough surface area to be improbable by chance. */
export const MIN_FK_TARGETS_FOR_SIGNAL = 2;

/**
 * Every candidate duplicate/parallel-table pair, sorted by descending column-name similarity. A pair
 * clears the bar when EITHER signal meets its threshold; both scores are always reported (evidence).
 * @param {{shapes: Map<string, {columnNames:Set<string>, fkTargets:Set<string>}>, columnNameThreshold?: number, fkTargetThreshold?: number, allowlist?: Record<string,{reason:string}>}} args
 * @returns {Array<{a:string, b:string, columnNameSimilarity:number, fkTargetSimilarity:number, sharedColumns:string[]}>}
 */
export function findCandidatePairs({ shapes, columnNameThreshold = 0.5, fkTargetThreshold = 0.6, allowlist = {} }) {
  const tables = [...shapes.keys()].sort();
  const out = [];
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const [a, b] = [tables[i], tables[j]];
      const pairKey = [a, b].sort().join('|');
      if (Object.prototype.hasOwnProperty.call(allowlist, pairKey)) continue;
      const sa = shapes.get(a), sb = shapes.get(b);
      const columnNameSimilarity = jaccard(sa.columnNames, sb.columnNames);
      const fkEligible = sa.fkTargets.size >= MIN_FK_TARGETS_FOR_SIGNAL && sb.fkTargets.size >= MIN_FK_TARGETS_FOR_SIGNAL;
      const fkTargetSimilarity = fkEligible ? jaccard(sa.fkTargets, sb.fkTargets) : 0;
      if (columnNameSimilarity >= columnNameThreshold || (fkEligible && fkTargetSimilarity >= fkTargetThreshold)) {
        const sharedColumns = [...sa.columnNames].filter((c) => sb.columnNames.has(c)).sort();
        out.push({ a, b, columnNameSimilarity, fkTargetSimilarity, sharedColumns });
      }
    }
  }
  return out.sort((x, y) => y.columnNameSimilarity - x.columnNameSimilarity);
}

/** Stale allowlist entries: a pair no longer both live (one table dropped), or a pair whose current
 * similarity has fallen below both thresholds (the tables diverged since the entry was written and the
 * exemption is no longer earning its keep, informational, since a below-threshold pair was never going
 * to be flagged anyway; the report is a debt-cleanup hint, not a failure). Mirrors schema-drift.mjs's
 * stale-allowlist pattern.
 * @param {{shapes: Map<string, {columnNames:Set<string>, fkTargets:Set<string>}>, allowlist: Record<string,{reason:string}>, columnNameThreshold: number, fkTargetThreshold: number}} args
 */
export function staleAllowlistEntries({ shapes, allowlist, columnNameThreshold, fkTargetThreshold }) {
  const stale = [];
  for (const key of Object.keys(allowlist)) {
    const [a, b] = key.split('|');
    if (!shapes.has(a) || !shapes.has(b)) {
      stale.push({ key, reason: 'allowlisted pair but one or both tables no longer live, remove the entry' });
      continue;
    }
    const sa = shapes.get(a), sb = shapes.get(b);
    const columnNameSimilarity = jaccard(sa.columnNames, sb.columnNames);
    const fkEligible = sa.fkTargets.size >= MIN_FK_TARGETS_FOR_SIGNAL && sb.fkTargets.size >= MIN_FK_TARGETS_FOR_SIGNAL;
    const fkTargetSimilarity = fkEligible ? jaccard(sa.fkTargets, sb.fkTargets) : 0;
    const stillCandidate = columnNameSimilarity >= columnNameThreshold || (fkEligible && fkTargetSimilarity >= fkTargetThreshold);
    if (!stillCandidate) {
      stale.push({ key, reason: `allowlisted pair no longer meets either similarity threshold (columnName=${columnNameSimilarity.toFixed(2)}, fkTarget=${fkTargetSimilarity.toFixed(2)}), the tables diverged; review whether the exemption is still needed` });
    }
  }
  return stale;
}
