// Fire-tests for F31 (derived values gate). Behavioural, F21/F30 style: derivedValuesReadLines/isSanctioned
// are exercised against CONSTRUCTED content and paths, never only the live tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SANCTIONED_DIR_PREFIX,
  DERIVED_VALUES_FROM_RE,
  isSanctioned,
  derivedValuesReadLines,
  fitnessFunction,
} from './F31-derived-values-gate.mjs';

test('isSanctioned: true for any file under src/lib/propagation/, false outside it', () => {
  assert.equal(isSanctioned('fsi-app/src/lib/propagation/drain.ts'), true);
  assert.equal(isSanctioned('fsi-app/src/lib/propagation/methods/index.ts'), true);
  assert.equal(isSanctioned('fsi-app/src/lib/entities/decisions.mjs'), false);
  assert.equal(isSanctioned('fsi-app/scripts/turns/run-propagation-drain.mjs'), false);
});

test('DERIVED_VALUES_FROM_RE: matches .from("derived_values") in any quote style', () => {
  assert.match('sb.from("derived_values").select("*")', DERIVED_VALUES_FROM_RE);
  assert.match("sb.from('derived_values').select('*')", DERIVED_VALUES_FROM_RE);
  assert.match('sb.from(`derived_values`).select(`*`)', DERIVED_VALUES_FROM_RE);
});

test('DERIVED_VALUES_FROM_RE: does NOT match the sanctioned view derived_values_admissible', () => {
  assert.doesNotMatch('sb.from("derived_values_admissible").select("*")', DERIVED_VALUES_FROM_RE);
});

test('DERIVED_VALUES_FROM_RE: does NOT match an unrelated table whose name merely contains the substring', () => {
  assert.doesNotMatch('sb.from("legacy_derived_values_archive").select("*")', DERIVED_VALUES_FROM_RE);
});

test('derivedValuesReadLines: finds a real .from("derived_values") call site and its line number', () => {
  const content = 'const x = 1;\nconst rows = await sb.from("derived_values").select("*");\n';
  assert.deepEqual(derivedValuesReadLines(content), [2]);
});

test('derivedValuesReadLines: ignores the SAME text inside a comment', () => {
  const content = '// old: sb.from("derived_values") is no longer allowed here\nconst y = 2;';
  assert.deepEqual(derivedValuesReadLines(content), []);
});

test('derivedValuesReadLines: an overridden line is skipped', () => {
  const content = 'const rows = await sb.from("derived_values").select("*"); // fitness-allow: F31 (audited migration script)';
  assert.deepEqual(derivedValuesReadLines(content), []);
});

test('derivedValuesReadLines: multiple occurrences across lines are all found', () => {
  const content = [
    'a();',
    'sb.from("derived_values").select("*");',
    'b();',
    "sb.from('derived_values').select('*');",
  ].join('\n');
  assert.deepEqual(derivedValuesReadLines(content), [2, 4]);
});

// ── fitnessFunction shape ────────────────────────────────────────────────────────────────────────────

test('fitnessFunction: id F31, per-file check', () => {
  assert.equal(fitnessFunction.id, 'F31');
  assert.equal(fitnessFunction.name, 'derived-values-gate');
  assert.equal(typeof fitnessFunction.check, 'function');
  assert.equal(fitnessFunction.check.length, 2); // (filepath, content)
});

test('fitnessFunction.check(): a sanctioned file (inside src/lib/propagation/) is never flagged, even with a raw read', () => {
  const problems = fitnessFunction.check(
    'fsi-app/src/lib/propagation/drain.ts',
    'sb.from("derived_values").select("*")',
  );
  assert.deepEqual(problems, []);
});

test('fitnessFunction.check(): an UNSANCTIONED file with a raw read is flagged, naming the fix', () => {
  const problems = fitnessFunction.check(
    'fsi-app/src/app/api/some-route/route.ts',
    'const rows = await sb.from("derived_values").select("*");',
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /derived_values_admissible/);
  assert.match(problems[0].message, /admissibleFor/);
});

test('fitnessFunction.check(): an unsanctioned file with NO raw read passes clean', () => {
  const problems = fitnessFunction.check(
    'fsi-app/src/app/api/some-route/route.ts',
    'const rows = await sb.from("derived_values_admissible").select("*");',
  );
  assert.deepEqual(problems, []);
});

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('fitnessFunction.enumerate(): runs against the live tree without throwing and returns an array', LIVE_TREE, () => {
  const files = fitnessFunction.enumerate();
  assert.ok(Array.isArray(files));
  assert.ok(files.length > 0);
  // never includes a test/story file
  assert.ok(files.every((f) => !f.includes('.test.') && !f.includes('.npmtest.') && !f.includes('.stories.')));
});

test('fitnessFunction: SANCTIONED_DIR_PREFIX is exactly the propagation directory', () => {
  assert.equal(SANCTIONED_DIR_PREFIX, 'fsi-app/src/lib/propagation/');
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----

test('F31 B5-08: .from( and the table name on separate lines is the same read', () => {
  const src = 'await sb\n  .from(\n    "derived_values"\n  )\n  .select("*");';
  assert.equal(derivedValuesReadLines(src).length, 1);
});

test('F31 B5-09: the table name through a constant is the same read', () => {
  const src = 'const T = "derived_values";\nawait sb.from(T).select("*");';
  assert.equal(derivedValuesReadLines(src).length, 1);
});

test('F31 B5-11: a raw SQL select from derived_values through a pg client is a read; the admissible view is not', () => {
  assert.equal(derivedValuesReadLines('await pg.query("SELECT * FROM derived_values WHERE x = 1");').length, 1);
  assert.equal(derivedValuesReadLines('await pg.query("SELECT * FROM derived_values_admissible");').length, 0);
});

test('F31 B5-12: a forged override marker inside a string is not an override', () => {
  const src = 'const m = "// fitness-allow: F31 (forged)"; await sb.from("derived_values").select("*");';
  assert.equal(derivedValuesReadLines(src).length, 1);
});

test('F31 B5-13: a read in a script written as .ts and in src as .cjs is enumerated', () => {
  const src = fitnessFunction.enumerate.toString();
  assert.match(src, /cjs/);
  assert.match(src, /ts\]?\}|\bts\b/);
});

test('F31: a comment that mentions the read, and a real trailing marker, behave', () => {
  assert.equal(derivedValuesReadLines('// await sb.from("derived_values").select("*");').length, 0);
  assert.equal(derivedValuesReadLines('await sb.from("derived_values").select("*"); // fitness-allow: F31 (admin backfill)').length, 0);
});
