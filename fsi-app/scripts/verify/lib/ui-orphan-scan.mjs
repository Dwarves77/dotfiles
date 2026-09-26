// @ts-check
// UI-ORPHAN pure core (lane TOOL-GAP-3, 2026-09-25, closing audit coverage gap 5: "unwired UI parts, // component/route renders a field with no producer anywhere"). GOVERNING: remediation-discipline
// (sweep-before-claim) + docs/plans/data-machine-tool-gaps-2026-09-25.md build order step 3, "UI-side
// orphan checker ... extends F14/F50 patterns". F14 (.discipline/governance/producer-consumer-orphan.mjs)
// is TABLE-grain and answers "does anything read this table"; this module is FIELD-grain and answers "does
// anything WRITE this specific column that a UI-facing read selects", the concrete case named by audit
// findings RW-2/UI-3 is `state_cost_facts`: a table with real readers (an API route, a server-data
// function) and precisely zero writers of any kind, anywhere.
//
// PURE, no fs, no DB, the runner (ui-orphan-audit.mjs) supplies the live schema catalog and the code
// corpus text; this module never touches the filesystem or the network.
//
// METHOD.
//  1. UI-facing reads: parse `.select("...")` calls found in UI-facing files (API routes, the server-data
//     layer, components) into (table, column) pairs, reusing the same top-level-comma / embedded-resource
//     parsing shape producer-consumer-orphan.mjs already established for SELECT_STRING_RE/EMBED_CHILD_RE,
//     but at FIELD grain (each top-level select-list entry) rather than just the embed-child table name.
//  2. Writers, at COLUMN grain: for every `.insert(...)`/`.update(...)`/`.upsert(...)` call and the guarded-
//     write helpers (guardedInsert/guardedInsertMany/guardedUpdate/insertFn, same distinctive names F14
//     already recognizes), extract the top-level KEYS of the object literal argument (or, for an array-of-
//     objects insertMany call, the first element's keys, a representative sample, not every row). For SQL
//     (migrations, functions), extract the column list of `INSERT INTO table (col, col, ...)` and the SET-
//     clause column names of `UPDATE table SET col = ..., col = ...`.
//  3. RPC calls: `.rpc("fn_name", ...)` resolves to the underlying columns its own migration-defined
//     function body writes (same INSERT/UPDATE column extraction applied to the function's CREATE FUNCTION
//     body text), a coarse, whole-function-body join (no statement-level tracing), consistent with F14's
//     own RPC granularity ("rpcReads ... coarse (whole-file scope)").
//  4. A (table, column) pair is an ORPHAN when: it is UI-selected, it is in scope (not PK/FK/generated/
//     timestamp, reuse dead-column-scan.mjs's scopedColumns, same exclusion reasoning: those columns are
//     "used" by a join/default/clock, not a literal write-site identifier), and its key never appears in the
//     writer-column set from ANY source (code object-literal keys, guarded-write keys, SQL INSERT/UPDATE
//     column lists, or via a joined RPC body), and it is not allowlisted.

/**
 * Parse one `.select("...")` string body into top-level PostgREST select-list entries: bare columns,
 * `alias:column` (alias dropped, `column` kept), and `embed_table ( nested... )` embeds (recursed one
 * level so nested field lists are captured too, matching PostgREST's own one-hop-embed shape in practice
 * for this codebase's selects). Splits only on commas at paren-depth 0 so a nested embed's own commas do
 * not fragment the parent list.
 * @param {string} selectBody the raw string between the select("...") quotes
 * @returns {Array<{ column: string, embedTable?: string }>}
 */
export function parseSelectList(selectBody) {
  const text = String(selectBody ?? '');
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0 ? true : i === text.length) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  const out = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const embedMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*)\)\s*$/);
    if (embedMatch) {
      out.push({ column: embedMatch[1], embedTable: embedMatch[1] });
      for (const nested of parseSelectList(embedMatch[2])) out.push(nested);
      continue;
    }
    // strip a leading "!fk_hint" or "alias:" prefix, and a trailing "::cast" / "(agg)" wrapper, keep the
    // bare identifier, a conservative, low-false-negative parse (a miss just costs a missed pair, never a
    // false orphan, since a name we fail to parse also never enters the UI-selected set).
    const aliasStrip = part.includes(':') ? part.split(':').pop() : part;
    const bare = (aliasStrip ?? '').replace(/!\S+/, '').trim().match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (bare) out.push({ column: bare[0] });
  }
  return out;
}

const CODE_OP_RE = /\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)\s*\.(select)\(\s*['"`]([\s\S]*?)['"`]/g;
const RPC_CALL_RE = /\.rpc\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g;

/**
 * Extract every (table, column) pair a UI-facing file SELECTS, plus every RPC name it calls.
 * @param {Array<{file:string, content:string}>} uiFiles files scoped to API routes / server-data layer / components
 * @returns {{ selected: Array<{table:string, column:string, file:string}>, rpcCalls: Array<{name:string, file:string}> }}
 */
export function scanUiSelects(uiFiles) {
  const selected = [];
  const rpcCalls = [];
  for (const { file, content } of uiFiles) {
    CODE_OP_RE.lastIndex = 0;
    let m;
    while ((m = CODE_OP_RE.exec(content)) !== null) {
      const [, table, , body] = m;
      for (const { column } of parseSelectList(body)) selected.push({ table, column, file });
    }
    RPC_CALL_RE.lastIndex = 0;
    while ((m = RPC_CALL_RE.exec(content)) !== null) rpcCalls.push({ name: m[1], file });
  }
  return { selected, rpcCalls };
}

// Balanced-brace extraction of the object literal immediately following a call's opening paren, same
// balanced-delimiter technique dead-column-scan.mjs's stripCreatingDdl uses for balanced parens.
function extractBalanced(text, openIdx, openCh, closeCh) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === openCh) depth++;
    else if (text[i] === closeCh) { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return null;
}

/** Top-level keys of one object-literal source fragment (`{ a: 1, b: two, "c-d": 3 }` → ["a","b","c-d"]). */
function objectLiteralKeys(fragment) {
  if (!fragment) return [];
  const inner = fragment.slice(1, -1); // strip outer { }
  const keys = [];
  let depth = 0;
  let start = 0;
  const push = (raw) => {
    const km = raw.trim().match(/^(?:['"`]([^'"`]+)['"`]|(\.\.\.)|([a-zA-Z_][a-zA-Z0-9_]*))\s*:?/);
    if (km && !km[2]) keys.push(km[1] ?? km[3]);
  };
  for (let i = 0; i <= inner.length; i++) {
    const ch = inner[i];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    if ((ch === ',' && depth === 0) || i === inner.length) {
      push(inner.slice(start, i));
      start = i + 1;
    }
  }
  return keys.filter(Boolean);
}

const WRITE_CALL_RE = /\.(insert|upsert|update)\(\s*/g;
const GUARDED_WRITE_CALL_RE = /\b(?:guardedInsert|guardedInsertMany|guardedUpdate|insertFn)\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*,\s*/g;

/** True when the payload starting at `argStart` (already past any call-site whitespace the caller's regex
 * consumed) is an inline object literal: `{...}` directly, or `[{...}` (an array literal whose first
 * element is an object literal, the guardedInsertMany "rows" shape). Whitespace-skipping is exact (not a
 * character-distance heuristic), so a payload like `toWrite, { cite }`, a variable argument followed by a
 * LATER options-object argument, is correctly NOT mistaken for a literal payload just because a brace
 * happens to appear within a few characters. */
function isLiteralPayloadAt(text, argStart) {
  let i = argStart;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] === '{') return { literal: true, braceIdx: i };
  if (text[i] === '[') {
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    if (text[j] === '{') return { literal: true, braceIdx: j };
  }
  return { literal: false, braceIdx: -1 };
}

/**
 * Extract (table, column) write pairs from CODE (app/scripts/functions) text: `.from("T").insert({...})` /
 * `.update({...})` / `.upsert({...})`, and the guarded-write helpers with an explicit table-name first
 * argument. Table for a bare `.insert/.update/.upsert(` is resolved from the nearest preceding
 * `.from("T")` on the same statement (scanned backward from the call site, bounded to 200 chars, a
 * pragmatic window matching this codebase's supabase-js call style of `.from(T).op(obj)` on one
 * statement). Best-effort: a call this misses costs a missed writer-column pair (conservative, the
 * failure mode to avoid is a false ORPHAN from an under-counted writer set, so this errs toward finding
 * MORE writer columns, not fewer, matching dead-column-scan.mjs's own "bare-token match is evidence of use"
 * conservatism).
 * @param {string} content
 * @returns {Array<{table:string, column:string}>}
 */
export function extractCodeWriteColumns(content) {
  const out = [];
  const text = String(content ?? '');

  WRITE_CALL_RE.lastIndex = 0;
  let m;
  while ((m = WRITE_CALL_RE.exec(text)) !== null) {
    const argStart = m.index + m[0].length;
    const { literal, braceIdx } = isLiteralPayloadAt(text, argStart);
    if (!literal) continue;
    const objFrag = extractBalanced(text, braceIdx, '{', '}');
    if (!objFrag) continue;
    const preceding = text.slice(Math.max(0, m.index - 200), m.index);
    const fromMatch = [...preceding.matchAll(/\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/g)].pop();
    if (!fromMatch) continue;
    const table = fromMatch[1];
    for (const key of objectLiteralKeys(objFrag)) out.push({ table, column: key });
  }

  GUARDED_WRITE_CALL_RE.lastIndex = 0;
  while ((m = GUARDED_WRITE_CALL_RE.exec(text)) !== null) {
    const table = m[1];
    const argStart = m.index + m[0].length;
    const { literal, braceIdx } = isLiteralPayloadAt(text, argStart);
    if (!literal) continue;
    const objFrag = extractBalanced(text, braceIdx, '{', '}');
    if (!objFrag) continue;
    for (const key of objectLiteralKeys(objFrag)) out.push({ table, column: key });
  }

  return out;
}

/**
 * Extract tables whose write call passes an OPAQUE payload (a variable/expression, not an inline object
 * literal), `.from("T").insert(rows)`, `guardedInsertMany("T", toWrite, {...})`. These are real writers
 * whose specific columns this parser cannot resolve (the row shape lives in a helper function elsewhere,
 * e.g. scripts/gen/emission-factors-common.mjs's `buildRow()`). A table with an opaque write must NEVER be
 * treated as column-write-orphan for ANY of its columns, the alternative (claiming a specific column has
 * "zero writers" when we simply failed to trace an opaque call) is exactly the high-false-positive failure
 * mode F14's own header names for field-level analysis ("parsing insert/update object keys is
 * high-false-positive"). Conservative by construction: an opaque write suppresses ALL columns of that
 * table, not just the ones the helper happens to set, trading a possible missed finding for zero false
 * positives from this specific gap.
 * @param {string} content
 * @returns {Set<string>} table names
 */
export function extractOpaqueWriteTables(content) {
  const tables = new Set();
  const text = String(content ?? '');

  WRITE_CALL_RE.lastIndex = 0;
  let m;
  while ((m = WRITE_CALL_RE.exec(text)) !== null) {
    const argStart = m.index + m[0].length;
    const { literal } = isLiteralPayloadAt(text, argStart);
    if (literal) continue;
    const preceding = text.slice(Math.max(0, m.index - 200), m.index);
    const fromMatch = [...preceding.matchAll(/\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/g)].pop();
    if (fromMatch) tables.add(fromMatch[1]);
  }

  GUARDED_WRITE_CALL_RE.lastIndex = 0;
  while ((m = GUARDED_WRITE_CALL_RE.exec(text)) !== null) {
    const table = m[1];
    const argStart = m.index + m[0].length;
    const { literal } = isLiteralPayloadAt(text, argStart);
    if (!literal) tables.add(table);
  }

  return tables;
}

const SQL_INSERT_RE = /\bINSERT\s+INTO\s+(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?\s*\(([^)]*)\)/gi;
const SQL_UPDATE_RE = /\bUPDATE\s+(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?\s+SET\s+([\s\S]*?)(?:\bWHERE\b|;|$)/gi;

/**
 * Extract (table, column) write pairs from SQL text (migrations, function bodies): the column list of
 * `INSERT INTO table (col, col)` and the assigned-to columns of `UPDATE table SET col = ..., col = ...`.
 * @param {string} sql
 * @returns {Array<{table:string, column:string}>}
 */
export function extractSqlWriteColumns(sql) {
  const out = [];
  const text = String(sql ?? '');

  SQL_INSERT_RE.lastIndex = 0;
  let m;
  while ((m = SQL_INSERT_RE.exec(text)) !== null) {
    const table = m[1].toLowerCase();
    for (const col of m[2].split(',')) {
      const c = col.trim().replace(/^"|"$/g, '');
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c)) out.push({ table, column: c.toLowerCase() });
    }
  }

  SQL_UPDATE_RE.lastIndex = 0;
  while ((m = SQL_UPDATE_RE.exec(text)) !== null) {
    const table = m[1].toLowerCase();
    for (const assign of m[2].split(',')) {
      const colMatch = assign.trim().match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*=/);
      if (colMatch) out.push({ table, column: colMatch[1].toLowerCase() });
    }
  }

  return out;
}

/**
 * Extract every named SQL function's body text, keyed by lowercased function name, from migration corpus
 * text, used to join an `.rpc("fn")` call to the columns that function's own body writes (coarse,
 * whole-body join, matching F14's own RPC granularity note).
 * @param {string} sql
 * @returns {Map<string, string>}
 */
export function extractFunctionBodies(sql) {
  const text = String(sql ?? '');
  const bodies = new Map();
  const re = /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    // find the function body between the first "AS $$"/"AS $tag$" and its matching close, best-effort.
    const asIdx = text.indexOf('AS', re.lastIndex) === -1 ? -1 : text.indexOf('AS', re.lastIndex);
    if (asIdx === -1) continue;
    const tagMatch = text.slice(asIdx, asIdx + 40).match(/AS\s+(\$[a-zA-Z_]*\$)/);
    if (!tagMatch) continue;
    const tag = tagMatch[1];
    const bodyStart = asIdx + tagMatch[0].length;
    const bodyEnd = text.indexOf(tag, bodyStart);
    if (bodyEnd === -1) continue;
    bodies.set(name, (bodies.get(name) ?? '') + text.slice(bodyStart, bodyEnd));
  }
  return bodies;
}

/**
 * The UI-orphan decision: a UI-selected (table, column) pair, in scope, is an orphan when its key never
 * appears in the writer-column set built from code + SQL + RPC-joined function bodies, and is not
 * allowlisted.
 * @param {{
 *   uiSelected: Array<{table:string, column:string, file:string}>,
 *   rpcCalls: Array<{name:string, file:string}>,
 *   writerColumns: Set<string>,
 *   opaqueWriteTables?: Set<string>,
 *   rpcFunctionBodies: Map<string, string>,
 *   scopedKeys: Set<string>,
 *   allowlist?: Record<string, {reason:string}>,
 * }} args
 * @returns {Array<{table:string, column:string, file:string, evidence:string}>}
 */
export function findUiOrphanFields({ uiSelected, rpcCalls, writerColumns, opaqueWriteTables = new Set(), rpcFunctionBodies, scopedKeys, allowlist = {} }) {
  // fold in any columns an RPC body writes, for tables the RPC's own body targets.
  const combined = new Set(writerColumns);
  for (const { name } of rpcCalls) {
    const body = rpcFunctionBodies.get(name);
    if (!body) continue;
    for (const wc of extractSqlWriteColumns(body)) combined.add(`${wc.table}.${wc.column}`);
  }

  const seen = new Set();
  const out = [];
  for (const { table, column, file } of uiSelected) {
    const key = `${table}.${column}`;
    if (seen.has(key)) continue; // report each orphan pair once, not once per selecting file
    if (!scopedKeys.has(key)) continue; // out of scope (PK/FK/generated/timestamp, or not a real column)
    if (Object.prototype.hasOwnProperty.call(allowlist, key)) continue;
    if (combined.has(key)) continue;
    // an OPAQUE write (a real `.insert`/guarded-write call whose row payload is a variable this parser
    // cannot trace into a helper function) suppresses every column of that table, see
    // extractOpaqueWriteTables's own header for why this trades a possible missed finding for avoiding the
    // high-false-positive failure mode field-grain analysis is known to have (F14's own caveat).
    if (opaqueWriteTables.has(table)) continue;
    seen.add(key);
    out.push({
      table,
      column,
      file,
      evidence: `UI-selected at ${file}; 0 writers of "${table}.${column}" across code object-literal keys, guarded-write keys, SQL INSERT/UPDATE, or joined RPC bodies`,
    });
  }
  return out;
}

/** Stale allowlist entries: a key no longer in scope, or a key that now DOES have a writer. */
export function staleUiOrphanAllowlistEntries({ scopedKeys, writerColumns, allowlist }) {
  const stale = [];
  for (const key of Object.keys(allowlist)) {
    if (!scopedKeys.has(key)) {
      stale.push({ key, reason: 'allowlisted but no longer an in-scope column' });
    } else if (writerColumns.has(key)) {
      stale.push({ key, reason: 'allowlisted but now has a writer, remove the entry' });
    }
  }
  return stale;
}
