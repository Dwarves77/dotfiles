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

test('fitnessFunction.enumerate(): runs against the live tree without throwing and returns an array', () => {
  const files = fitnessFunction.enumerate();
  assert.ok(Array.isArray(files));
  assert.ok(files.length > 0);
  // never includes a test/story file
  assert.ok(files.every((f) => !f.includes('.test.') && !f.includes('.npmtest.') && !f.includes('.stories.')));
});

test('fitnessFunction: SANCTIONED_DIR_PREFIX is exactly the propagation directory', () => {
  assert.equal(SANCTIONED_DIR_PREFIX, 'fsi-app/src/lib/propagation/');
});
