// @ts-check
// DEAD-COLUMN pure core (lane TOOL-GAP-2, 2026-09-25, closing audit finding DEAD-1). GOVERNING SKILL:
// remediation-discipline (section 4, sweep-before-claim; the column-grain sibling of F14's table-grain orphan
// check). PURE, no DB, no fs; the runner (dead-column-audit.mjs) supplies the live column catalog and
// the code corpus text. This module never touches the filesystem or the network.
//
// DEFINITION (the audit's own words): "a column is dead if no code path writes it AND none reads it".
// Mechanically: enumerate every column, strip each column's OWN creating DDL out of the migration corpus
// (so a column is not "used" merely by the CREATE TABLE / ADD COLUMN statement that introduced it), then
// check whether the column's bare identifier appears anywhere in the remaining corpus (src/, scripts/,
// supabase/functions, and migrations' views/functions/other statements). Zero hits = dead.
//
// SCOPE EXCLUSIONS (the audit's own scoping, "net of PK/FK/timestamp/generated columns"): primary-key
// columns, foreign-key columns, generated/identity columns, and timestamp-typed columns are excluded from
// the dead-column population before the grep check, these are structural columns whose "use" is a FK
// join, a default clock, or a generated expression, not a literal source-code identifier, so a bare-token
// grep is the wrong instrument for them and would produce noise, not signal.

/** True when `dataType`/`udtName` looks like a timestamp type (created_at/updated_at-shaped columns). */
export function isTimestampType(dataType, udtName) {
  const t = `${dataType ?? ''} ${udtName ?? ''}`.toLowerCase();
  return t.includes('timestamp') || t.includes('date') || udtName === 'timestamptz';
}

/**
 * Which columns are IN SCOPE for the dead-column check (excludes PK, FK, generated, timestamp-typed).
 * @param {Array<{table:string, column:string, dataType:string, udtName:string, isGenerated?:boolean}>} columns
 * @param {Set<string>} primaryKeyColumns "table.column" set
 * @param {Array<{table:string, column:string}>} foreignKeys referencing (table, column) edges
 * @returns {Array<{table:string, column:string}>}
 */
export function scopedColumns(columns, primaryKeyColumns, foreignKeys) {
  const fkCols = new Set(foreignKeys.map((f) => `${f.table}.${f.column}`));
  return columns
    .filter((c) => {
      const key = `${c.table}.${c.column}`;
      if (primaryKeyColumns.has(key)) return false;
      if (fkCols.has(key)) return false;
      if (c.isGenerated) return false;
      if (isTimestampType(c.dataType, c.udtName)) return false;
      return true;
    })
    .map((c) => ({ table: c.table, column: c.column }));
}

/**
 * Strip each CREATE TABLE (...) column-definition block and each `ADD COLUMN <name> ...` clause out of a
 * migration SQL text, so a column's own creating DDL never counts as a "use" of that column. Views,
 * functions, triggers, indexes, comments and every OTHER statement are left intact, those are exactly the
 * "reads" the audit wants to keep.
 * @param {string} sql
 * @returns {string}
 */
export function stripCreatingDdl(sql) {
  let text = String(sql ?? '');
  // CREATE [UNLOGGED] TABLE [IF NOT EXISTS] [public.]name ( ... ), blank the balanced-paren column list.
  const createRe = /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\s*\.\s*)?"?[a-zA-Z_][a-zA-Z0-9_$]*"?\s*\(/gi;
  let m;
  while ((m = createRe.exec(text)) !== null) {
    const openIdx = text.indexOf('(', m.index + m[0].length - 1);
    if (openIdx === -1) continue;
    let depth = 0, end = -1;
    for (let i = openIdx; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) continue;
    const blanked = text.slice(openIdx, end + 1).replace(/[^\n]/g, ' ');
    text = text.slice(0, openIdx) + blanked + text.slice(end + 1);
    createRe.lastIndex = end + 1;
  }
  // ALTER TABLE ... ADD COLUMN [IF NOT EXISTS] name ... (up to the next comma-at-depth-0 or statement end).
  text = text.replace(/\badd\s+column\s+(?:if\s+not\s+exists\s+)?"?[a-zA-Z_][a-zA-Z0-9_$]*"?[^,;]*/gi, (frag) =>
    frag.replace(/[^\n]/g, ' '),
  );
  return text;
}

/** Extract every bare identifier-shaped token from a corpus of file contents into one Set. Pure, no I/O:
 * the caller reads files and passes their text in. Deliberately over-inclusive (matches inside strings and
 * comments too), a bare-token match is treated as conservative evidence of USE, since the failure mode we
 * must avoid is flagging a column as dead when it is actually referenced (a false "dead" costs a wrongly
 * dropped column; a false "alive" costs nothing but a skipped finding).
 * @param {Iterable<string>} fileContents
 * @returns {Set<string>}
 */
export function buildTokenSet(fileContents) {
  const tokens = new Set();
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  for (const content of fileContents) {
    const text = String(content ?? '');
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) tokens.add(m[0]);
  }
  return tokens;
}

/**
 * The dead-column decision: a scoped column is dead when its bare column-name token does not appear
 * anywhere in the token set built from the corpus (src/, scripts/, supabase/functions, and the
 * DDL-stripped migrations text), and it is not allowlisted.
 * @param {{columns: Array<{table:string, column:string}>, tokenSet: Set<string>, allowlist?: Record<string, {reason:string}>}} args
 * @returns {Array<{table:string, column:string, evidence:string}>}
 */
export function findDeadColumns({ columns, tokenSet, allowlist = {} }) {
  const dead = [];
  for (const { table, column } of columns) {
    const key = `${table}.${column}`;
    if (Object.prototype.hasOwnProperty.call(allowlist, key)) continue;
    if (tokenSet.has(column)) continue;
    dead.push({
      table,
      column,
      evidence: `0 occurrences of bare identifier "${column}" across src/, scripts/, supabase/functions, and migrations' non-DDL text`,
    });
  }
  return dead;
}

/** Allowlist entries that no longer correspond to an in-scope column (stale, the column was dropped, or
 * a later migration removed it from scope some other way). Mirrors schema-drift.mjs's own stale-allowlist
 * pattern: an allowlist is itself audited so it cannot silently outlive its reason.
 * @param {{scopedKeys: Set<string>, allowlist: Record<string, {reason:string}>}} args
 */
export function staleAllowlistEntries({ scopedKeys, allowlist }) {
  const stale = [];
  for (const key of Object.keys(allowlist)) {
    if (!scopedKeys.has(key)) stale.push({ key, reason: 'allowlisted but no longer an in-scope column (dropped, or now excluded by PK/FK/generated/timestamp scoping), remove the entry' });
  }
  return stale;
}
