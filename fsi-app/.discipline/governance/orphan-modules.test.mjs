// Fire-tests for orphan-modules.mjs (B1's Appendix A / Appendix B methods, mechanized).
// Run: node --test fsi-app/.discipline/governance/orphan-modules.test.mjs
//
// FIXTURE DISCIPLINE (same convention as F25-module-liveness.test.mjs, and the same reason): every test
// drives findOrphanModules()/findDeadExports() with a CONSTRUCTED file map, never the live repo. A check
// tested only against the current tree degrades into re-asserting whatever the repo happens to contain.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOrphanModules, findDeadExports } from './orphan-modules.mjs';

const IMPORT_OF = (spec) => 'im' + 'port { z } fr' + 'om "' + spec + '";';

/** listFilesFn honoring only the exact patterns this module actually asks for. */
function listOnly(map) {
  return (patterns) => patterns.flatMap((p) => map[p] ?? []);
}

const NO_WORKFLOWS = { '.github/workflows/*.yml': [] };

test('findOrphanModules: a module imported only by its own test is an orphan (Appendix A shape)', () => {
  const files = {
    'fsi-app/scripts/foo/bar.mjs': 'export const f = 1;',
    'fsi-app/scripts/foo/bar.test.mjs': IMPORT_OF('./bar.mjs'),
  };
  const list = listOnly({
    ...NO_WORKFLOWS,
    'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}': [],
    'fsi-app/scripts/**/*.{mjs,js}': Object.keys(files),
    'fsi-app/.discipline/**/*.mjs': [],
  });
  const orphans = findOrphanModules('/repo', (f) => files[f], list);
  assert.deepEqual(
    orphans.map((o) => o.file),
    ['fsi-app/scripts/foo/bar.mjs'],
  );
  assert.deepEqual(orphans[0].testOnlyImporters, ['fsi-app/scripts/foo/bar.test.mjs']);
});

test('findOrphanModules: a module with a real (non-test) importer is NOT an orphan', () => {
  const files = {
    'fsi-app/scripts/foo/bar.mjs': 'export const f = 1;',
    'fsi-app/scripts/foo/caller.mjs': IMPORT_OF('./bar.mjs'),
  };
  const list = listOnly({
    ...NO_WORKFLOWS,
    'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}': [],
    'fsi-app/scripts/**/*.{mjs,js}': Object.keys(files),
    'fsi-app/.discipline/**/*.mjs': [],
  });
  const orphans = findOrphanModules('/repo', (f) => files[f], list);
  assert.deepEqual(orphans, []);
});

test('findOrphanModules: a module with ZERO importers is NOT reported (Appendix A requires >=1 test-only importer; zero-importer is a different B1 class)', () => {
  const files = { 'fsi-app/scripts/foo/dangling.mjs': 'export const f = 1;' };
  const list = listOnly({
    ...NO_WORKFLOWS,
    'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}': [],
    'fsi-app/scripts/**/*.{mjs,js}': Object.keys(files),
    'fsi-app/.discipline/**/*.mjs': [],
  });
  const orphans = findOrphanModules('/repo', (f) => files[f], list);
  assert.deepEqual(orphans, []);
});

test('findOrphanModules: a module reachable only by a workflow dispatch line is NOT an orphan, even with a test-only importer', () => {
  const files = {
    'fsi-app/scripts/turns/run-x.mjs': 'export const f = 1;',
    'fsi-app/scripts/turns/run-x.test.mjs': IMPORT_OF('./run-x.mjs'),
    '.github/workflows/x.yml': 'jobs:\n  x:\n    steps:\n      - run: node scripts/turns/run-x.mjs\n',
  };
  const list = listOnly({
    '.github/workflows/*.yml': ['.github/workflows/x.yml'],
    'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}': [],
    'fsi-app/scripts/**/*.{mjs,js}': ['fsi-app/scripts/turns/run-x.mjs', 'fsi-app/scripts/turns/run-x.test.mjs'],
    'fsi-app/.discipline/**/*.mjs': [],
  });
  const orphans = findOrphanModules('/repo', (f) => files[f], list);
  assert.deepEqual(orphans, []);
});

test('findOrphanModules: the widened scope reaches scripts/** beyond scripts/lib/ and .discipline/**', () => {
  const files = {
    'fsi-app/scripts/mint/held-classes.mjs': 'export const f = 1;',
    'fsi-app/scripts/mint/held-classes.test.mjs': IMPORT_OF('./held-classes.mjs'),
    'fsi-app/.discipline/governance/skill-contract-map.mjs': 'export const g = 1;',
    'fsi-app/.discipline/skill-drift-gate.test.mjs': IMPORT_OF('./governance/skill-contract-map.mjs'),
  };
  const list = listOnly({
    ...NO_WORKFLOWS,
    'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}': [],
    'fsi-app/scripts/**/*.{mjs,js}': ['fsi-app/scripts/mint/held-classes.mjs', 'fsi-app/scripts/mint/held-classes.test.mjs'],
    'fsi-app/.discipline/**/*.mjs': ['fsi-app/.discipline/governance/skill-contract-map.mjs', 'fsi-app/.discipline/skill-drift-gate.test.mjs'],
  });
  const orphans = findOrphanModules('/repo', (f) => files[f], list);
  const orphanFiles = orphans.map((o) => o.file);
  assert.ok(orphanFiles.includes('fsi-app/scripts/mint/held-classes.mjs'), 'scripts/mint/ (not scripts/lib/) reached');
  assert.ok(orphanFiles.includes('fsi-app/.discipline/governance/skill-contract-map.mjs'), '.discipline/governance/ reached');
});

// ── dead exports (Appendix B method) ────────────────────────────────────────

test('findDeadExports: an export used only inside its own file is dead, on a wired module', () => {
  const files = {
    'fsi-app/scripts/foo/mod.mjs': 'export const LIVE = 1;\nexport const DEAD = 2;\nconsole.log(LIVE);',
    'fsi-app/scripts/foo/caller.mjs': IMPORT_OF('./mod.mjs') + '\nconsole.log(LIVE);',
  };
  const list = listOnly({
    ...NO_WORKFLOWS,
    'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}': [],
    'fsi-app/scripts/**/*.{mjs,js}': Object.keys(files),
    'fsi-app/.discipline/**/*.mjs': [],
    'fsi-app/**/*.{ts,tsx,mjs,cjs,js,jsx}': Object.keys(files),
  });
  const dead = findDeadExports('/repo', (f) => files[f], list);
  assert.deepEqual(dead, [{ file: 'fsi-app/scripts/foo/mod.mjs', deadExports: ['DEAD'], totalExports: 2 }]);
});

test('findDeadExports: an export used elsewhere (even outside the widened scope) is NOT dead', () => {
  const files = {
    'fsi-app/scripts/foo/mod.mjs': 'export const USED_LATER = 1;',
    'fsi-app/scripts/foo/caller.mjs': IMPORT_OF('./mod.mjs'),
    'fsi-app/src/app/somewhere/route.ts': 'const x = USED_LATER;', // occurrence outside SCOPE but inside the whole-repo occurrence universe
  };
  const list = listOnly({
    ...NO_WORKFLOWS,
    'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}': ['fsi-app/src/app/somewhere/route.ts'],
    'fsi-app/scripts/**/*.{mjs,js}': ['fsi-app/scripts/foo/mod.mjs', 'fsi-app/scripts/foo/caller.mjs'],
    'fsi-app/.discipline/**/*.mjs': [],
    'fsi-app/**/*.{ts,tsx,mjs,cjs,js,jsx}': Object.keys(files),
  });
  const dead = findDeadExports('/repo', (f) => files[f], list);
  assert.deepEqual(dead, []);
});

test('findDeadExports: a module with NO real importer or dispatch root is not "wired" — not scanned at all', () => {
  const files = {
    'fsi-app/scripts/foo/dangling.mjs': 'export const NEVER_USED = 1;',
    'fsi-app/scripts/foo/dangling.test.mjs': IMPORT_OF('./dangling.mjs'),
  };
  const list = listOnly({
    ...NO_WORKFLOWS,
    'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}': [],
    'fsi-app/scripts/**/*.{mjs,js}': Object.keys(files),
    'fsi-app/.discipline/**/*.mjs': [],
    'fsi-app/**/*.{ts,tsx,mjs,cjs,js,jsx}': Object.keys(files),
  });
  const dead = findDeadExports('/repo', (f) => files[f], list);
  // dangling.mjs is UNWIRED (Appendix A's own class, not B's) — Appendix B only covers WIRED modules.
  assert.deepEqual(dead, []);
});

test('findDeadExports: a dispatch-root module (no real importer, but CI-dispatched) is still scanned', () => {
  const files = {
    'fsi-app/scripts/turns/run-x.mjs': 'export const LIVE = 1;\nexport const DEAD = 2;',
    'fsi-app/scripts/turns/consumer.mjs': 'console.log(LIVE);', // occurrence OUTSIDE run-x.mjs's own file
    '.github/workflows/x.yml': 'jobs:\n  x:\n    steps:\n      - run: node scripts/turns/run-x.mjs\n',
  };
  const list = listOnly({
    '.github/workflows/*.yml': ['.github/workflows/x.yml'],
    'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}': [],
    'fsi-app/scripts/**/*.{mjs,js}': ['fsi-app/scripts/turns/run-x.mjs', 'fsi-app/scripts/turns/consumer.mjs'],
    'fsi-app/.discipline/**/*.mjs': [],
    'fsi-app/**/*.{ts,tsx,mjs,cjs,js,jsx}': Object.keys(files).filter((f) => f !== '.github/workflows/x.yml'),
  });
  const dead = findDeadExports('/repo', (f) => files[f], list);
  assert.deepEqual(dead, [{ file: 'fsi-app/scripts/turns/run-x.mjs', deadExports: ['DEAD'], totalExports: 2 }]);
});

test('findDeadExports: exported function/class forms are extracted too, not only const', () => {
  const files = {
    'fsi-app/scripts/foo/mod.mjs':
      'export function liveFn() {}\nexport class DeadClass {}\nexport const also = 1;\nliveFn(); also;',
    'fsi-app/scripts/foo/caller.mjs': IMPORT_OF('./mod.mjs') + '\nliveFn(); also;',
  };
  const list = listOnly({
    ...NO_WORKFLOWS,
    'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}': [],
    'fsi-app/scripts/**/*.{mjs,js}': Object.keys(files),
    'fsi-app/.discipline/**/*.mjs': [],
    'fsi-app/**/*.{ts,tsx,mjs,cjs,js,jsx}': Object.keys(files),
  });
  const dead = findDeadExports('/repo', (f) => files[f], list);
  assert.deepEqual(dead, [{ file: 'fsi-app/scripts/foo/mod.mjs', deadExports: ['DeadClass'], totalExports: 3 }]);
});

// ── measured against the shipped tree (a light integration check, not a red gate) ──

test('running the real scan against this repo does not throw and returns arrays', () => {
  const orphans = findOrphanModules();
  const dead = findDeadExports();
  assert.ok(Array.isArray(orphans));
  assert.ok(Array.isArray(dead));
  // Every file this scan names must be a real, existing repo-relative path — never a fixture leak.
  for (const o of orphans) assert.match(o.file, /^fsi-app\/(?:src|scripts|\.discipline)\//);
  for (const d of dead) assert.match(d.file, /^fsi-app\/(?:src|scripts|\.discipline)\//);
});
