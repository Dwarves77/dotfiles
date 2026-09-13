// Tests for context.mjs's added-lines capability (built for rule 022, a rule that must distinguish
// an ADDED line from an unchanged/context line, which the pre-existing ctx.getFileContent /
// ctx.stagedFiles numstat data cannot do). Run: node --test fsi-app/.discipline/lib/context.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContextFromFixture, parseAddedLineTexts } from './context.mjs';

// ---------------------------------------------------------------------------
// parseAddedLineTexts, pure unified-diff parsing
// ---------------------------------------------------------------------------

test('parseAddedLineTexts: extracts only + lines, strips the marker', () => {
  const diff = [
    'diff --git a/foo.mjs b/foo.mjs',
    'index 1111111..2222222 100644',
    '--- a/foo.mjs',
    '+++ b/foo.mjs',
    '@@ -1,2 +1,3 @@',
    ' const a = 1;',
    '-const b = 2;',
    '+const b = 3;',
    '+const c = 4;',
  ].join('\n');
  assert.deepEqual(parseAddedLineTexts(diff), ['const b = 3;', 'const c = 4;']);
});

test('parseAddedLineTexts: excludes +++/--- file-header lines', () => {
  const diff = '--- a/x.mjs\n+++ b/x.mjs\n@@ -0,0 +1 @@\n+hello\n';
  assert.deepEqual(parseAddedLineTexts(diff), ['hello']);
});

test('parseAddedLineTexts: empty diff yields empty array', () => {
  assert.deepEqual(parseAddedLineTexts(''), []);
  assert.deepEqual(parseAddedLineTexts(null), []);
  assert.deepEqual(parseAddedLineTexts(undefined), []);
});

// ---------------------------------------------------------------------------
// ctx.getAddedLines, fixture injection
// ---------------------------------------------------------------------------

test('getAddedLines: returns the injected array for a path present in addedLines', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 2, deletions: 0 }],
    addedLines: { 'fsi-app/src/foo.ts': ['const a = 1;', 'const b = 2;'] },
  });
  assert.deepEqual(ctx.getAddedLines('fsi-app/src/foo.ts'), ['const a = 1;', 'const b = 2;']);
});

test('getAddedLines: returns [] for a path absent from addedLines (fixture mode never falls back to git)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 2, deletions: 0 }],
    addedLines: { 'fsi-app/src/other.ts': ['x'] },
  });
  assert.deepEqual(ctx.getAddedLines('fsi-app/src/foo.ts'), []);
});

test('getAddedLines: returns [] when addedLines was never supplied to the fixture', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 2, deletions: 0 }],
  });
  assert.deepEqual(ctx.getAddedLines('fsi-app/src/foo.ts'), []);
});
