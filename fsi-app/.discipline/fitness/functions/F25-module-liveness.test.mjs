// Fire-tests for F25 (module liveness).
// Run: node --test fsi-app/.discipline/fitness/functions/F25-module-liveness.test.mjs
//
// Behavioural, in the F15/F22/F23/F24 style: the graph builder and the comparator are driven with a
// CONSTRUCTED file tree, never the live repo. A gate tested only against the current repo degrades into
// re-asserting whatever the repo happens to contain and stops being able to state what the rule IS.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImportGraph,
  findUnimported,
  auditLiveness,
  resolveSpecifier,
  isTestFile,
  fitnessFunction,
  LEGACY_ALLOWLIST,
} from './F25-module-liveness.mjs';


// FIXTURE CONSTRUCTION (same convention as F22's test, and for the same reason). These tests need
// fixture text that LOOKS like an aliased import. `.discipline/glob-portability.test.mjs` scans every
// discipline test for bare-package specifiers — they pass locally and ERR_MODULE_NOT_FOUND in the
// no-npm CI job — and it matches on the specifier itself, so `@/…` in a fixture string reads as a bare
// package import of this very file. Both the keyword and the alias are split so the scanner sees
// neither. The gate is right; writing the fixture literally is what was wrong.
const ALIAS = (rest) => '@' + rest;
const IMPORT_OF = (spec) => 'im' + 'port { z } fr' + 'om "' + spec + '";';
const DYNIMPORT_OF = (spec) => 'const m = await im' + 'port("' + spec + '");';

const EMPTY = new Map();
const NO_MANIFEST = new Set();

/** Build a fake tree: { path: contents }. */
function tree(map) {
  const files = Object.keys(map);
  return { files, read: (f) => map[f] };
}

// ── resolution ──────────────────────────────────────────────────────────────

test('resolves the @/ tsconfig alias to fsi-app/src', () => {
  const tracked = new Set(['fsi-app/src/lib/x.ts']);
  assert.equal(resolveSpecifier(ALIAS('/lib/x'), 'fsi-app/src/app/page.tsx', tracked), 'fsi-app/src/lib/x.ts');
});

test('resolves a relative specifier and tries the real extension list', () => {
  const tracked = new Set(['fsi-app/src/lib/y.mjs']);
  assert.equal(resolveSpecifier('./y.mjs', 'fsi-app/src/lib/z.mjs', tracked), 'fsi-app/src/lib/y.mjs');
  assert.equal(resolveSpecifier('./y', 'fsi-app/src/lib/z.mjs', tracked), 'fsi-app/src/lib/y.mjs');
});

test('resolves a barrel directory import to its index file', () => {
  const tracked = new Set(['fsi-app/src/data/index.ts']);
  assert.equal(resolveSpecifier(ALIAS('/data'), 'fsi-app/src/lib/a.ts', tracked), 'fsi-app/src/data/index.ts');
});

test('a bare package specifier resolves to nothing (external)', () => {
  assert.equal(resolveSpecifier('react', 'fsi-app/src/a.tsx', new Set()), null);
});

// The precision that motivated using a graph instead of basename matching: two files with the same
// basename in different directories must never be confused for one another.
test('same-basename modules in different directories are NOT conflated', () => {
  const t = tree({
    'fsi-app/src/lib/verification.ts': 'export const a = 1;',
    'fsi-app/src/lib/sources/verification.ts': 'export const b = 2;',
    'fsi-app/src/app/page.tsx': IMPORT_OF(ALIAS('/lib/sources/verification')),
  });
  const g = buildImportGraph(t.files, t.read);
  assert.equal(g.has('fsi-app/src/lib/verification.ts'), false, 'the helper is NOT imported');
  assert.ok(g.get('fsi-app/src/lib/sources/verification.ts').has('fsi-app/src/app/page.tsx'));
});

test('a dynamic await import() counts as a real importer', () => {
  const t = tree({
    'fsi-app/src/lib/lazy.ts': 'export const x = 1;',
    'fsi-app/src/app/route.ts': DYNIMPORT_OF(ALIAS('/lib/lazy')),
  });
  const g = buildImportGraph(t.files, t.read);
  assert.ok(g.get('fsi-app/src/lib/lazy.ts').has('fsi-app/src/app/route.ts'));
});

// ── liveness ────────────────────────────────────────────────────────────────

test('a module imported only by its own test is UNIMPORTED (the seek-more shape)', () => {
  const t = tree({
    'fsi-app/src/lib/dormant.mjs': 'export const f = 1;',
    'fsi-app/src/lib/dormant.selftest.mjs': 'import { f } from "./dormant.mjs";',
  });
  const g = buildImportGraph(t.files, t.read);
  assert.deepEqual(findUnimported(['fsi-app/src/lib/dormant.mjs'], g, NO_MANIFEST), ['fsi-app/src/lib/dormant.mjs']);
});

test('a module imported by production code is LIVE', () => {
  const t = tree({
    'fsi-app/src/lib/live.mjs': 'export const f = 1;',
    'fsi-app/src/app/page.tsx': IMPORT_OF(ALIAS('/lib/live')),
  });
  const g = buildImportGraph(t.files, t.read);
  assert.deepEqual(findUnimported(['fsi-app/src/lib/live.mjs'], g, NO_MANIFEST), []);
});

// A dead-manifest script is scheduled for deletion, so its reference cannot keep a module alive —
// otherwise the sweep would silently turn a "live" module into an orphan with no gate noticing.
test('an importer on the dead-code manifest does NOT keep a module alive', () => {
  const t = tree({
    'fsi-app/src/lib/soon-dead.mjs': 'export const f = 1;',
    'fsi-app/scripts/one-shot.mjs': 'import { f } from "../src/lib/soon-dead.mjs";',
  });
  const g = buildImportGraph(t.files, t.read);
  const manifest = new Set(['fsi-app/scripts/one-shot.mjs']);
  assert.deepEqual(findUnimported(['fsi-app/src/lib/soon-dead.mjs'], g, manifest), ['fsi-app/src/lib/soon-dead.mjs']);
});

test('test-file detection covers test / selftest / npmtest / golden / __tests__', () => {
  assert.ok(isTestFile('a/b.test.mjs'));
  assert.ok(isTestFile('a/b.selftest.mjs'));
  assert.ok(isTestFile('a/b.npmtest.mjs'));
  assert.ok(isTestFile('a/b.golden.mjs'));
  assert.ok(isTestFile('a/__tests__/b.ts'));
  assert.equal(isTestFile('a/b.mjs'), false);
});

// ── the comparator ──────────────────────────────────────────────────────────

test('an unimported module with no allowlist entry is RED', () => {
  const problems = auditLiveness(['fsi-app/src/lib/x.mjs'], ['fsi-app/src/lib/x.mjs'], EMPTY);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /UNWIRED MODULE/);
  assert.match(problems[0], /x\.mjs/);
});

test('an unimported module WITH an allowlist entry passes', () => {
  const allow = new Map([['fsi-app/src/lib/x.mjs', { file: 'fsi-app/src/lib/x.mjs', reason: 'r', reviewByPhase: 'p' }]]);
  assert.deepEqual(auditLiveness(['fsi-app/src/lib/x.mjs'], ['fsi-app/src/lib/x.mjs'], allow), []);
});

// The half that makes it shrink rather than grandfather.
test('an allowlist entry whose module GAINED an importer is RED (stale)', () => {
  const allow = new Map([['fsi-app/src/lib/x.mjs', { file: 'fsi-app/src/lib/x.mjs', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditLiveness([], ['fsi-app/src/lib/x.mjs'], allow);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /now HAS a production importer/);
});

test('an allowlist entry whose file was deleted is RED (stale)', () => {
  const allow = new Map([['fsi-app/src/lib/gone.mjs', { file: 'fsi-app/src/lib/gone.mjs', reason: 'r', reviewByPhase: 'p' }]]);
  const problems = auditLiveness([], [], allow, () => false);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no longer exists/);
});

test('an allowlist entry without reason + reviewByPhase is RED', () => {
  const allow = new Map([['fsi-app/src/lib/x.mjs', { file: 'fsi-app/src/lib/x.mjs', reason: 'r' }]]);
  const problems = auditLiveness(['fsi-app/src/lib/x.mjs'], ['fsi-app/src/lib/x.mjs'], allow);
  assert.ok(problems.some((p) => /ALLOWLIST ENTRY WITHOUT A REASON/.test(p)));
});

// ── shape + the shipped list ────────────────────────────────────────────────

test('F25 is holistic: one sentinel so the graph is built exactly once', () => {
  assert.equal(fitnessFunction.enumerate().length, 1);
});

test('every shipped allowlist entry carries a reason and a reviewByPhase', () => {
  assert.ok(LEGACY_ALLOWLIST.length > 0, 'the allowlist is explicit, not empty');
  assert.ok(LEGACY_ALLOWLIST.every((e) => e.file && e.reason && e.reviewByPhase));
});

test('the shipped allowlist has no duplicate files', () => {
  const files = LEGACY_ALLOWLIST.map((e) => e.file);
  assert.equal(new Set(files).size, files.length);
});

// proxy.ts is the Next 16 middleware entry point and gates auth for the whole app. If it ever appears on
// this allowlist, the entry-point list has regressed and the gate is one step from inviting its deletion.
test('framework entry points are never allowlisted (they are excluded by convention, not by exemption)', () => {
  const files = LEGACY_ALLOWLIST.map((e) => e.file);
  for (const f of files) {
    assert.doesNotMatch(
      f,
      /\/(?:page|layout|route|middleware|proxy|instrumentation)\.(?:ts|tsx|mjs)$/,
      `${f} is a framework entry point — it belongs in ENTRY_BASENAMES, not in the allowlist`,
    );
  }
});
