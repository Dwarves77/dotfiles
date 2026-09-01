// shared-writer-registry.test.mjs — STANDALONE (run with `node --test .discipline/shared-writer-registry.test.mjs`).
// NOT wired into run-test-suite.sh or any other runner by this lane — see scripts/_archive/README.md /
// docs/inventories/shared-dataset-ownership.md for why (sunset lane's write set forbids touching either).
//
// WHAT THIS PROVES: every file under scripts/ and src/ that WRITES one of the shared datasets named in
// docs/inventories/shared-dataset-ownership.md's SHARED_WRITER_ALLOWLIST (the fenced ```json block — this
// file and that doc share ONE source of truth, parsed here verbatim, never hand-copied) is a file that
// block explicitly names. A write from anywhere else is either an undocumented new owner (register it,
// with a justification, in the doc's allowlist) or a stale/dead writer that should have been archived
// (git mv it to scripts/_archive/** per the sunset lane's evidence gate).
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
// A file is flagged only when the TABLE NAME matched is one of the doc's registered shared tables — a
// write to an unrelated, non-shared table (e.g. agent_runs, sources, holdings_quality) is out of this
// registry's scope by design (see the doc's "Open leaks summary" for why a couple of those were
// deliberately left unregistered rather than padded into the allowlist).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, ".."); // fsi-app/
const DOC_PATH = resolve(ROOT, "docs/inventories/shared-dataset-ownership.md");

// ---------------------------------------------------------------------------------------------------
// 1. Parse the allowlist out of the doc's fenced ```json block. ONE source of truth — this file never
//    hand-maintains a second copy of who-may-write-what.
// ---------------------------------------------------------------------------------------------------
export function parseAllowlist(docText) {
  const m = docText.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  if (!m) {
    throw new Error(
      `shared-writer-registry: could not find a fenced \`\`\`json block in ${DOC_PATH} — the allowlist ` +
      `must live there (see the doc's "Machine-readable allowlist" section).`,
    );
  }
  const parsed = JSON.parse(m[1]);
  if (!parsed || typeof parsed !== "object" || typeof parsed.sharedTables !== "object" || parsed.sharedTables === null) {
    throw new Error(`shared-writer-registry: parsed JSON block has no "sharedTables" object — got: ${m[1].slice(0, 200)}`);
  }
  return parsed.sharedTables;
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
const GUARDED_RE = /\b(?:guardedInsertMany|guardedInsert|guardedUpdate|guardedDelete|archiveRows)\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g;
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
// The test.
// ---------------------------------------------------------------------------------------------------
test("every shared-dataset writer under scripts/ and src/ is registered in the ownership allowlist", () => {
  const docText = readFileSync(DOC_PATH, "utf8");
  const sharedTables = parseAllowlist(docText);
  assert.ok(
    Object.keys(sharedTables).length > 0,
    "shared-writer-registry: SHARED_WRITER_ALLOWLIST parsed to zero tables — the doc's json block is empty or malformed.",
  );

  const files = walkScanFiles(ROOT);
  assert.ok(files.length > 0, "shared-writer-registry: scan found zero candidate files under scripts/ or src/ — check SCAN_ROOTS/ROOT resolution.");

  const violations = scanForViolations(ROOT, sharedTables, files);

  if (violations.length > 0) {
    const lines = violations
      .map((v) => `  - ${v.file} writes "${v.table}" but is not listed under sharedTables["${v.table}"] in ${relative(ROOT, DOC_PATH)}`)
      .join("\n");
    assert.fail(
      `${violations.length} unregistered shared-dataset writer(s) found:\n${lines}\n\n` +
      `FIX: either (1) this is a legitimate new writer — add its path to sharedTables["<table>"] in the ` +
      `fenced json block of ${relative(ROOT, DOC_PATH)}, with a one-line justification in that doc's prose ` +
      `next to it; or (2) this is a stale/dead writer — git mv it to scripts/_archive/<original-subpath> ` +
      `(content untouched) and add a tombstone line to scripts/_archive/README.md, per the sunset lane's ` +
      `evidence gate (zero live inbound references AND superseded-or-completed).`,
    );
  }
});
