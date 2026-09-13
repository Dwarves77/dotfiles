// @ts-check
// PURE core for D7 (docs/plans/defect-fix-plan-2026-09-12.md): a tracked inventory of the vocabulary
// every list-valued CHECK constraint declares, so a writer that uses a value the database refuses fails
// a unit test before it fails in production (the D2 class fix: provisional_sources_status_check rejected
// "promoted" because nothing checked the vocabulary a writer used against the vocabulary the database
// accepted).
//
// Two callers, one parser:
//   - schema-vocabulary-inventory.mjs (LIVE): feeds this module each `{ tbl, conname, def }` row from
//     `pg_get_constraintdef(oid)`, already filtered live-side to `def ~ 'ANY \(ARRAY'` (Postgres always
//     normalizes a source-level `col IN (...)` into `col = ANY (ARRAY[...])` when it reconstructs a
//     constraint definition from the catalog, so this ALSO covers every IN-authored constraint).
//   - the seed run (below, buildVocabularyFromMigrationSources): scans supabase/migrations/*.sql text
//     directly, where a constraint is still written as authored (`CHECK (col IN (...))` in every case
//     found in this repo at authoring time; `= ANY (ARRAY[...])` is supported too, source-authored or
//     not, since the parser core is shape-agnostic).
//
// NEVER GUESSED: a definition whose column or allowed-set cannot be determined is recorded with
// `allowed: null` and `unparsed: <def>`, never a partially-guessed vocabulary.

// ---------------------------------------------------------------------------------------------------
// 1. The core value parser, pure text in, structured data out. No I/O.
// ---------------------------------------------------------------------------------------------------

const ANY_ARRAY_RE = /"?([A-Za-z_][A-Za-z0-9_]*)"?\s*=\s*ANY\s*\(\s*ARRAY\s*\[([\s\S]*?)\]\s*(?:::\s*[A-Za-z_][A-Za-z0-9_]*(?:\[\])?)?\s*\)/gi;
const IN_LIST_RE = /"?([A-Za-z_][A-Za-z0-9_]*)"?\s*IN\s*\(([\s\S]*?)\)/gi;
const QUOTED_VALUE_RE = /'((?:[^']|'')*)'/g;

/** Extract every single-quoted SQL string literal from `text`, unescaping doubled quotes ('' -> '). */
export function extractQuotedValues(text) {
  const out = [];
  const re = new RegExp(QUOTED_VALUE_RE);
  let m;
  while ((m = re.exec(String(text ?? ''))) !== null) {
    out.push(m[1].replace(/''/g, "'"));
  }
  return out;
}

/**
 * Parse ONE constraint definition (either a live `pg_get_constraintdef(oid)` string, e.g.
 * `CHECK ((status = ANY (ARRAY['pending_review'::text, 'confirmed'::text])))`, or a migration-authored
 * check clause, e.g. `CHECK (status IN ('pending_review', 'confirmed'))`) into its column and allowed
 * value set. Handles both the `= ANY (ARRAY[...])` and `IN (...)` shapes; ambiguous input (more than one
 * candidate match of either shape) or input with neither shape returns nulls rather than guessing which
 * one governs.
 * @param {string} def
 * @returns {{ column: string|null, allowed: string[]|null }}
 */
export function parseCheckConstraintDef(def) {
  const text = String(def ?? '');

  const anyMatches = [...text.matchAll(new RegExp(ANY_ARRAY_RE))];
  if (anyMatches.length === 1) {
    const [, column, arrayBody] = anyMatches[0];
    const allowed = extractQuotedValues(arrayBody);
    if (allowed.length > 0) return { column, allowed };
  }

  if (anyMatches.length === 0) {
    const inMatches = [...text.matchAll(new RegExp(IN_LIST_RE))];
    if (inMatches.length === 1) {
      const [, column, listBody] = inMatches[0];
      const allowed = extractQuotedValues(listBody);
      if (allowed.length > 0) return { column, allowed };
    }
  }

  return { column: null, allowed: null };
}

/** True if `checkText` superficially carries one of the two list-valued shapes this module tracks
 *  (`= ANY (ARRAY[...])` or `IN (...)`). A BETWEEN / IS NULL / numeric-comparison CHECK is neither, and
 *  is never even a candidate, the same scope the live query's own `~ 'ANY \(ARRAY'` filter draws. */
export function looksListValued(checkText) {
  const text = String(checkText ?? '');
  return /=\s*any\s*\(\s*array/i.test(text) || /\bin\s*\(/i.test(text);
}

/** Strip a "public." (or any single-segment) schema qualifier and surrounding quotes from a table name,
 *  so a migration-sourced "public.user_watchlist" and a live conrelid::regclass "user_watchlist" (public
 *  is normally on the default search_path and renders unqualified) land on the same bare name. */
export function normalizeTableName(name) {
  const s = String(name ?? '').replace(/^"|"$/g, '');
  const dot = s.lastIndexOf('.');
  return dot === -1 ? s : s.slice(dot + 1).replace(/^"|"$/g, '');
}

/**
 * Build one inventory entry from a live catalog row. `def` is the raw `pg_get_constraintdef(oid)` text.
 * @param {{ tbl: string, conname: string, def: string }} row
 */
export function buildLiveInventoryEntry({ tbl, conname, def }) {
  const parsed = parseCheckConstraintDef(def);
  if (parsed.column && parsed.allowed && parsed.allowed.length > 0) {
    return { table: normalizeTableName(tbl), column: parsed.column, constraint: conname, allowed: parsed.allowed };
  }
  return { table: normalizeTableName(tbl), column: parsed.column ?? null, constraint: conname, allowed: null, unparsed: String(def ?? '') };
}

// ---------------------------------------------------------------------------------------------------
// 2. Migration-source scanning, extracts the SAME kind of entries from supabase/migrations/*.sql text,
//    for the offline seed run (no DB creds available in this worktree). Pure (string in, data out); the
//    caller (schema-vocabulary-inventory.mjs, or a seed script) supplies file contents already read.
// ---------------------------------------------------------------------------------------------------

/** Strip `-- ...` line comments and `/* ... *\/` block comments. Best-effort (not a full SQL tokenizer):
 *  does not special-case a comment marker occurring inside a quoted string literal, not observed in
 *  this repo's migrations at authoring time (spot-checked); a genuine future occurrence would need this
 *  widened, not silently mis-parsed, since it would show up as an `unparsed` entry rather than a wrong one. */
export function stripSqlComments(sql) {
  let text = String(sql ?? '');
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  text = text.replace(/--[^\n]*/g, '');
  return text;
}

/** Scan forward from `openIdx` (which must be the index of an opening '(') for its matching ')',
 *  skipping over single-quoted string literals ('' is an escaped quote inside one) so a paren inside a
 *  literal never unbalances the count. Returns -1 on malformed/unbalanced input. */
export function findMatchingParen(text, openIdx) {
  if (text[openIdx] !== '(') throw new Error('findMatchingParen: expected "(" at openIdx');
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") {
      i++;
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") { i += 2; continue; }
        if (text[i] === "'") break;
        i++;
      }
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const CREATE_TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(?:[A-Za-z_][A-Za-z0-9_]*\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/gi;

/** Find every `CREATE TABLE ... ( ... )` region in `sql`, returning the table name and the body text
 *  between the (balanced) outer parens, plus the body's absolute start offset in `sql`. */
export function extractCreateTableRegions(sql) {
  const regions = [];
  const re = new RegExp(CREATE_TABLE_RE);
  let m;
  while ((m = re.exec(sql)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findMatchingParen(sql, openIdx);
    if (closeIdx === -1) { re.lastIndex = m.index + m[0].length; continue; }
    regions.push({ table: m[1], bodyStart: openIdx + 1, bodyEnd: closeIdx, body: sql.slice(openIdx + 1, closeIdx) });
    re.lastIndex = closeIdx + 1;
  }
  return regions;
}

const CHECK_RE = /\bCHECK\s*\(/gi;
const CONSTRAINT_NAME_BEFORE_RE = /CONSTRAINT\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s*$/i;

/** Find every `CHECK ( ... )` clause inside one CREATE-TABLE body (column-level or table-level), each
 *  with its region-relative offset, an explicit `CONSTRAINT <name>` if one immediately precedes it
 *  (searched back to the previous top-level comma), and the full "CHECK (...)" text. */
export function extractChecksFromRegion(body) {
  const out = [];
  const re = new RegExp(CHECK_RE);
  let m;
  while ((m = re.exec(body)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findMatchingParen(body, openIdx);
    if (closeIdx === -1) { re.lastIndex = m.index + m[0].length; continue; }
    const checkText = body.slice(m.index, closeIdx + 1);
    const precedingStart = Math.max(body.lastIndexOf(',', m.index), 0);
    const preceding = body.slice(precedingStart, m.index);
    const cm = preceding.match(CONSTRAINT_NAME_BEFORE_RE);
    out.push({ offset: m.index, explicitName: cm ? cm[1] : null, checkText });
    re.lastIndex = closeIdx + 1;
  }
  return out;
}

const ALTER_ADD_HEAD_RE = /ALTER\s+TABLE\s+(?:ONLY\s+)?"?(?:[A-Za-z_][A-Za-z0-9_]*\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s+ADD\s+CONSTRAINT\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+/gi;
const CHECK_IMMEDIATE_RE = /^\s*CHECK\s*\(/i;
const ALTER_DROP_RE = /ALTER\s+TABLE\s+(?:ONLY\s+)?"?(?:[A-Za-z_][A-Za-z0-9_]*\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;

/**
 * Every CHECK-constraint-affecting statement in `sql` (comment-stripped), in file order:
 *   - a CREATE-TABLE-embedded CHECK ({ kind: 'define', table, explicitName, checkText, offset })
 *   - an `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` (same shape)
 *   - an `ALTER TABLE ... DROP CONSTRAINT ...` ({ kind: 'drop', table, explicitName, offset })
 * `explicitName` is null only for an anonymous CREATE-TABLE-embedded CHECK (the caller synthesizes the
 * Postgres default name, `<table>_<column>_check`, once the column is known).
 */
export function extractCheckConstraintCandidates(sql) {
  const candidates = [];

  for (const region of extractCreateTableRegions(sql)) {
    for (const c of extractChecksFromRegion(region.body)) {
      candidates.push({
        offset: region.bodyStart + c.offset,
        kind: 'define',
        table: region.table,
        explicitName: c.explicitName,
        checkText: c.checkText,
      });
    }
  }

  const headRe = new RegExp(ALTER_ADD_HEAD_RE);
  let hm;
  while ((hm = headRe.exec(sql)) !== null) {
    const tail = sql.slice(headRe.lastIndex);
    const cm = tail.match(CHECK_IMMEDIATE_RE);
    if (cm) {
      const checkKeywordIdx = headRe.lastIndex + cm[0].toUpperCase().indexOf('CHECK');
      const openIdx = headRe.lastIndex + cm[0].length - 1;
      const closeIdx = findMatchingParen(sql, openIdx);
      if (closeIdx !== -1) {
        candidates.push({
          offset: hm.index,
          kind: 'define',
          table: hm[1],
          explicitName: hm[2],
          checkText: sql.slice(checkKeywordIdx, closeIdx + 1),
        });
      }
    }
  }

  const dropRe = new RegExp(ALTER_DROP_RE);
  let dm;
  while ((dm = dropRe.exec(sql)) !== null) {
    candidates.push({ offset: dm.index, kind: 'drop', table: dm[1], explicitName: dm[2] });
  }

  candidates.sort((a, b) => a.offset - b.offset);
  return candidates;
}

function applyCandidate(map, candidate) {
  if (candidate.kind === 'drop') {
    map.delete(candidate.explicitName);
    return;
  }
  const { table, explicitName, checkText } = candidate;
  if (!looksListValued(checkText)) return; // BETWEEN / IS NULL / etc: out of this module's scope

  const parsed = parseCheckConstraintDef(checkText);
  const constraintName = explicitName || (parsed.column ? `${normalizeTableName(table)}_${parsed.column}_check` : null);
  if (!constraintName) return; // no explicit name and no column to synthesize one from: nothing sane to key on

  if (parsed.column && parsed.allowed && parsed.allowed.length > 0) {
    map.set(constraintName, { table: normalizeTableName(table), column: parsed.column, constraint: constraintName, allowed: parsed.allowed });
  } else {
    map.set(constraintName, { table: normalizeTableName(table), column: parsed.column ?? null, constraint: constraintName, allowed: null, unparsed: checkText });
  }
}

/**
 * Build the vocabulary inventory from migration source text alone (no DB). `files` is every migration's
 * `{ name, sql }`, in the order they should be applied (the repo's own numeric filename order, a later
 * file's ADD/DROP CONSTRAINT wins over an earlier file's definition of the SAME constraint name, and a
 * DROP with no later re-ADD removes the entry entirely).
 * @param {Array<{ name: string, sql: string }>} files
 */
export function buildVocabularyFromMigrationSources(files) {
  const map = new Map();
  for (const f of files) {
    const clean = stripSqlComments(f.sql);
    for (const candidate of extractCheckConstraintCandidates(clean)) {
      applyCandidate(map, candidate);
    }
  }
  return [...map.values()].sort((a, b) => (a.table === b.table ? a.constraint.localeCompare(b.constraint) : a.table.localeCompare(b.table)));
}
