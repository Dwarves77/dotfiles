// PAGINATION ORDER-KEY AUDIT (GATE-A-RESCAN, GitHub Actions run 36217491293, 2026-09-26; EXTENDED lane
// MAINTENANCE-HARNESS, 2026-09-28, PR #819 CI failure + coordinator ruling). GOVERNING SKILL:
// remediation-discipline (class over instance).
//
// WHAT BROKE, three times, the same class. (1) gate-a-rescan.mjs's readAllByIds("item_gate_a_state",
// ..., { idColumn: "intelligence_item_id" }) crashed every page with "column item_gate_a_state.id does
// not exist": readAllByIds handed readAll no `orderBy`, so readAll's own default (`orderBy = "id"`)
// applied regardless of idColumn -- item_gate_a_state (migration 224) has no "id" column, its PK is
// intelligence_item_id. (2) entity_refs (2026-09-12, composite PK, no "id" column at all). (3)
// harness_runs (2026-09-28, PR #819: plan-quarantine-disposition.mjs's own bare readAll("harness_runs",
// ...) with no orderBy crashed live with the identical message). #812 fixed instance 1 (readAllByIds
// defaults orderBy to idColumn). #819's own fix was a one-call-site patch. The CLASS fix (this lane):
// scripts/lib/db.mjs's readAll() no longer defaults to "id" AT ALL -- it looks up
// scripts/lib/table-primary-keys.mjs's TABLE_PRIMARY_KEY map (a committed, live-derived snapshot) and
// THROWS for any table absent from it, rather than silently guessing. This file is the CLASS CHECK: a
// static, no-DB, no-npm-dependency test that every readAllByIds/readAll call site in the tree resolves
// to an order column that (a) actually exists on that table, per the committed schema snapshot
// (scripts/verify/lib/fixtures/duplicate-table-schema-snapshot.json, lane TOOL-GAP-2/#809, refreshed
// this lane to include harness_runs), and (b) for a bare readAll() with no orderBy, is a table PRESENT
// in TABLE_PRIMARY_KEY -- a table absent from that map is now a HARD violation (readAll() throws for it
// at runtime), not a silent skip.
//
// SCOPE (honest). This is a regex-based static scan, not a type checker: it resolves ONLY literal
// call sites of the shape `readAllByIds("table", ..., { idColumn: "...", orderBy: "..." })` and
// `readAll("table", ..., { orderBy: "..." })` where the table name and any idColumn/orderBy option
// are STRING LITERALS. A call built from a variable (`readAllByIds(table, ...)`, `export async
// function fetchRowsIn(sb, table, ...)`'s own generic body) is UNRESOLVED -- reported, never silently
// dropped, never treated as a phantom (this class of unresolved call is NOT failed by this audit; it
// cannot be statically checked, and IS explicit at its own call site about needing a real orderBy since
// readAll() no longer has a bare default to fall back on). A table not present in the committed
// duplicate-table-schema-snapshot.json is skipped for the column-existence check (unknown to that
// snapshot, not asserted absent), but the TABLE_PRIMARY_KEY membership check is independent of that
// snapshot and always enforced for bare (no-orderBy) readAll() calls.
//
// Read-only (fs + static parse). No DB, no npm package outside node:*, no credentials required -- this
// runs in the ordinary no-npm discipline glob (run-test-suite.sh discovers every tracked *.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkFiles } from '../lib/walk-files.mjs';
import { TABLE_PRIMARY_KEY } from '../lib/table-primary-keys.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SNAPSHOT_PATH = resolve(ROOT, 'scripts/verify/lib/fixtures/duplicate-table-schema-snapshot.json');
const SCAN_DIRS = ['src', 'scripts'];
const CODE_EXT = new Set(['.ts', '.tsx', '.mjs', '.js']);
const SKIP_DIR = new Set(['node_modules', '.next', '_snapshots', 'tmp', 'dist', '.git']);

/** Parse the `{ ... }` options object literal starting at `openIdx` (the '{'). Bounded, balanced-brace,
 * best-effort -- mirrors column-existence-parity.mjs's own sliceObjectLiteral. */
function sliceObjectLiteral(text, openIdx) {
  let depth = 0;
  const end = Math.min(text.length, openIdx + 2000);
  for (let i = openIdx; i < end; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx, end);
}

/** Given `text` and the index of a call's OPENING '(' (right after the function name), return the
 * balanced-paren span of the WHOLE call's argument list (bounded to 4000 chars for safety) -- so the
 * options-object search below can never bleed past this call's own closing ')' into a LATER,
 * unrelated call (the original heuristic-window bug: a 1200-char window swallowed the next test's
 * options object when two calls sat close together, misattributing its orderBy/idColumn). */
function sliceBalancedParens(text, openIdx) {
  let depth = 0;
  const end = Math.min(text.length, openIdx + 4000);
  for (let i = openIdx; i < end; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx, end);
}

/** Extract a string-literal value for `key: "value"` (or 'value'/`value`) from an options-object body,
 * or null if the key is absent or its value is not a plain string literal (a variable, a template
 * expression, a spread) -- those are UNRESOLVED, never guessed at. */
function stringOption(body, key) {
  const re = new RegExp(`\\b${key}\\s*:\\s*(['"\`])([^'"\`]*)\\1`);
  const m = re.exec(body);
  return m ? m[2] : null;
}

/** Does the options body reference `key` at all (even with a non-literal value)? Used to tell "option
 * omitted" (safe to apply the known default) from "option present but unresolved" (skip, don't guess). */
function hasOption(body, key) {
  return new RegExp(`\\b${key}\\s*:`).test(body);
}

/**
 * Statically finds every literal-table readAllByIds/readAll call site and resolves the order column
 * each would use, given readAllByIds's own default (orderBy ?? idColumn ?? "id") and readAll's own
 * default since lane MAINTENANCE-HARNESS 2026-09-28 (orderBy ?? TABLE_PRIMARY_KEY[table], THROWS if
 * table absent from that map -- readAll() itself never guesses "id" anymore). A bare readAll() call on
 * a table not in TABLE_PRIMARY_KEY is therefore itself an audit VIOLATION (it will throw at runtime,
 * not silently misorder), reported via `unresolved` with a reason naming the exact throw.
 * Returns { resolved: [{file, table, orderCol, kind}], unresolved: [...] }.
 */
export function scanOrderKeyCallSites(files, readFile = (f) => readFileSync(f, 'utf8')) {
  const CALL_RE = /\breadAllByIds\(\s*(['"`])([a-zA-Z0-9_]+)\1\s*,|(?<!ds)\breadAll\(\s*(['"`])([a-zA-Z0-9_]+)\3\s*,/g;
  const resolved = [];
  const unresolved = [];

  for (const file of files) {
    let src;
    try { src = readFile(file); } catch { continue; }
    // Skip this audit's own defining/testing files and db.mjs's internal implementation -- those are
    // the DEFINITION of the defaults being checked, not a call site to verify against them. Also skip
    // this audit's OWN test file (its fixture strings are example source text, not real call sites,
    // and would otherwise self-match).
    if (file.endsWith('paginate.mjs') || file.endsWith('walk-files.mjs') || file.endsWith('pagination-order-key-audit.test.mjs')) continue;

    CALL_RE.lastIndex = 0;
    let m;
    while ((m = CALL_RE.exec(src)) !== null) {
      const isReadAllByIds = m[2] !== undefined;
      const table = isReadAllByIds ? m[2] : m[4];
      const kind = isReadAllByIds ? 'readAllByIds' : 'readAll';

      // The call's own opening '(' is the first '(' at-or-after the match (readAllByIds( / readAll().
      // Slice the WHOLE call by balanced parens first, so the options-object search below can never
      // bleed into a LATER, unrelated call site (the original bug: a fixed-size window swallowed the
      // next nearby call's options object when two call sites sat close together in the same file).
      const openParenIdx = src.indexOf('(', m.index);
      const callSpan = openParenIdx === -1 ? '' : sliceBalancedParens(src, openParenIdx);
      // Within the call's own span, the options object is the LAST top-level `{...}` (every call
      // site here follows the convention of the options bag being the final argument).
      let braceIdx = -1;
      { let depth = 0; for (let i = 0; i < callSpan.length; i++) { const ch = callSpan[i]; if (ch === '(') depth++; else if (ch === ')') depth--; else if (ch === '{' && depth === 1) braceIdx = i; } }
      const body = braceIdx !== -1 ? sliceObjectLiteral(callSpan, braceIdx) : '';

      const orderByLiteral = stringOption(body, 'orderBy');
      const orderByPresentButUnresolved = hasOption(body, 'orderBy') && orderByLiteral === null;
      const idColumnLiteral = isReadAllByIds ? stringOption(body, 'idColumn') : null;
      const idColumnPresentButUnresolved = isReadAllByIds && hasOption(body, 'idColumn') && idColumnLiteral === null;

      if (orderByPresentButUnresolved || idColumnPresentButUnresolved) {
        unresolved.push({ file, table, kind, reason: 'orderBy/idColumn given as a non-literal expression' });
        continue;
      }

      let orderCol;
      if (orderByLiteral !== null) {
        orderCol = orderByLiteral;
      } else if (isReadAllByIds) {
        orderCol = idColumnLiteral ?? 'id';
      } else if (Object.prototype.hasOwnProperty.call(TABLE_PRIMARY_KEY, table)) {
        orderCol = TABLE_PRIMARY_KEY[table]; // string or array (composite key) -- readAll()'s real default
      } else {
        // No orderBy given, and readAll()'s own TABLE_PRIMARY_KEY has no entry for this table -- the
        // real readAll() call THROWS at runtime (see that function's own header). A live violation,
        // not a silent guess -- hard:true, unlike the non-literal-expression case above.
        unresolved.push({ file, table, kind, hard: true, reason: `no orderBy given and "${table}" is absent from TABLE_PRIMARY_KEY -- readAll() throws at runtime for this call site` });
        continue;
      }
      resolved.push({ file, table, orderCol, kind });
    }
  }
  return { resolved, unresolved };
}

test('pagination order-key audit: every literal-table readAllByIds/readAll call site names an order column that exists on that table', () => {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  const columnsByTable = new Map();
  for (const c of snapshot.columns) {
    if (!columnsByTable.has(c.table)) columnsByTable.set(c.table, new Set());
    columnsByTable.get(c.table).add(c.column);
  }

  const files = [];
  for (const d of SCAN_DIRS) walkFiles(join(ROOT, d), CODE_EXT, SKIP_DIR, files);
  const { resolved, unresolved } = scanOrderKeyCallSites(files);

  assert.ok(resolved.length > 0, 'sanity: the scan should find at least the known call sites in the live tree');

  const violations = [];
  for (const { file, table, orderCol, kind } of resolved) {
    const cols = columnsByTable.get(table);
    if (!cols) continue; // table not in the committed snapshot -- unknown to this audit, not asserted absent
    // orderCol is a single column (string) or a composite key (array, from TABLE_PRIMARY_KEY) -- every
    // column named must exist on the table.
    const orderColumns = Array.isArray(orderCol) ? orderCol : [orderCol];
    for (const col of orderColumns) {
      if (!cols.has(col)) {
        violations.push(`${file.replace(ROOT, 'fsi-app')}: ${kind}("${table}") would order by "${col}" (of [${orderColumns.join(', ')}]), which is NOT a column of ${table} in the committed schema snapshot`);
      }
    }
  }

  // hard:true unresolved entries are readAll() calls THAT WILL THROW at runtime (no orderBy, table
  // absent from TABLE_PRIMARY_KEY) -- these fail the audit outright, unlike the non-literal-expression
  // unresolved entries (which stay informational, per this file's own SCOPE comment).
  const hardUnresolved = unresolved.filter((u) => u.hard);
  for (const u of hardUnresolved) {
    violations.push(`${u.file.replace(ROOT, 'fsi-app')}: ${u.kind}("${u.table}") -- ${u.reason}`);
  }

  assert.deepEqual(violations, [], `pagination order-key violations (this is exactly the GATE-A-RESCAN / harness_runs crash class):\n${violations.join('\n')}`);
});

// GOLDEN (regression for the exact bug): the scanner itself must resolve item_gate_a_state's real
// call site to "intelligence_item_id" (the fixed default), never "id" -- proves the scanner would have
// caught the original bug (orderBy resolving to "id" for a table with no such column) had it existed
// before the fix landed.
test('pagination order-key audit: scanner resolves the item_gate_a_state call site to intelligence_item_id, not "id"', () => {
  const fakeSrc = `
    readGateAStates: (ids) => readAllByIds(
      "item_gate_a_state", "intelligence_item_id, gate_a_version", ids,
      { idColumn: "intelligence_item_id", manyPerId: false },
    ),
  `;
  const { resolved } = scanOrderKeyCallSites(['fake.mjs'], () => fakeSrc);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].table, 'item_gate_a_state');
  assert.equal(resolved[0].orderCol, 'intelligence_item_id');
});

// This exact shape was a SECOND, sibling instance of the same bug in gate-a-rescan.mjs itself: its
// countDistinctGateAVersions dep called `readAll("item_gate_a_state", "gate_a_version")` with no
// orderBy, apply-mode-only (so the 2026-09-26 dry-mode incident never reached it). Fixed alongside
// the reported bug by passing `orderBy: "intelligence_item_id"` explicitly (2026-09-26, #812). Since
// lane MAINTENANCE-HARNESS (2026-09-28), readAll()'s own default is no longer "id" -- it resolves via
// TABLE_PRIMARY_KEY, so this test now proves the scanner resolves the SAME bare call the way readAll()
// itself really behaves today: "intelligence_item_id" (item_gate_a_state's real PK), a RESOLVED
// (correct) call, never "id" and never an unresolved/throwing one.
test('pagination order-key audit: scanner resolves a bare readAll(table, cols) with no orderBy via TABLE_PRIMARY_KEY, not "id"', () => {
  const bareReadAllSrc = `
    countDistinctGateAVersions: () => readAll("item_gate_a_state", "gate_a_version"),
  `;
  const { resolved, unresolved } = scanOrderKeyCallSites(['fake.mjs'], () => bareReadAllSrc);
  assert.equal(unresolved.length, 0);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].table, 'item_gate_a_state');
  assert.equal(resolved[0].orderCol, 'intelligence_item_id');
});

// The harness_runs incident itself (PR #819, run 36461564054): a bare readAll("harness_runs", ...) with
// no orderBy must now resolve to "run_id" (its real PK, via TABLE_PRIMARY_KEY), never "id" -- proves the
// scanner (and readAll() itself) would catch this exact live crash today.
test('pagination order-key audit: scanner resolves a bare readAll("harness_runs", ...) to run_id, not "id"', () => {
  const src = `
    const rows = await readAllFn("harness_runs", "run_id", { match: (q) => q.eq("harness_family", family) });
  `;
  const { resolved, unresolved } = scanOrderKeyCallSites(['fake.mjs'], () => src);
  // readAllFn (a parameter name, not the literal `readAll`) is intentionally NOT matched by this
  // scanner's CALL_RE -- it only resolves literal `readAll(`/`readAllByIds(` calls. This proves that:
  // the real call site is in scripts/plan-quarantine-disposition.mjs's own nextRunNumberFromHarnessRuns,
  // which calls the INJECTED readAllFn, not readAll() directly -- so it is invisible to this static
  // scanner by construction (same class as any dependency-injected call), never silently mis-resolved.
  assert.equal(resolved.length, 0);
  assert.equal(unresolved.length, 0);

  const directSrc = `
    const rows = await readAll("harness_runs", "run_id", { match: (q) => q.eq("harness_family", family) });
  `;
  const direct = scanOrderKeyCallSites(['fake.mjs'], () => directSrc);
  assert.equal(direct.resolved.length, 1);
  assert.equal(direct.resolved[0].table, 'harness_runs');
  assert.equal(direct.resolved[0].orderCol, 'run_id');
});

// A table absent from TABLE_PRIMARY_KEY (a view, or a table added after the map's snapshot) with no
// explicit orderBy is a HARD violation -- readAll() throws for it at runtime. Proves the scanner
// surfaces this as a failing finding, not a silent skip.
test('pagination order-key audit: a bare readAll() on a table absent from TABLE_PRIMARY_KEY is a HARD unresolved violation', () => {
  const src = `
    const rows = await readAll("acquisition_backlog_v", "*");
  `;
  const { resolved, unresolved } = scanOrderKeyCallSites(['fake.mjs'], () => src);
  assert.equal(resolved.length, 0);
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].hard, true);
  assert.match(unresolved[0].reason, /absent from TABLE_PRIMARY_KEY/);
});
