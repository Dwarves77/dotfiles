// @ts-check
// DUPLICATE/PARALLEL-TABLE pure core (lane TOOL-GAP-2, 2026-09-25, closing audit finding DUP-1).
// RECALIBRATED (coordinator ruling, same date, after the first cut's top candidate,
// org_memberships<->user_watchlist, was "plainly not a duplicate" and 6 of the 8 DUP-1-confirmed pairs
// scored below the first cut's raw-Jaccard thresholds). GOVERNING SKILL: remediation-discipline (section 4,
// the "F45-shaped structural comparison" DUP-1 itself calls for). PURE, no DB, no fs; the runner
// (duplicate-table-audit.mjs) supplies the live column catalog, types, and table comments.
//
// GROUND TRUTH THIS MODULE IS CALIBRATED AGAINST (see duplicate-table-scan.test.mjs): the 8 pairs DUP-1
// itself confirmed worth a human look (POSITIVES, must score >= CANDIDATE_THRESHOLD) and 15 hand-labelled
// negatives from the first cut's noisiest output (must mostly score below it). Measured on the live schema
// (2026-09-25, kwrsbpiseruzbfwjpvsp): 7 of 8 positives caught, 14 of 15 negatives correctly excluded. The
// one miss (census_worklist<->coverage_gap_candidates) was investigated, not silently dropped: the two
// tables share ZERO non-structural columns, ZERO table-name tokens, and no code file references both, the
// only relationship is transitive, through coverage_gap_census_findings (which DOES score against both).
// Two single-hop transitive-closure designs were prototyped and rejected: both exploded to 170+ spurious
// pairs on the live schema (generic name fragments like "user"/"item" or hub tables with many unrelated
// neighbors), a worse defect than the one miss they would have fixed (documented in this lane's
// session-log; rule 14, this is a corrected-in-place finding, not a silently dropped one).
//
// FOUR SIGNALS, replacing the first cut's raw column-name Jaccard (which any two tables sharing a handful
// of universal audit/FK columns satisfied trivially, the org_memberships<->user_watchlist defect):
//
//   1. STRUCTURAL-COLUMN EXCLUSION + RARITY WEIGHTING. `id`, `created_at`, `updated_at`, `org_id`,
//      `user_id` are present on most tables and contribute ZERO evidence (not merely downweighted, a
//      short table's few OTHER columns cannot dilute a flat weight the way a rarity weight alone can, as
//      measured on org_memberships (5 columns, 4 of them structural)). Every other shared column is
//      weighted 1/df (document frequency across all tables): common non-structural columns like `status`
//      count little, tables that share a handful of distinctive envelope columns (`value_numeric`,
//      `source_key`, `method_version`, ...) count a lot.
//   2. TYPE-GATED + MIN-EVIDENCE. A shared column only counts if both tables give it the SAME declared
//      type (name-only coincidences, e.g. two unrelated `status` text columns with different vocabularies,
//      are not proof by themselves), AND at least MIN_SIGNIFICANT_SHARED such columns must agree before
//      the name signal is nonzero at all (a single coincidental match, e.g. both tables happening to have
//      a `note` field, is not structural evidence, the same reasoning as F45's window size).
//   3. TABLE-NAME TOKEN OVERLAP. DUP-1's own manual review started from "pairs that read as possibly
//      overlapping BY NAME" (`coverage_gap_candidates` / `coverage_gap_census_findings` / `census_worklist`
//      all share "coverage"/"gap"/"census" in their own names), this encodes that heuristic directly,
//      needs no column or comment data at all, and is immune to the size-asymmetry problem symmetric
//      Jaccard has (overlap coefficient: shared / min(|A|,|B|)).
//   4. COMMENT EVIDENCE, two forms: (a) token-overlap Jaccard on tokenized comments (stopworded, gated at
//      >=2 shared terms so one coincidental word is not evidence); (b) COMMENT-MENTIONS-OTHER, a table's
//      own comment literally naming the other table (e.g. intelligence_item_citations' comment: "edge
//      table parallel to source_citations") is a human having already done the disambiguation work and
//      left a durable pointer to it, the single strongest signal available, scored as its own high floor
//      rather than blended in (a long, otherwise-unrelated comment should not dilute an explicit mention).

/** Universal structural/audit columns present on most tables regardless of domain: excluded entirely
 * (weight 0), not merely downweighted (see module header for why a flat weight alone is not enough on a
 * short table). */
export const STRUCTURAL_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'org_id', 'user_id']);

/** A column present in more than this many tables is not "distinctive" evidence for the min-evidence gate
 * (2 below), generously wide so genuinely rare envelope columns (df ~4-10 in the live schema) still
 * count, while `status`/`notes`-shaped columns (df 20+) do not. */
export const RARE_DF_CEILING = 20;

/** Minimum number of distinctive (non-structural, type-matching, df <= RARE_DF_CEILING) shared columns
 * before the column-name signal is nonzero at all, a single coincidental match is not evidence. */
export const MIN_SIGNIFICANT_SHARED = 2;

/** Words too generic in a TABLE NAME to count as evidence of relatedness by themselves (they recur across
 * unrelated domains: "org_memberships" and "user_watchlist" would otherwise share nothing here, but
 * "user_item_state" and "user_watchlist" would spuriously share "user"). */
const NAME_TOKEN_STOP = new Set(['id', 'org', 'user', 'item', 'data', 'info']);

/** Generic words too common across table COMMENTS in this codebase to count as evidence (project-wide
 * vocabulary like "migration"/"operator", not domain-specific terms). */
const COMMENT_STOP = new Set([
  'this', 'that', 'with', 'from', 'into', 'table', 'tables', 'column', 'columns', 'never', 'which',
  'their', 'about', 'when', 'being', 'while', 'where', 'other', 'migration', 'operator', 'session',
  'data', 'read', 'write', 'rows', 'field', 'fields', 'type', 'types', 'system', 'platform', 'model',
  'value', 'values', 'record', 'records', 'store', 'stores',
]);

/**
 * Per-table shape: column-name -> declared type (udt_name), for weighting + type-gating.
 * @param {Array<{table:string, column:string, udtName?:string, dataType?:string}>} columns
 * @returns {Map<string, Map<string,string>>} table -> (column -> type)
 */
export function buildColumnTypeMaps(columns) {
  const byTable = new Map();
  for (const c of columns) {
    let m = byTable.get(c.table);
    if (!m) { m = new Map(); byTable.set(c.table, m); }
    m.set(c.column, c.udtName || c.dataType || '');
  }
  return byTable;
}

/** Document frequency: how many tables contain a column of this name, at all (any type). */
export function columnDocFrequency(columnTypeMaps) {
  const df = new Map();
  for (const [, cols] of columnTypeMaps) {
    for (const name of cols.keys()) df.set(name, (df.get(name) || 0) + 1);
  }
  return df;
}

/** Rarity weight for a column name: 0 for structural columns, else 1/documentFrequency. */
export function columnWeight(name, df) {
  if (STRUCTURAL_COLUMNS.has(name)) return 0;
  const d = df.get(name) || 1;
  return 1 / d;
}

/** The distinctive (non-structural, type-matching, rare-enough) columns two tables share, the min-evidence
 * gate's own input and the report's per-pair evidence list. */
export function sharedSignificantColumns(a, b, columnTypeMaps, df) {
  const ta = columnTypeMaps.get(a), tb = columnTypeMaps.get(b);
  if (!ta || !tb) return [];
  const out = [];
  for (const [name, type] of ta) {
    if (STRUCTURAL_COLUMNS.has(name)) continue;
    if ((df.get(name) || 0) > RARE_DF_CEILING) continue;
    if (tb.has(name) && tb.get(name) === type) out.push(name);
  }
  return out.sort();
}

/** Type-gated, rarity-weighted Jaccard over column names: only columns present in both WITH matching
 * declared type count, each weighted by columnWeight. Gated at MIN_SIGNIFICANT_SHARED (returns 0 below
 * it), the fix for the org_memberships<->user_watchlist defect (see module header). */
export function weightedColumnJaccard(a, b, columnTypeMaps, df) {
  if (sharedSignificantColumns(a, b, columnTypeMaps, df).length < MIN_SIGNIFICANT_SHARED) return 0;
  const ta = columnTypeMaps.get(a), tb = columnTypeMaps.get(b);
  const allNames = new Set([...ta.keys(), ...tb.keys()]);
  let interW = 0, unionW = 0;
  for (const name of allNames) {
    const w = columnWeight(name, df);
    unionW += w;
    if (ta.has(name) && tb.has(name) && ta.get(name) === tb.get(name)) interW += w;
  }
  return unionW === 0 ? 0 : interW / unionW;
}

/** Same evidence, overlap-coefficient form (interW / min(sumA, sumB) instead of union): does not penalize
 * a large, feature-rich table for its own many unrelated extra columns the way symmetric Jaccard does
 * when it merely EMBEDS a smaller table's envelope (measured: assumption_register<->emission_factors,
 * 2.5x table-size difference, undercounted by plain Jaccard). `overlapFactor` discounts this form's
 * naturally higher values so it does not, by itself, dominate the blended score. */
export function weightedColumnOverlap(a, b, columnTypeMaps, df) {
  if (sharedSignificantColumns(a, b, columnTypeMaps, df).length < MIN_SIGNIFICANT_SHARED) return 0;
  const ta = columnTypeMaps.get(a), tb = columnTypeMaps.get(b);
  let interW = 0, sumA = 0, sumB = 0;
  for (const [name] of ta) sumA += columnWeight(name, df);
  for (const [name] of tb) sumB += columnWeight(name, df);
  for (const [name, type] of ta) {
    if (tb.has(name) && tb.get(name) === type) interW += columnWeight(name, df);
  }
  const denom = Math.min(sumA, sumB);
  return denom === 0 ? 0 : interW / denom;
}

function tokenizeName(table) {
  return new Set(String(table).split('_').filter((w) => w.length >= 3 && !NAME_TOKEN_STOP.has(w)));
}

/** Overlap coefficient of significant table-NAME tokens, DUP-1's own starting heuristic ("reads as
 * possibly overlapping by name"), needing no column or comment data. */
export function tableNameOverlap(a, b) {
  const ta = tokenizeName(a), tb = tokenizeName(b);
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const denom = Math.min(ta.size, tb.size);
  return denom === 0 ? 0 : inter / denom;
}

function tokenizeComment(comment) {
  if (!comment) return new Set();
  const matches = String(comment).toLowerCase().match(/[a-z][a-z_]{3,}/g) || [];
  return new Set(matches.filter((w) => !COMMENT_STOP.has(w)));
}

/** Token-overlap Jaccard on tokenized comments, gated at >=2 shared terms (one coincidental word is not
 * evidence). Comment text may embed the other table's own name as a compound token (e.g.
 * "coverage_gap_candidates" inside coverage_gap_census_findings's comment), which this also naturally
 * captures. */
export function commentSimilarity(a, b, commentByTable) {
  const ta = tokenizeComment(commentByTable.get(a)), tb = tokenizeComment(commentByTable.get(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  if (inter < 2) return 0;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** True when either table's own comment literally names the OTHER table, a human has already done the
 * disambiguation work. The strongest available signal, but only trusted for COMPOUND names (containing
 * an underscore): a bare single-word table name like "sources" or "profiles" is common enough English
 * vocabulary that it turns up as a coincidental substring of unrelated prose (measured on the live schema:
 * bulk_imports' comment names the route "/api/admin/sources/bulk-import", which contains the literal text
 * "sources" with no relation at all to the sources table). A compound name like "org_memberships" or
 * "coverage_gap_candidates" is specific enough that its appearance in another table's comment is reliably
 * a genuine cross-reference. */
export function commentMentionsOther(a, b, commentByTable) {
  const ca = commentByTable.get(a), cb = commentByTable.get(b);
  const aIsCompound = a.includes('_'), bIsCompound = b.includes('_');
  return Boolean((ca && bIsCompound && ca.includes(b)) || (cb && aIsCompound && cb.includes(a)));
}

/** Weights for the blended score. Tuned against the calibration fixture (duplicate-table-scan.test.mjs):
 * 7/8 recall on the 8 DUP-1 positives, 14/15 of the hand-labelled negatives correctly excluded. */
export const SCORE_WEIGHTS = Object.freeze({ name: 0.5, comment: 0.15, tableName: 0.35, overlapFactor: 0.5, mention: 0.5 });

/** The candidate threshold, calibrated to be the smallest value that still catches every reachable
 * positive (the lowest-scoring caught positive, census_worklist<->coverage_gap_census_findings, sits at
 * 0.192) while excluding all but one of the 15 labelled negatives. */
export const CANDIDATE_THRESHOLD = 0.19;

/**
 * The full evidence + score for one table pair. Pure; every input is data the runner already fetched.
 * @param {string} a
 * @param {string} b
 * @param {{columnTypeMaps: Map<string,Map<string,string>>, df: Map<string,number>, commentByTable: Map<string,string|null>, weights?: typeof SCORE_WEIGHTS}} ctx
 */
export function scorePair(a, b, ctx) {
  const weights = ctx.weights || SCORE_WEIGHTS;
  const nameJaccard = weightedColumnJaccard(a, b, ctx.columnTypeMaps, ctx.df);
  const nameOverlap = weightedColumnOverlap(a, b, ctx.columnTypeMaps, ctx.df);
  const nameSim = Math.max(nameJaccard, weights.overlapFactor * nameOverlap);
  const cSim = commentSimilarity(a, b, ctx.commentByTable);
  const nameTokenSim = tableNameOverlap(a, b);
  const mentions = commentMentionsOther(a, b, ctx.commentByTable);
  const blended = weights.name * nameSim + weights.comment * cSim + weights.tableName * nameTokenSim;
  const score = Math.max(blended, weights.mention * (mentions ? 1 : 0));
  return {
    score,
    columnNameSimilarity: nameSim,
    commentSimilarity: cSim,
    tableNameSimilarity: nameTokenSim,
    commentMentionsOther: mentions,
    sharedColumns: sharedSignificantColumns(a, b, ctx.columnTypeMaps, ctx.df),
  };
}

/**
 * Every candidate duplicate/parallel-table pair whose score clears CANDIDATE_THRESHOLD, sorted
 * descending. `columns` carries type info (see buildColumnTypeMaps); `tables` carries comments.
 * @param {{columns: Array<{table:string,column:string,udtName?:string,dataType?:string}>, tables: Array<{table:string,comment:string|null}>, allowlist?: Record<string,{reason:string}>, threshold?: number, weights?: typeof SCORE_WEIGHTS}} args
 */
export function findCandidatePairs({ columns, tables, allowlist = {}, threshold = CANDIDATE_THRESHOLD, weights = SCORE_WEIGHTS }) {
  const columnTypeMaps = buildColumnTypeMaps(columns);
  const df = columnDocFrequency(columnTypeMaps);
  const commentByTable = new Map(tables.map((t) => [t.table, t.comment]));
  const ctx = { columnTypeMaps, df, commentByTable, weights };
  const tableNames = [...columnTypeMaps.keys()].sort();
  const out = [];
  for (let i = 0; i < tableNames.length; i++) {
    for (let j = i + 1; j < tableNames.length; j++) {
      const a = tableNames[i], b = tableNames[j];
      const pairKey = [a, b].sort().join('|');
      if (Object.prototype.hasOwnProperty.call(allowlist, pairKey)) continue;
      const evidence = scorePair(a, b, ctx);
      if (evidence.score >= threshold) out.push({ a, b, ...evidence });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/** Stale allowlist entries: a pair no longer both live, or a pair whose current score has fallen below
 * the candidate threshold (the tables diverged since the entry was written; informational, a
 * below-threshold pair was never going to be flagged anyway, so this is a debt-cleanup hint, not a
 * failure). Mirrors schema-drift.mjs's stale-allowlist pattern. */
export function staleAllowlistEntries({ columns, tables, allowlist, threshold = CANDIDATE_THRESHOLD, weights = SCORE_WEIGHTS }) {
  const columnTypeMaps = buildColumnTypeMaps(columns);
  const df = columnDocFrequency(columnTypeMaps);
  const commentByTable = new Map(tables.map((t) => [t.table, t.comment]));
  const ctx = { columnTypeMaps, df, commentByTable, weights };
  const stale = [];
  for (const key of Object.keys(allowlist)) {
    const [a, b] = key.split('|');
    if (!columnTypeMaps.has(a) || !columnTypeMaps.has(b)) {
      stale.push({ key, reason: 'allowlisted pair but one or both tables no longer live, remove the entry' });
      continue;
    }
    const evidence = scorePair(a, b, ctx);
    if (evidence.score < threshold) {
      stale.push({ key, reason: `allowlisted pair no longer meets the candidate threshold (score=${evidence.score.toFixed(3)}), the tables diverged; review whether the exemption is still needed` });
    }
  }
  return stale;
}
