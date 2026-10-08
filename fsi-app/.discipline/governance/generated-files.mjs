// Generated-files registry (lane RULES-1, 2026-10-07, operator ruling: a gate that misfires is fixed at
// the gate, not routed around).
//
// WHY. F51 check 5 refuses a file that two lanes edit while both are open, because a hand edit to a
// shared file conflicts on rebase. A GENERATED file is not a hand edit: every migration lane regenerates
// docs/inventories/migrations.md (and the coverage report) with its generator, and two lanes that each
// regenerate honestly always differ textually, so check 5 forced four re-cuts on 2026-10-07 for work that
// no human edited. The harm check 5 names is a conflicting HAND edit; a copy that equals its generator's
// output has none.
//
// THE RULE (one place, here). A file is exempt from check 5 when BOTH hold:
//   1. it is listed in GENERATED_FILES below, each entry naming the generator script that produces it;
//   2. the committed copy equals what that generator prints NOW, on the tree being checked (the merged
//      tree in CI). checkGeneratedFile() runs the generator and compares; a hand-edited copy, a stale
//      copy, a generator that fails and a missing file are all NOT exempt (fail closed), and the reason
//      names the generator to rerun.
// The generator is run read-only: it prints to stdout, the check compares that text with the file on disk,
// and nothing is written into the tree (no temp copy of the tree is needed, and none can be left behind).
//
// SOURCE 'tree' vs 'live'. A 'tree' entry is a pure function of the checked-out tree, so the equality in
// rule 2 is checkable offline. A 'live' entry (db-check-constraints.json is read from pg_constraint and
// stamped with a generation time) cannot be reproduced without the live database, so the equality cannot
// be shown: it is LISTED so the generator is named and the decision is explicit, but it is never exempt.
// applied-migrations.json (a hand step exporting the Supabase MCP list_migrations result) is the same
// class and has no generator script on master yet; its entry is added with the lane that adds the script.
//
// WHAT THIS DOES NOT EXEMPT. Prose a generator carries through (the footer of migrations.md is kept
// verbatim by its generator) is equal by construction and stays hand-authored; a non-generated shared file
// is still refused exactly as before. Entries change only when a NEW generated file kind appears, never
// per lane, so this list is not an append hotspot. node: builtins only (F51 is loaded by every fitness
// run, and coverage-scan.mjs is run in a child process, never imported here, so there is no import cycle
// through execution-wiring and the fitness manifest).

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** @typedef {{ path: string, generator: string, source: 'tree'|'live', args?: string[],
 *             argv?: (root: string) => string[], why?: string }} GeneratedEntry */

/** @type {GeneratedEntry[]} */
export const GENERATED_FILES = [
  {
    path: 'docs/inventories/migrations.md',
    generator: 'fsi-app/scripts/inventories/generate-migrations-inventory.mjs',
    source: 'tree', // with no --write it prints the page to stdout (its documented dry mode)
  },
  {
    path: 'fsi-app/.discipline/governance/coverage-report.json',
    generator: 'fsi-app/.discipline/governance/coverage-scan.mjs',
    source: 'tree',
    // The scan's CLI writes the report in place and has no print mode, so the same pure function the CLI
    // calls is run in a child process and serialised exactly as the CLI serialises it.
    argv: (root) => [
      '--input-type=module', '-e',
      `import { runCoverageScan } from ${JSON.stringify(pathToFileURL(join(root, 'fsi-app/.discipline/governance/coverage-scan.mjs')).href)}; ` +
      'process.stdout.write(JSON.stringify(runCoverageScan(), null, 2));',
    ],
  },
  {
    path: 'fsi-app/docs/inventories/db-check-constraints.json',
    generator: 'fsi-app/scripts/maintenance/schema-vocabulary-inventory.mjs',
    source: 'live',
    why: 'read from pg_constraint on the live database and stamped with a generation time; the maintenance workflow commits it',
  },
];

export function findGeneratedEntry(path, entries = GENERATED_FILES) {
  const p = String(path).replace(/\\/g, '/');
  return entries.find((e) => e.path === p) ?? null;
}

function defaultRun(argv, cwd) {
  return execFileSync(process.execPath, argv, {
    cwd, encoding: 'utf8', maxBuffer: 1 << 27, timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function defaultRead(abs) {
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

const lf = (s) => String(s).replace(/\r\n/g, '\n');

/** What the entry's generator prints now, run from `root`. Throws if the generator fails. */
export function renderGenerated(root, entry, { run = defaultRun } = {}) {
  const argv = entry.argv ? entry.argv(root) : [join(root, entry.generator), ...(entry.args ?? [])];
  return run(argv, root);
}

/**
 * Is `relPath` a generated file, and is its committed copy equal to its generator's output?
 * @returns {{ generated: false } | { generated: true, exempt: boolean, reason?: string, generator: string }}
 */
export function checkGeneratedFile(root, relPath, { entries = GENERATED_FILES, run = defaultRun, readFile = defaultRead } = {}) {
  const entry = findGeneratedEntry(relPath, entries);
  if (!entry) return { generated: false };
  const base = { generated: true, generator: entry.generator };
  if (entry.source === 'live') {
    return { ...base, exempt: false, reason: `generated from a live source (${entry.why ?? 'not reproducible offline'}), so its copy cannot be compared with the generator output here; it stays subject to check 5` };
  }
  const onDisk = readFile(join(root, entry.path));
  if (onDisk == null) return { ...base, exempt: false, reason: `the generated file ${entry.path} is missing from the tree; regenerate it with ${entry.generator}` };
  let fresh;
  try {
    fresh = renderGenerated(root, entry, { run });
  } catch (e) {
    return { ...base, exempt: false, reason: `generator failed (${entry.generator}): ${String(e?.message ?? e).split('\n')[0]}` };
  }
  if (lf(fresh) !== lf(onDisk)) {
    return { ...base, exempt: false, reason: `the committed copy does not equal the output of ${entry.generator} on this tree (hand-edited or stale); rerun the generator on the merged tree and commit its output` };
  }
  return { ...base, exempt: true };
}
