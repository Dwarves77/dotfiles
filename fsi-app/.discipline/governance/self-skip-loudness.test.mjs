// Self-skips fail loud (lane TESTS-2, 2026-10-10; CF-GATE-7 of docs/audits/audit-consolidated-2026-09-30.md, owed by
// docs/ops/session-log.d/2026-10-01-r11-checks.md: "41 process.exit(2) self-skips and 16 DB/network-dependent test files are
// consistent with the documented self-skip convention but were not individually re-verified to fail loud rather than silently pass").
//
// The convention (CLAUDE.md rule 15): a verifier that cannot run without credentials or a network exits 2 with a stated reason,
// so a no-credential run is diagnosable and is never a false green. Re-verified here, over the REAL tree, three ways:
//   1. LOUD. Every `process.exit(2)` in a non-test .mjs under scripts/verify and .discipline is preceded, within eight lines, by
//      a statement that says why (console, stderr write or a log/say call). A silent exit 2 is indistinguishable from a crash.
//   2. NOT A PASS. The lane runners never read exit 2 as green: run-data-audit-lane.mjs counts any non-zero code (exit 2 and a
//      signal included) against a hard audit, and run-goldens.mjs fails a golden that skips without a reason and a run in which
//      every golden skipped (its own test, run-goldens.test.mjs, attacks both; pinned here at the source).
//   3. NO SILENT TEST PASS. No test file returns early from a test body because a credential, URL or client is missing (an early
//      return reports PASS for a test that asserted nothing); the honest forms are `{ skip: <reason> }` or asserting the exit 2.
// Each scanner is attacked on a synthetic file first (a silent exit, a comment mention, an early return), so a scanner that
// reads nothing cannot pass. Reads files only. Node built-ins and relative imports (the no-npm suite).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const FSI_APP = resolve(import.meta.dirname, '..', '..');

function walk(dir, keep, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '_archive' || name === 'fixtures' || name === 'fixtures-dash' || name === 'tmp') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, keep, out);
    else if (keep(name)) out.push(p);
  }
  return out;
}
const isTest = (n) => /\.(test|npmtest)\.mjs$/.test(n);
const isSource = (n) => n.endsWith('.mjs') && !isTest(n);

/** PURE. Lines of `text` that call process.exit(2) (not inside a line comment) with no explanation in the eight lines before. */
export function silentExitTwoSites(text) {
  const lines = text.split('\n');
  const out = [];
  lines.forEach((l, i) => {
    const code = l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    if (!/process\.exit\(2\)/.test(code)) return;
    const window = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
    if (!/console\.(error|log|warn)\(|process\.stderr\.write\(|\blog\(|\bsay\(|\becho\b/.test(window)) out.push(i + 1);
  });
  return out;
}

/** PURE. Test bodies that return early because something required is missing: `if (!<cred-ish>) { ... return }` inside a test. */
export function earlyReturnSkipSites(text) {
  const out = [];
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    if (!/^\s*if\s*\(\s*!\s*[\w.]*(creds?|credential|key|url|client|process\.env\.\w+|env\.\w+)\b[\w.]*\s*\)\s*(\{\s*)?(\/\/.*)?$/i.test(l) && !/^\s*if\s*\(\s*!\s*[\w.]*(creds?|credential|key|url|client|process\.env\.\w+|env\.\w+)\b[\w.]*\s*\)\s*\{?\s*return\b/i.test(l)) return;
    const next = lines.slice(i, i + 3).join('\n');
    if (/\breturn\s*;?\s*(\}|$)/m.test(next) || /\)\s*\{?\s*return\s*;/.test(l)) out.push(i + 1);
  });
  return out;
}

test('the exit-2 scanner flags a silent exit, passes a loud one, and ignores a comment that only mentions the call', () => {
  assert.deepEqual(silentExitTwoSites('const x = 1;\nif (!k) process.exit(2);\n'), [2]);
  assert.deepEqual(silentExitTwoSites('if (!k) {\n  console.error("no creds: cannot verify here (exit 2).");\n  process.exit(2);\n}\n'), []);
  assert.deepEqual(silentExitTwoSites('// a skip calls process.exit(2) when there are no credentials\n * A SKIP IS NOT A PASS: process.exit(2)ed\nconst y = 2;\n'), []);
  assert.deepEqual(silentExitTwoSites('const lines = 1;\n'.repeat(20) + 'process.exit(2);\n'), [21], 'an explanation more than eight lines away does not count');
});

test('the early-return scanner flags a test that returns when a credential is missing and passes the honest forms', () => {
  assert.equal(earlyReturnSkipSites('test("db", async () => {\n  if (!process.env.SUPABASE_KEY) return;\n  assert.ok(1);\n});\n').length, 1);
  assert.equal(earlyReturnSkipSites('test("db", async () => {\n  if (!client) {\n    return;\n  }\n});\n').length, 1);
  assert.equal(earlyReturnSkipSites('test("db", { skip: !process.env.SUPABASE_KEY && "no credentials" }, async () => {\n  assert.ok(1);\n});\n').length, 0);
  assert.equal(earlyReturnSkipSites('test("x", () => {\n  if (!rows.length) throw new Error("empty");\n});\n').length, 0);
});

const SOURCES = [...walk(join(FSI_APP, 'scripts', 'verify'), isSource), ...walk(join(FSI_APP, '.discipline'), isSource)];

test('the real tree has enough self-skip sites that an empty scan cannot pass (CF-GATE-7 counted 41; there are more now)', () => {
  const n = SOURCES.reduce((a, f) => a + (readFileSync(f, 'utf8').match(/process\.exit\(2\)/g) ?? []).length, 0);
  assert.ok(SOURCES.length > 100, `scanned only ${SOURCES.length} files`);
  assert.ok(n >= 41, `found only ${n} process.exit(2) sites`);
});

test('1. LOUD: every process.exit(2) in scripts/verify and .discipline says why within eight lines', () => {
  const quiet = [];
  for (const f of SOURCES) for (const line of silentExitTwoSites(readFileSync(f, 'utf8'))) quiet.push(`${relative(FSI_APP, f).replace(/\\/g, '/')}:${line}`);
  assert.deepEqual(quiet, [], `silent exit 2 sites:\n${quiet.join('\n')}`);
});

test('2. NOT A PASS: the data-audit lane counts exit 2 and a crash against a hard audit, and the goldens runner fails a reasonless skip', () => {
  const lane = readFileSync(join(FSI_APP, 'scripts', 'verify', 'run-data-audit-lane.mjs'), 'utf8');
  assert.match(lane, /const code = r\.status == null \? 2 : r\.status;/, 'a crash or signal is read as 2, not 0');
  assert.match(lane, /verdict: code === 0 \? "PASS" : code === 1 \? "FAIL" : "ERROR"/, 'only exit 0 is PASS');
  assert.match(lane, /const hardFailures = results\.filter\(\(r\) => r\.hard && r\.code !== 0\);/, 'any non-zero code fails a hard audit');
  assert.match(lane, /if \(hardFailures\.length\) \{[^\n]*process\.exit\(1\); \}/, 'a hard failure exits 1');
  const goldens = readFileSync(join(FSI_APP, 'scripts', 'verify', 'run-goldens.mjs'), 'utf8');
  assert.match(goldens, /A SKIP IS NOT A PASS/);
  assert.ok(readFileSync(join(FSI_APP, 'scripts', 'verify', 'run-goldens.test.mjs'), 'utf8').includes('FC-4: a golden that always exits 2 with no reason is a FAIL'), 'the goldens runner has its own attack on a reasonless skip');
});

test('3. NO SILENT TEST PASS: no test file returns early from a test body because a credential, url or client is missing', () => {
  const tests = [...walk(join(FSI_APP, 'scripts'), isTest), ...walk(join(FSI_APP, '.discipline'), isTest), ...walk(join(FSI_APP, 'src'), isTest)];
  assert.ok(tests.length > 300, `scanned only ${tests.length} test files`);
  const hits = [];
  for (const f of tests) {
    if (f.endsWith('self-skip-loudness.test.mjs')) continue;
    for (const line of earlyReturnSkipSites(readFileSync(f, 'utf8'))) hits.push(`${relative(FSI_APP, f).replace(/\\/g, '/')}:${line}`);
  }
  assert.deepEqual(hits, [], `early-return skips:\n${hits.join('\n')}`);
});
