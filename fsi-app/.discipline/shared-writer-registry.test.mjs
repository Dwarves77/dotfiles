// shared-writer-registry.test.mjs — STANDALONE (run with `node --test .discipline/shared-writer-registry.test.mjs`).
// Also matched by run-test-suite.sh's existing `fsi-app/.discipline/*.test.mjs` glob (confirmed lane N5,
// plan 6.8: the file already sat directly under .discipline/, so no line needed adding there).
//
// WHAT THIS PROVES: every file under scripts/, src/, and supabase/functions/ that WRITES one of the
// shared datasets this registry tracks carries a `// SHARED-WRITER: <table>[, <table>...]` header line
// naming that table, AND every file carrying such a header line actually contains a detected write to
// every table it names. Two directions, both checked (plan 6.8, Rule A, lane N5): an undeclared write is
// either an undocumented new owner (add the header line, with a justification in
// docs/inventories/shared-dataset-ownership.md's prose) or a stale/dead writer that should have been
// archived (git mv it to scripts/_archive/** per the sunset lane's evidence gate); a declared-but-absent
// write is a stale or wrong marker (fix the header line or remove it).
//
// ONE SOURCE OF TRUTH, DERIVED (replaces the fenced ```json block this file used to parse verbatim):
// the allowlist (which table, which files) is no longer hand-copied anywhere, it is derived by scanning
// the SAME file set this test always scanned for the header markers themselves. The set of "shared
// table" names is likewise derived, not a separate hand-maintained list: it is exactly the set of table
// names that appear in at least one SHARED-WRITER marker in the scanned tree. docs/inventories/
// shared-dataset-ownership.md keeps the prose (why each table is shared, the operator ruling, dataset-by
// -dataset detail) and points here for the machine-checked list.
//
// WHY THIS MATTERS: the operator's ruling is that intelligence_items / item_cross_references /
// connection_themes / connection_theme_runs / integrity_flags / census_worklist / item_forward_events /
// theme_briefs (plus section_claim_provenance, found by evidence — see the doc) flow ONLY through the
// harness and flywheel systems (plus the small, evidence-gated set of KEPT era scripts the doc names). A
// NEW script quietly writing one of these tables — one more one-off backfill, one more "just this once"
// campaign script — is exactly the failure mode this registry exists to catch before it repeats.
//
// SCAN SCOPE: scripts/**, src/**, and supabase/functions/** (all three hold live writers — mint-item.ts
// and friends live in src/lib/intake, the harness/flywheel scripts live in scripts/mint,
// scripts/forward-events, scripts/connections, and capture-worker — an Edge Function, not a Next.js
// route or a scripts/ CLI, but app code all the same — writes several shared tables from
// supabase/functions/capture-worker/index.ts).
// EXCLUDED: scripts/_archive/** (sunset scripts — inert by construction, already proven zero-referenced),
// node_modules/**, and any file whose basename contains "test" (case-insensitive — covers .test.mjs,
// .selftest.mjs, .npmtest.mjs, and this file itself) per the task's literal instruction.
//
// WRITE-PATTERN HEURISTICS (derived from how writes actually look in this codebase — read scripts/lib/
// db.mjs and a dozen callers before writing these):
//   (a) `sb.from("table")` (or readClient()/writeClient()/supabase — any identifier) followed, within the
//       SAME statement (up to the next `;`, capped at 600 chars to bound the scan), by `.insert(`,
//       `.update(`, `.upsert(`, or `.delete(`. `.select()` alone is deliberately never a match.
//   (b) `guardedInsert(`, `guardedUpdate(`, `guardedDelete(`, `guardedInsertMany(`, or `archiveRows(`
//       (scripts/lib/db.mjs's guarded write helpers) called with a string-literal table name as the first
//       argument.
//   (c) raw SQL naming the table: `INSERT INTO <table>`, `UPDATE <table> SET`, `DELETE FROM <table>`
//       (case-insensitive; matches a `pg` client's template-literal queries, the only raw-SQL write shape
//       found in scripts/ at time of authoring).
// A file is flagged only when the TABLE NAME matched is one of the derived shared table names; a write
// to an unrelated, non-shared table (e.g. agent_runs, sources, holdings_quality) is out of this
// registry's scope by design (see the doc's "Open leaks summary" for why a couple of those were
// deliberately left unregistered rather than padded into the allowlist).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, ".."); // fsi-app/

// ---------------------------------------------------------------------------------------------------
// 1. Parse a file's own SHARED-WRITER header marker, if it has one. ONE source of truth, on the file
//    itself, this test never hand-copies a second list of who-writes-what.
// ---------------------------------------------------------------------------------------------------
const MARKER_RE = /^\/\/\s*SHARED-WRITER:\s*(.+)$/m;

export function parseWriterMarker(text) {
  const m = text.match(MARKER_RE);
  if (!m) return null;
  const tables = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  return tables.length > 0 ? tables : null;
}

// ---------------------------------------------------------------------------------------------------
// 1b. Derive the allowlist (table -> [files]) and each file's own declaration (file -> [tables]) by
//     scanning every candidate file for its marker. Table names are whatever the markers name, no
//     separate hand-maintained vocabulary.
// ---------------------------------------------------------------------------------------------------
export function buildDerivedAllowlist(root, files) {
  const sharedTables = {};
  const declarations = new Map();
  for (const absFile of files) {
    let text;
    try {
      text = readFileSync(absFile, "utf8");
    } catch {
      continue;
    }
    const tables = parseWriterMarker(text);
    if (!tables) continue;
    const relFile = relative(root, absFile).replaceAll("\\", "/");
    declarations.set(relFile, tables);
    for (const table of tables) {
      if (!sharedTables[table]) sharedTables[table] = [];
      sharedTables[table].push(relFile);
    }
  }
  return { sharedTables, declarations };
}

// ---------------------------------------------------------------------------------------------------
// 2. Walk scripts/, src/, and supabase/functions/, collecting candidate source files. supabase/functions
//    (Edge Functions, e.g. capture-worker) is app code that writes shared tables exactly like a script or
//    a Next.js route — excluding it left capture-worker's writes to pending_first_fetch / sources /
//    intelligence_items / agent_run_searches / agent_runs / integrity_flags entirely unscanned (found
//    2026-09-01, alongside the same gap in F14/producer-consumer-orphan.mjs).
// ---------------------------------------------------------------------------------------------------
const SCAN_ROOTS = ["scripts", "src", "supabase/functions"];
const SCAN_EXTS = new Set([".mjs", ".js", ".ts", ".tsx", ".cjs"]);
const EXCLUDED_DIR_NAMES = new Set(["_archive", "node_modules"]);

// "*test* files" per the task instruction, PLUS .golden.mjs — a golden proof file (e.g.
// disposition-content-gate.golden.mjs) reads another script's SOURCE TEXT as a string and greps it for
// call-shape substrings like 'guardedDelete("intelligence_items"' to prove that OTHER file's structure;
// that string literal is not a real write site in the golden file itself, and treating it as one would
// force a nonsense allowlist entry. F25-module-liveness.mjs's own isTestFile() draws this exact line
// (test/selftest/npmtest + .golden.mjs) — matched here for consistency.
export function isExcludedFile(basename) {
  return /test/i.test(basename) || /\.golden\.mjs$/i.test(basename);
}

export function walkScanFiles(root, scanRoots = SCAN_ROOTS, excludedDirNames = EXCLUDED_DIR_NAMES) {
  const out = [];
  const walk = (absDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue; // hidden dirs/files (.git, etc.) — never a scan target here
      if (e.isDirectory()) {
        if (excludedDirNames.has(e.name)) continue;
        walk(join(absDir, e.name));
        continue;
      }
      if (!e.isFile()) continue;
      const dot = e.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : e.name.slice(dot);
      if (!SCAN_EXTS.has(ext)) continue;
      if (isExcludedFile(e.name)) continue;
      out.push(join(absDir, e.name));
    }
  };
  for (const r of scanRoots) walk(resolve(root, r));
  return out;
}

// ---------------------------------------------------------------------------------------------------
// 3. Extract (table, matchKind) write hits from one file's source text.
// ---------------------------------------------------------------------------------------------------
const WRITE_VERB_RE = /\.(insert|update|upsert|delete)\s*\(/;
const FROM_RE = /\.from\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\)/g;
// guardedUpdateByIds MUST be matched before the shorter guardedUpdate alternative (regex alternation
// tries branches left to right; guardedUpdate alone would match the "guardedUpdate" prefix of
// "guardedUpdateByIds(" and then fail the immediately-following "\(" against the literal "B", so
// ORDER here is load-bearing, not stylistic). Confirmed gap, lane N5 (plan 6.8): the doc's own
// origin-class-backfill.mjs note already named this exact miss ("missed by the scanner's
// guardedUpdateByIds( regex, see .discipline/shared-writer-registry.test.mjs's GUARDED_RE, which
// matches guardedUpdate( but not the ByIds suffix") for one file; the reverse-direction check this
// lane added surfaced nine more real callers of the SAME helper the old one-directional test never
// exercised this way.
const GUARDED_RE = /\b(?:guardedInsertMany|guardedInsert|guardedUpdateByIds|guardedUpdate|guardedDelete|archiveRows)\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g;
const RAW_SQL_RE = /\b(?:INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)|UPDATE\s+([A-Za-z_][A-Za-z0-9_]*)\s+SET|DELETE\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*))/gi;
const STATEMENT_WINDOW = 600; // chars scanned after a .from(...) match, capped at the next ';'

export function extractWriteHits(text) {
  const tables = new Set();

  // (a) chained .from("table")....insert/update/upsert/delete(, bounded to the same statement.
  for (const m of text.matchAll(FROM_RE)) {
    const start = m.index + m[0].length;
    let end = text.indexOf(";", start);
    if (end === -1 || end - start > STATEMENT_WINDOW) end = start + STATEMENT_WINDOW;
    const window = text.slice(start, end);
    if (WRITE_VERB_RE.test(window)) tables.add(m[1]);
  }

  // (b) scripts/lib/db.mjs guarded helpers, table as a string-literal first arg.
  for (const m of text.matchAll(GUARDED_RE)) tables.add(m[1]);

  // (c) raw SQL INSERT INTO / UPDATE ... SET / DELETE FROM.
  for (const m of text.matchAll(RAW_SQL_RE)) {
    const table = m[1] || m[2] || m[3];
    if (table) tables.add(table);
  }

  return tables;
}

// ---------------------------------------------------------------------------------------------------
// 4. Full scan: for every candidate file, every shared-table write hit not covered by the allowlist is a
//    violation. A write to a table absent from the allowlist's key set is out of scope (not shared).
// ---------------------------------------------------------------------------------------------------
export function scanForViolations(root, sharedTables, files) {
  const violations = [];
  const allowlistFor = (table) => new Set(sharedTables[table] ?? []);
  for (const absFile of files) {
    let text;
    try {
      text = readFileSync(absFile, "utf8");
    } catch {
      continue;
    }
    const relFile = relative(root, absFile).replaceAll("\\", "/");
    const hits = extractWriteHits(text);
    for (const table of hits) {
      if (!Object.prototype.hasOwnProperty.call(sharedTables, table)) continue; // not a registered shared dataset — out of scope
      if (!allowlistFor(table).has(relFile)) {
        violations.push({ file: relFile, table });
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------------
// The tests. Both directions (plan 6.8, Rule A, lane N5): a detected write with no declaring marker,
// and a declaring marker with no detected write.
// ---------------------------------------------------------------------------------------------------
test("every shared-dataset writer under scripts/, src/, and supabase/functions/ carries a SHARED-WRITER marker", () => {
  const files = walkScanFiles(ROOT);
  assert.ok(files.length > 0, "shared-writer-registry: scan found zero candidate files under scripts/ or src/, check SCAN_ROOTS/ROOT resolution.");

  const { sharedTables } = buildDerivedAllowlist(ROOT, files);
  assert.ok(
    Object.keys(sharedTables).length > 0,
    "shared-writer-registry: zero SHARED-WRITER markers found anywhere in the scanned tree, the marker regex or SCAN_ROOTS may be broken.",
  );

  const violations = scanForViolations(ROOT, sharedTables, files);

  if (violations.length > 0) {
    const lines = violations
      .map((v) => `  - ${v.file} writes "${v.table}" but carries no "// SHARED-WRITER: ${v.table}" header line`)
      .join("\n");
    assert.fail(
      `${violations.length} unregistered shared-dataset writer(s) found:\n${lines}\n\n` +
      `FIX: either (1) this is a legitimate new writer, add "// SHARED-WRITER: <table>[, <table>...]" as a ` +
      `header line in the file, with a one-line justification in docs/inventories/shared-dataset-ownership.md's ` +
      `prose; or (2) this is a stale/dead writer, git mv it to scripts/_archive/<original-subpath> (content ` +
      `untouched) and add a tombstone line to scripts/_archive/README.md, per the sunset lane's evidence gate ` +
      `(zero live inbound references AND superseded-or-completed).`,
    );
  }
});

test("every SHARED-WRITER marker names a table the file actually writes", () => {
  const files = walkScanFiles(ROOT);
  const { declarations } = buildDerivedAllowlist(ROOT, files);
  assert.ok(declarations.size > 0, "shared-writer-registry: zero declared files found (see the other test in this file).");

  const reverseViolations = [];
  for (const [relFile, tables] of declarations) {
    const absFile = resolve(ROOT, relFile);
    let text;
    try {
      text = readFileSync(absFile, "utf8");
    } catch {
      continue;
    }
    const hits = extractWriteHits(text);
    for (const table of tables) {
      if (!hits.has(table)) reverseViolations.push({ file: relFile, table });
    }
  }

  if (reverseViolations.length > 0) {
    const lines = reverseViolations
      .map((v) => `  - ${v.file} declares "// SHARED-WRITER: ${v.table}" but no write to "${v.table}" was detected in it`)
      .join("\n");
    assert.fail(
      `${reverseViolations.length} stale or wrong SHARED-WRITER marker(s) found:\n${lines}\n\n` +
      `FIX: remove the table name from the header line if the file no longer writes it (or never did), or ` +
      `fix the write site if the marker is right and the code regressed.`,
    );
  }
});
