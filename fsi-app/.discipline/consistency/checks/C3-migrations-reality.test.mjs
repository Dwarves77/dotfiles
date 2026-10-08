// Proves C3 (migrations.md reality, plan 6.8 Rule A, lane N5): passes GREEN against the live tree, and
// actually CATCHES both shapes of drift it exists to catch (rule 15: proven by attack, not by presence).
//
// ISOLATION (lane GATE-5, 2026-10-08). The negative cases used to write a throwaway migration file into
// the REAL fsi-app/supabase/migrations/ directory (and hand-edit the real docs/inventories/migrations.md)
// for the length of each test. The discipline suite runs test files concurrently, and F64's live test
// enumerates that same directory and reads every file in it: a fixture present at readdir time and gone at
// read time fails F64 with ENOENT (1 failure in 3 runs on unchanged master, DEAD-1 session log). The
// negative cases now run C3 against a throwaway COPY under the OS temp directory through C3's injected
// `migDir` / `docPath`; the real tree is only ever read. The last test replays the original race: this
// file and F64's live test run concurrently ten times while an observer polls the real tree, and it fails
// if the fixture name ever appears in the real migrations directory or the real page changes.
//
// Run: node --test fsi-app/.discipline/consistency/checks/C3-migrations-reality.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRepoRoot } from '../../lib/context.mjs';
import { consistencyCheck } from './C3-migrations-reality.mjs';
import { MIG_DIR_REL, DOC_PATH_REL } from '../../../scripts/inventories/generate-migrations-inventory.mjs';

const ROOT = getRepoRoot();
const REAL_MIG_DIR = resolve(ROOT, MIG_DIR_REL);
const REAL_DOC_PATH = resolve(ROOT, DOC_PATH_REL);
// A number no real migration uses (the corpus tops out in the 370s as of this writing) and a name that
// sorts and reads unmistakably as a throwaway fixture, never mistaken for a real migration.
const FIXTURE_FILE = '999999_c3_test_fixture_never_committed.sql';

// A private copy of the migrations directory and the page, in the OS temp directory. Returns the injected
// paths C3 takes and a cleanup.
function tempTree() {
  const dir = mkdtempSync(join(tmpdir(), 'c3-test-'));
  const migDir = join(dir, 'migrations');
  const docPath = join(dir, 'migrations.md');
  cpSync(REAL_MIG_DIR, migDir, { recursive: true });
  mkdirSync(dirname(docPath), { recursive: true });
  cpSync(REAL_DOC_PATH, docPath);
  return { migDir, docPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('C3 passes GREEN against the live tree', () => {
  const drifts = consistencyCheck.run();
  assert.deepEqual(drifts, [], `C3 found drift on the live tree:\n${drifts.map((d) => '  - ' + d.detail).join('\n')}`);
});

test('C3 passes GREEN against an unmodified copy of the live tree through the injected paths', () => {
  const t = tempTree();
  try {
    assert.deepEqual(consistencyCheck.run({ migDir: t.migDir, docPath: t.docPath }), []);
  } finally { t.cleanup(); }
});

test('NEGATIVE (well-formedness): a migration file with no "-- subject:" line is caught, naming the file', () => {
  const t = tempTree();
  try {
    const fixture = join(t.migDir, FIXTURE_FILE);
    writeFileSync(fixture, '-- just a plain comment, no subject line\nSELECT 1;\n');
    const drifts = consistencyCheck.run({ migDir: t.migDir, docPath: t.docPath });
    assert.ok(
      drifts.some((d) => d.kind === 'malformed' && d.location === `${MIG_DIR_REL}/${FIXTURE_FILE}`),
      `expected a malformed-subject-line drift naming ${FIXTURE_FILE}, got: ${JSON.stringify(drifts)}`,
    );
    // Remove the fixture: C3 is GREEN again (the RED was the fixture, not a leak).
    rmSync(fixture);
    assert.deepEqual(consistencyCheck.run({ migDir: t.migDir, docPath: t.docPath }), []);
  } finally { t.cleanup(); }
  assert.equal(existsSync(join(REAL_MIG_DIR, FIXTURE_FILE)), false, 'the real migrations directory was never touched');
});

test('NEGATIVE (parity): a well-formed new migration with no matching table row is caught as stale-status', () => {
  const t = tempTree();
  try {
    const fixture = join(t.migDir, FIXTURE_FILE);
    writeFileSync(fixture, '-- subject: A fixture migration C3 must catch as missing from the page\nSELECT 1;\n');
    const drifts = consistencyCheck.run({ migDir: t.migDir, docPath: t.docPath });
    assert.ok(
      drifts.some((d) => d.kind === 'stale-status' && d.location === DOC_PATH_REL),
      `expected a stale-status parity drift naming ${DOC_PATH_REL}, got: ${JSON.stringify(drifts)}`,
    );
    rmSync(fixture);
    assert.deepEqual(consistencyCheck.run({ migDir: t.migDir, docPath: t.docPath }), []);
  } finally { t.cleanup(); }
  assert.equal(existsSync(join(REAL_MIG_DIR, FIXTURE_FILE)), false, 'the real migrations directory was never touched');
});

test('NEGATIVE (parity): editing the committed page without regenerating it is caught', () => {
  const realBefore = readFileSync(REAL_DOC_PATH, 'utf8');
  const t = tempTree();
  try {
    const before = readFileSync(t.docPath, 'utf8');
    writeFileSync(t.docPath, before.replace('# Migrations Inventory', '# Migrations Inventory (hand-edited)'));
    const drifts = consistencyCheck.run({ migDir: t.migDir, docPath: t.docPath });
    assert.ok(
      drifts.some((d) => d.kind === 'stale-status' && d.location === DOC_PATH_REL),
      `expected a stale-status parity drift after a hand edit, got: ${JSON.stringify(drifts)}`,
    );
    writeFileSync(t.docPath, before);
    assert.deepEqual(consistencyCheck.run({ migDir: t.migDir, docPath: t.docPath }), []);
  } finally { t.cleanup(); }
  assert.equal(readFileSync(REAL_DOC_PATH, 'utf8'), realBefore, 'the real page was never touched');
});

// ---------------------------------------------------------------------------
// The race itself: C3's test and F64's live test, concurrently, ten times.
// ---------------------------------------------------------------------------
// A small runner, not a module. Each round starts this file (the child skips this test through the guard
// variable, so it does not recurse) and F64's test file at the same moment, while the parent polls the REAL
// migrations directory and the REAL page every millisecond. Against the pre-fix C3 test the observer sees
// the fixture appear in the real directory (deterministic), and F64 fails intermittently with ENOENT;
// against this file neither happens.
const GUARD = 'C3_RACE_CHILD';
const ROUNDS = 10;
const F64_TEST = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fitness', 'functions', 'F64-rls-admin-gate-class.test.mjs');
const SELF = fileURLToPath(import.meta.url);

// NODE_TEST_CONTEXT is removed from the child's environment: inside a `node --test` run it is set, and a
// nested `node --test` that inherits it behaves as a reporter child and runs nothing (the first version of
// this runner went green in under a second for ten rounds that take about 3.5 s each).
function runNodeTest(file) {
  return new Promise((done) => {
    const env = { ...process.env, [GUARD]: '1' };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['--test', file], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => done({ code, out }));
  });
}

test('RACE: C3 and F64 live tests run concurrently ten times with zero failures, and C3 never touches the real tree', { skip: process.env[GUARD] ? 'child of the race runner' : false, timeout: 300000 }, async () => {
  const realDocBefore = readFileSync(REAL_DOC_PATH, 'utf8');
  const realListingBefore = readdirSync(REAL_MIG_DIR).sort().join('\n');
  const sightings = [];
  let polling = true;
  const poll = setInterval(() => {
    if (!polling) return;
    try {
      const names = readdirSync(REAL_MIG_DIR);
      if (names.includes(FIXTURE_FILE)) sightings.push(`fixture ${FIXTURE_FILE} present in the real migrations directory`);
      if (readFileSync(REAL_DOC_PATH, 'utf8') !== realDocBefore) sightings.push('real migrations.md content changed');
    } catch (e) {
      sightings.push(`real tree unreadable: ${e.message}`);
    }
  }, 1);

  const failures = [];
  try {
    for (let round = 1; round <= ROUNDS; round++) {
      const [c3, f64] = await Promise.all([runNodeTest(SELF), runNodeTest(F64_TEST)]);
      for (const [label, r] of [['C3', c3], ['F64', f64]]) {
        if (!/^ℹ pass [1-9]/m.test(r.out)) failures.push(`round ${round}: ${label} child ran no passing tests
${r.out.slice(-500)}`);
      }
      if (c3.code !== 0) failures.push(`round ${round}: C3 test exited ${c3.code}\n${c3.out.slice(-2000)}`);
      if (f64.code !== 0) failures.push(`round ${round}: F64 test exited ${f64.code}\n${f64.out.slice(-2000)}`);
    }
  } finally {
    polling = false;
    clearInterval(poll);
  }
  assert.deepEqual(failures, [], `${failures.length} failing run(s) across ${ROUNDS} rounds`);
  assert.deepEqual(sightings, [], 'the C3 test touched the real migrations directory or page');
  assert.equal(readdirSync(REAL_MIG_DIR).sort().join('\n'), realListingBefore, 'the real migrations directory listing is unchanged');
});
