// check-vocabulary.test.mjs, D7 part 2 (docs/plans/defect-fix-plan-2026-09-12.md).
//
// Scans scripts/maintenance/*.mjs, scripts/turns/*.mjs, src/app/api/**/route.ts, and
// src/lib/**/*.{ts,mjs} for an object-literal property whose KEY is a column named in the tracked
// CHECK-constraint inventory (docs/inventories/db-check-constraints.json, D7 part 1) with a
// STRING-LITERAL value, and fails when that value is not in the column's allowed set. A dynamic value
// (a variable, a template literal, a function call) is never matched by this literal-only scan and is
// therefore always skipped, never guessed at.
//
// This is the D2 class fix in force: `provisional_sources_status_check` rejected `status: "promoted"`
// because nothing checked the vocabulary a writer used against the vocabulary the database accepted.
// This test is that check, running against the CURRENT tracked inventory on every push.
//
// TWO SCOPING DECISIONS, both load-bearing, both discovered by running the naive version of this check
// against the real tree (documented here rather than silently baked in, since they narrow the plan's
// literal "key name only" wording):
//
// 1. WRITE-CALL SCOPING. A "key name only" match over the WHOLE file, with no other anchor, was tried
//    first and produced ~150 hits across src/lib alone, every one a false positive: a purely local
//    decision object reusing a common English word (`kind`, `tier`, `status`, `reason`, `severity`,
//    `action`) that has nothing to do with any database row (e.g. src/lib/sources/verification.ts's own
//    internal `tier: "M"` classification is never written to a DB column named `tier`). This narrows the
//    scan to the SAME call-shape heuristic shared-writer-registry.test.mjs already uses to find a real
//    write (`.insert(`/`.update(`/`.upsert(`, or scripts/lib/db.mjs's guarded helpers): a column-literal
//    match only counts when it falls within a bounded window after a recognized write call, the span a
//    payload object passed to that call would occupy.
// 2. TABLE-SCOPED VALIDATION WHEN THE TABLE IS RESOLVABLE, falling back to the plan's own "key name
//    only... passes if allowed on at least one table" union check only when it is not. A column name can
//    be a narrow enum on ONE table and unconstrained free text on another (`created_by` is
//    `["system","worker","human"]` on `source_trust_events`, but a free-text agent identifier on
//    `integrity_flags` per this repo's own doctrine, `fsi-app/.claude/CLAUDE.md`'s integrity-flags
//    section: "created_by: agent identifier"). A pure union-by-key-name check, still tried second,
//    rejected `integrity_flags` writes like `created_by: "d3-hook"` against `source_trust_events`'s
//    narrow vocabulary purely because the column name matched, a false positive from the SAME root cause
//    as decision 1 (name reuse), not a database mismatch. When the write call names its target table
//    (`.from("table")`, or the table as the guarded helper's own first argument, the overwhelming
//    majority shape in this codebase), the column is checked ONLY against that table's own allowed set,
//    or skipped entirely when that table carries no CHECK on the column at all (never guessed). Only a
//    write whose table cannot be resolved (a dynamic table-name expression) falls back to the lenient
//    union.
//
// STATIC-TEXT HEURISTIC, not an AST parse: this file runs in the no-npm discipline suite (node builtins
// and relative imports only), so a real TS/JS parser is out of reach here, same constraint every other
// regex-based discipline check in this repo already lives with (shared-writer-registry.test.mjs,
// admin-phrase-scan.mjs). Consequence, named rather than silently accepted: a TypeScript string-literal
// union TYPE annotation of the same shape (`status: "active" | "stale"` inside a `type`/`interface`)
// reads identically to a value assignment and is scanned the same way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..'); // fsi-app/
const INVENTORY_PATH = resolve(ROOT, 'docs/inventories/db-check-constraints.json');

// ---------------------------------------------------------------------------------------------------
// 1. Two views of the SAME tracked inventory: a per-(table,column) map for precise validation, and a
//    per-column UNION across every table for the lenient fallback. Unparsed constraints (allowed: null)
//    never gate anything (never guessed).
// ---------------------------------------------------------------------------------------------------
export function buildTableColumnAllowedMap(inventoryDoc) {
  const map = new Map(); // table -> Map(column -> Set(allowed))
  for (const c of inventoryDoc.constraints ?? []) {
    if (!c.column || !Array.isArray(c.allowed)) continue;
    if (!map.has(c.table)) map.set(c.table, new Map());
    const byColumn = map.get(c.table);
    if (!byColumn.has(c.column)) byColumn.set(c.column, new Set());
    for (const v of c.allowed) byColumn.get(c.column).add(v);
  }
  return map;
}

export function buildColumnAllowedMap(inventoryDoc) {
  const map = new Map(); // column -> Set(allowed), unioned across every table
  for (const c of inventoryDoc.constraints ?? []) {
    if (!c.column || !Array.isArray(c.allowed)) continue;
    if (!map.has(c.column)) map.set(c.column, new Set());
    for (const v of c.allowed) map.get(c.column).add(v);
  }
  return map;
}

// ---------------------------------------------------------------------------------------------------
// 2. Pure scanner: `key: 'literal'` / `key: "literal"` for a governed key, over one file's text. Only
//    single/double-quoted string literals match; a backtick template, a bare identifier, or a call
//    expression never does, which is how "a dynamic value is skipped" is enforced (by construction, not
//    by a separate check).
// ---------------------------------------------------------------------------------------------------
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findColumnLiteralAssignments(text, governedColumns) {
  if (governedColumns.length === 0) return [];
  const re = new RegExp(`\\b(${governedColumns.map(escapeRegExp).join('|')})\\s*:\\s*(['"])((?:\\\\.|(?!\\2).)*)\\2`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ column: m[1], value: m[3].replace(/\\(.)/g, '$1'), index: m.index });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// 2b. Strip `//` and `/* */` comments before scanning, tracking string/template state so a comment
//     marker inside a literal is never treated as a comment. Without this, a doc comment showing an
//     EXAMPLE literal (`// e.g. {status: "..."}`) reads exactly like a real assignment (found the hard
//     way: src/lib/intake/apply-staged-update.ts's own such comment was the first false positive this
//     check's corpus-wide run produced). Best-effort, not a full tokenizer: a `/` that opens a REGEX
//     literal (not a comment, not a string) can confuse the scan; not observed at any of this check's
//     four scan targets' write call sites, so accepted rather than built around.
// ---------------------------------------------------------------------------------------------------
export function stripJsComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let inString = null; // one of "'", '"', '`', or null
  while (i < n) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\' && i + 1 < n) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      inString = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      let j = text.indexOf('\n', i);
      if (j === -1) j = n;
      i = j;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let j = text.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// 3. Write-call windows, each with its resolved target table when the write names one (see decisions 1
//    and 2 above). `table` is null when the write's target cannot be determined statically (a dynamic
//    table-name expression), the caller falls back to the lenient union check for those only.
// ---------------------------------------------------------------------------------------------------
const WINDOW = 2000; // chars scanned after a write call, capped at the next ';' (mirrors shared-writer-registry.test.mjs's STATEMENT_WINDOW idiom, widened for a full row payload)

// `sb.from("table")....insert/update/upsert(`, table named via .from(), verb may be a few chars later
// (chained .eq()/.select() are not used before a write, but keep a short gap for safety).
const FROM_WRITE_RE = /\.from\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\)[\s\S]{0,80}?\.(?:insert|update|upsert)\s*\(/g;
// scripts/lib/db.mjs guarded helpers, table is the first string-literal argument.
const GUARDED_WRITE_RE = /\b(?:guardedInsertMany|guardedInsert|guardedUpdate|guardedUpsert|guardedDelete)\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g;
// A write call whose target could not be resolved by either pattern above (dynamic table name), still a
// candidate window, checked against the lenient union only.
const BARE_WRITE_RE = /\b(?:insert|update|upsert|guardedInsert|guardedInsertMany|guardedUpdate|guardedUpsert|guardedDelete)\s*\(/g;

function pushWindow(windows, text, matchIndex, matchEndIndex, table) {
  let end = text.indexOf(';', matchIndex);
  if (end === -1 || end - matchIndex > WINDOW) end = matchIndex + WINDOW;
  windows.push({ start: matchEndIndex, end: Math.min(end, text.length), table });
}

export function findWriteCallWindows(text) {
  const windows = [];
  const claimed = []; // [start, end) spans already attributed to a resolved-table window, so the bare pass does not double-count them

  let m;
  const fromRe = new RegExp(FROM_WRITE_RE);
  while ((m = fromRe.exec(text)) !== null) {
    pushWindow(windows, text, m.index, m.index + m[0].length, m[1]);
    claimed.push([m.index, m.index + m[0].length]);
  }
  const guardedRe = new RegExp(GUARDED_WRITE_RE);
  while ((m = guardedRe.exec(text)) !== null) {
    pushWindow(windows, text, m.index, m.index + m[0].length, m[1]);
    claimed.push([m.index, m.index + m[0].length]);
  }
  const bareRe = new RegExp(BARE_WRITE_RE);
  while ((m = bareRe.exec(text)) !== null) {
    const alreadyClaimed = claimed.some(([s, e]) => m.index >= s && m.index < e);
    if (alreadyClaimed) continue;
    pushWindow(windows, text, m.index, m.index + m[0].length, null);
  }

  return windows;
}

/** A matched (column, value) pair is a violation when it falls inside a write-call window AND the value
 *  is not allowed: precisely (that window's own resolved table's allowed set for the column, or SKIPPED
 *  when that table carries no CHECK on the column) when the table is known, or the lenient
 *  key-name-only UNION across every table when it is not. */
export function findVocabularyViolations(text, tableColumnAllowed, columnAllowedUnion) {
  const unionColumns = [...columnAllowedUnion.keys()];
  const seen = new Map(); // absolute index -> violation, dedupes overlapping windows

  for (const { start, end, table } of findWriteCallWindows(text)) {
    const slice = text.slice(start, end);

    if (table) {
      const byColumn = tableColumnAllowed.get(table);
      if (!byColumn) continue; // no tracked CHECK constraints for this table at all
      const governed = [...byColumn.keys()];
      for (const { column, value, index } of findColumnLiteralAssignments(slice, governed)) {
        const absoluteIndex = start + index;
        if (seen.has(absoluteIndex)) continue;
        if (!byColumn.get(column).has(value)) seen.set(absoluteIndex, { column, value, index: absoluteIndex, table });
      }
      continue;
    }

    for (const { column, value, index } of findColumnLiteralAssignments(slice, unionColumns)) {
      const absoluteIndex = start + index;
      if (seen.has(absoluteIndex)) continue;
      if (!columnAllowedUnion.get(column).has(value)) seen.set(absoluteIndex, { column, value, index: absoluteIndex, table: null });
    }
  }

  return [...seen.values()].sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------------------------------
// 4. File discovery for the four glob targets. Dependency-free (no npm glob package).
// ---------------------------------------------------------------------------------------------------
function walk(dir, matches, matchName) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, matches, matchName);
      continue;
    }
    if (e.isFile() && matchName(e.name)) matches.push(full);
  }
}

export function discoverScanTargets(root) {
  const files = [];
  // scripts/maintenance/*.mjs, scripts/turns/*.mjs: one level (a lib/ subdirectory of either is a
  // different write surface, out of this check's stated scope).
  for (const rel of ['scripts/maintenance', 'scripts/turns']) {
    const dir = resolve(root, rel);
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.mjs') && !isTestFile(e.name)) files.push(join(dir, e.name));
    }
  }
  // src/app/api/**/route.ts: recursive, filename must be exactly route.ts.
  walk(resolve(root, 'src/app/api'), files, (name) => name === 'route.ts');
  // src/lib/**/*.{ts,mjs}: recursive, excluding test files.
  walk(resolve(root, 'src/lib'), files, (name) => (name.endsWith('.ts') || name.endsWith('.mjs')) && !isTestFile(name));
  return files;
}

// This repo's own test-file taxonomy (matches F25-module-liveness.mjs's isTestFile / shared-writer-
// registry.test.mjs's isExcludedFile convention): a .test./.npmtest./.selftest. file exercises a fake
// deps object, never a real database, so a literal inside one is never a real write.
function isTestFile(name) {
  return /\.(test|npmtest|selftest)\./i.test(name);
}

// ---------------------------------------------------------------------------------------------------
// KNOWN, REASONED, SHRINKING allowlist (same idiom as scripts/verify/lib/schema-drift.mjs's own
// ALLOWLIST): pre-existing drift this check's FIRST run (2026-09-12) found in the live tree, each cited
// with why it is not fixed in THIS lane, so the corpus-wide test is a real, enforced gate for every NEW
// write from here on without blocking on debt outside this lane's write set (docs/plans/
// defect-fix-plan-2026-09-12.md's D5/D7 scope; fixing scripts/turns/run-source-sweep.mjs or
// src/lib/sources/source-growth.ts's own write behavior is not part of either defect). Keyed by
// `<table-or-empty>.<column>=<value>`. Self-audited immediately below: an entry the CURRENT inventory
// now actually allows is STALE and must be removed, never left to accumulate once the real issue is
// fixed (the same "the allowlist is itself audited" rule schema-drift.mjs's own header states).
// ---------------------------------------------------------------------------------------------------
const KNOWN_DRIFT_ALLOWLIST = {
  'monitoring_queue.last_result=change_detected': 'Pre-existing drift found by this check\'s first run (2026-09-12), outside the D5/D7 write set: scripts/turns/run-source-sweep.mjs writes a value monitoring_queue_last_result_check does not list (["no_change","updated","new_item","error","inaccessible"]). Flagged for a follow-up lane; not fixed here.',
  'source_trust_events.created_by=reputation-cycle': 'Pre-existing drift found by this check\'s first run (2026-09-12), outside the D5/D7 write set: src/lib/sources/source-growth.ts writes a value source_trust_events_created_by_check does not list (["system","worker","human"]). Flagged for a follow-up lane; not fixed here.',
};

function allowlistKey(v) {
  return `${v.table ?? ''}.${v.column}=${v.value}`;
}

// ---------------------------------------------------------------------------------------------------
// The corpus-wide test.
// ---------------------------------------------------------------------------------------------------
test('every governed column literal in the live source tree is in its column allowed set (or a reasoned, cited allowlist entry)', () => {
  const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
  const tableColumnAllowed = buildTableColumnAllowedMap(inventory);
  const columnAllowedUnion = buildColumnAllowedMap(inventory);
  assert.ok(columnAllowedUnion.size > 0, 'check-vocabulary: the tracked inventory parsed to zero governed columns');

  const files = discoverScanTargets(ROOT);
  assert.ok(files.length > 0, 'check-vocabulary: file discovery found nothing under scripts/maintenance, scripts/turns, src/app/api, src/lib');

  const allViolations = [];
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const text = stripJsComments(raw);
    for (const v of findVocabularyViolations(text, tableColumnAllowed, columnAllowedUnion)) {
      allViolations.push({ file: file.slice(ROOT.length + 1).replaceAll('\\', '/'), ...v });
    }
  }

  const seenAllowlistKeys = new Set();
  const newViolations = allViolations.filter((v) => {
    const key = allowlistKey(v);
    if (Object.prototype.hasOwnProperty.call(KNOWN_DRIFT_ALLOWLIST, key)) {
      seenAllowlistKeys.add(key);
      return false;
    }
    return true;
  });

  if (newViolations.length > 0) {
    const lines = newViolations
      .map((v) => `  - ${v.file}: ${v.table ? `${v.table}.` : ''}${v.column}: "${v.value}" is not in the tracked allowed set`)
      .join('\n');
    assert.fail(
      `${newViolations.length} NEW vocabulary violation(s) found (not in KNOWN_DRIFT_ALLOWLIST):\n${lines}\n\n` +
      'FIX: correct the literal to a value the live CHECK constraint accepts, OR (if the DB migration ' +
      'widening the vocabulary has landed) re-run schema-vocabulary-inventory.mjs to refresh ' +
      'docs/inventories/db-check-constraints.json.',
    );
  }

  // Self-audit: an allowlist entry the CURRENT inventory now genuinely accepts is stale (the underlying
  // issue was fixed elsewhere) and must be removed, never left to accumulate.
  const staleEntries = Object.keys(KNOWN_DRIFT_ALLOWLIST).filter((k) => !seenAllowlistKeys.has(k));
  if (staleEntries.length > 0) {
    assert.fail(
      `${staleEntries.length} KNOWN_DRIFT_ALLOWLIST entry(ies) no longer reproduce (the underlying write ` +
      `is gone, or the vocabulary was widened to cover it) and must be removed:\n` +
      staleEntries.map((k) => `  - ${k}: ${KNOWN_DRIFT_ALLOWLIST[k]}`).join('\n'),
    );
  }
});

// ---------------------------------------------------------------------------------------------------
// Unit tests for the pure pieces.
// ---------------------------------------------------------------------------------------------------
test('buildColumnAllowedMap: merges the same column name across tables into a union', () => {
  const doc = {
    constraints: [
      { table: 'a', column: 'status', constraint: 'a_status_check', allowed: ['active', 'stale'] },
      { table: 'b', column: 'status', constraint: 'b_status_check', allowed: ['pending_review', 'confirmed'] },
      { table: 'c', column: 'status', constraint: 'c_status_check', allowed: null, unparsed: 'CHECK (...)' },
    ],
  };
  const map = buildColumnAllowedMap(doc);
  assert.deepEqual([...map.get('status')].sort(), ['active', 'confirmed', 'pending_review', 'stale']);
});

test('buildTableColumnAllowedMap: keeps each table\'s own allowed set separate', () => {
  const doc = {
    constraints: [
      { table: 'a', column: 'status', constraint: 'a_status_check', allowed: ['active', 'stale'] },
      { table: 'b', column: 'status', constraint: 'b_status_check', allowed: ['pending_review'] },
    ],
  };
  const map = buildTableColumnAllowedMap(doc);
  assert.deepEqual([...map.get('a').get('status')].sort(), ['active', 'stale']);
  assert.deepEqual([...map.get('b').get('status')].sort(), ['pending_review']);
});

test('findColumnLiteralAssignments: matches a governed key with a quoted literal', () => {
  const text = "const row = { status: 'active', other: 'ignored' };";
  const hits = findColumnLiteralAssignments(text, ['status']);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].column, 'status');
  assert.equal(hits[0].value, 'active');
});

test('findColumnLiteralAssignments: skips a dynamic (non-literal) value', () => {
  const text = 'const row = { status: someVar, provenance_status: `computed-${x}`, archive_reason: getReason() };';
  assert.deepEqual(findColumnLiteralAssignments(text, ['status', 'provenance_status', 'archive_reason']), []);
});

test('findColumnLiteralAssignments: ignores a key not in the governed list', () => {
  const text = "const row = { untracked_column: 'whatever' };";
  assert.deepEqual(findColumnLiteralAssignments(text, ['status']), []);
});

test('findWriteCallWindows: resolves the table from .from("table") before .insert/.update/.upsert', () => {
  const text = "await sb.from('sources').insert({ status: 'active' });";
  const windows = findWriteCallWindows(text);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].table, 'sources');
});

test('findWriteCallWindows: resolves the table from a guarded db.mjs helper\'s first argument', () => {
  const text = "await guardedUpdate('sources', q, { status: 'active' });";
  const windows = findWriteCallWindows(text);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].table, 'sources');
});

test('findWriteCallWindows: a write with no resolvable table still gets a window, with table:null', () => {
  const text = 'await sb.from(dynamicTable).insert({ status: "active" });';
  const windows = findWriteCallWindows(text);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].table, null);
});

test('findVocabularyViolations: TABLE-SCOPED, a value valid on a DIFFERENT table with the same column name is still rejected', () => {
  const tableColumnAllowed = buildTableColumnAllowedMap({
    constraints: [
      { table: 'source_trust_events', column: 'created_by', constraint: 'x', allowed: ['system', 'worker', 'human'] },
    ],
  });
  const columnAllowedUnion = buildColumnAllowedMap({
    constraints: [
      { table: 'source_trust_events', column: 'created_by', constraint: 'x', allowed: ['system', 'worker', 'human'] },
    ],
  });
  // integrity_flags carries NO tracked CHECK on created_by (it is free text per CLAUDE.md's own
  // integrity-flags doctrine) -- the table IS resolved (guardedInsert names it), so this write is
  // checked ONLY against integrity_flags' own (absent) constraint and is correctly SKIPPED, never
  // rejected against source_trust_events' unrelated narrow vocabulary (the false-positive class this
  // check's own header documents).
  const text = "await guardedInsert('integrity_flags', { created_by: 'd3-hook' });";
  assert.deepEqual(findVocabularyViolations(text, tableColumnAllowed, columnAllowedUnion), []);
});

test('findVocabularyViolations: TABLE-SCOPED, a genuinely bad value on the tracked table IS caught', () => {
  const tableColumnAllowed = buildTableColumnAllowedMap({
    constraints: [{ table: 'sources', column: 'status', constraint: 'sources_status_check', allowed: ['active', 'stale'] }],
  });
  const columnAllowedUnion = buildColumnAllowedMap({
    constraints: [{ table: 'sources', column: 'status', constraint: 'sources_status_check', allowed: ['active', 'stale'] }],
  });
  const text = "await guardedUpdate('sources', q, { status: 'promoted' });";
  const violations = findVocabularyViolations(text, tableColumnAllowed, columnAllowedUnion);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].table, 'sources');
});

test('findVocabularyViolations: UNRESOLVED TABLE falls back to the lenient union (a value allowed on at least one table passes)', () => {
  const tableColumnAllowed = buildTableColumnAllowedMap({ constraints: [] });
  const columnAllowedUnion = buildColumnAllowedMap({
    constraints: [{ table: 'a', column: 'status', constraint: 'a_check', allowed: ['pending_review'] }],
  });
  const text = "await sb.from(dynamicTable).insert({ status: 'pending_review' });";
  assert.deepEqual(findVocabularyViolations(text, tableColumnAllowed, columnAllowedUnion), []);
});

test('findVocabularyViolations: a literal OUTSIDE any write-call window is not scanned', () => {
  const tableColumnAllowed = new Map();
  const columnAllowedUnion = new Map([['tier', new Set(['H', 'M', 'L'])]]);
  const text = "function classify() { return { tier: 'not_a_real_tier' }; }"; // a local decision object, never a DB write
  assert.deepEqual(findVocabularyViolations(text, tableColumnAllowed, columnAllowedUnion), []);
});

// ---------------------------------------------------------------------------------------------------
// Negative test (fixture module): proves the detector actually fires (break-it-confirm-red), not merely
// that no violations were found because nothing was scanned.
// ---------------------------------------------------------------------------------------------------
test('negative test (fixture module): a literal value absent from its table\'s allowed set is detected', () => {
  const fixturePath = resolve(HERE, 'fixtures/check-vocabulary/bad-status-value.mjs');
  const text = readFileSync(fixturePath, 'utf8');
  const tableColumnAllowed = buildTableColumnAllowedMap({
    constraints: [{ table: 'sources', column: 'status', constraint: 'sources_status_check', allowed: ['active', 'stale', 'pending_review'] }],
  });
  const columnAllowedUnion = buildColumnAllowedMap({
    constraints: [{ table: 'sources', column: 'status', constraint: 'sources_status_check', allowed: ['active', 'stale', 'pending_review'] }],
  });
  const violations = findVocabularyViolations(text, tableColumnAllowed, columnAllowedUnion);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].column, 'status');
  assert.equal(violations[0].value, 'not_a_real_status_value');
  assert.equal(violations[0].table, 'sources');
});

test('positive control: the same detector over a fixture-shaped write with an ALLOWED value finds nothing', () => {
  const tableColumnAllowed = buildTableColumnAllowedMap({
    constraints: [{ table: 'sources', column: 'status', constraint: 'sources_status_check', allowed: ['active'] }],
  });
  const columnAllowedUnion = buildColumnAllowedMap({
    constraints: [{ table: 'sources', column: 'status', constraint: 'sources_status_check', allowed: ['active'] }],
  });
  const text = "await deps.guardedInsert(\"sources\", { status: \"active\" });\n";
  assert.deepEqual(findVocabularyViolations(text, tableColumnAllowed, columnAllowedUnion), []);
});
