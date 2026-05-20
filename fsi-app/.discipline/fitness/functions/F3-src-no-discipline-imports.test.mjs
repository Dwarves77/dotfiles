// Tests for F3. Run: node --test fsi-app/.discipline/fitness/functions/F3-src-no-discipline-imports.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F3-src-no-discipline-imports.mjs';

test('F3: PASS for clean app code', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'import { bar } from "./bar";\nimport { baz } from "@/lib/baz";'
  );
  assert.deepEqual(violations, []);
});

test('F3: FAIL when es-module import references .discipline', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'import { runner } from "../../.discipline/runner.mjs";'
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /\.discipline/);
});

test('F3: FAIL when require() references .discipline', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'const x = require("fsi-app/.discipline/lib/result.mjs");'
  );
  assert.equal(violations.length, 1);
});

test('F3: FAIL when dynamic import() references .discipline', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'const mod = await import("fsi-app/.discipline/manifest.mjs");'
  );
  assert.equal(violations.length, 1);
});

test('F3: PASS when comment mentions .discipline (not actual import)', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    '// See fsi-app/.discipline/ for enforcement engine; do not import.'
  );
  assert.deepEqual(violations, []);
});

test('F3: PASS when override comment present', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'import { something } from "../../.discipline/lib/util.mjs"; // fitness-allow: F3 (transitional during ADR migration; tracked in OBS-XX)'
  );
  assert.deepEqual(violations, []);
});

test('F3: reports correct line numbers', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'line 1\nline 2\nimport { x } from "fsi-app/.discipline/runner.mjs";\nline 4'
  );
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 3);
});

test('F3: aggregates multiple violations in same file', () => {
  const violations = fitnessFunction.check(
    'fsi-app/src/lib/foo.ts',
    'import a from ".discipline/a";\nimport b from ".discipline/b";\nimport c from ".discipline/c";'
  );
  assert.equal(violations.length, 3);
});

test('F3: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F3');
  assert.equal(typeof fitnessFunction.name, 'string');
  assert.equal(typeof fitnessFunction.description, 'string');
  assert.ok(fitnessFunction.source.length > 0);
});
