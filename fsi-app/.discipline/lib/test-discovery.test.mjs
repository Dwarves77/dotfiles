// Attack tests (rule 15) for test-discovery.mjs's pure core, `discoverFromLsFilesOutput()`. Feeds
// constructed `git ls-files -z` output (never the real repo) so the assertions are deterministic and
// prove the DISCOVERY MECHANISM, not today's tree. See that module's header for the scope this proves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverFromLsFilesOutput, NAMED_SOURCES_SELFTESTS } from './test-discovery.mjs';

function nulJoin(paths) {
  return paths.join('\0') + '\0';
}

test('a test file in a never-before-seen directory IS discovered (the class this lane exists to fix)', () => {
  const raw = nulJoin([
    'fsi-app/src/app/api/admin/statutory-rows/logic.test.mjs', // lane M7a's exact orphan case
    'fsi-app/scripts/producers/producer-status.test.mjs',      // lane M9d's exact orphan case
  ]);
  const discovered = discoverFromLsFilesOutput(raw);
  assert.ok(
    discovered.includes('fsi-app/src/app/api/admin/statutory-rows/logic.test.mjs'),
    'a never-before-seen directory must not need a new glob line to be discovered',
  );
  assert.ok(discovered.includes('fsi-app/scripts/producers/producer-status.test.mjs'));
});

test('a *.npmtest.mjs is NOT discovered (different suffix, by construction)', () => {
  const raw = nulJoin([
    'fsi-app/scripts/lib/pg-conn.npmtest.mjs',
    'fsi-app/scripts/lib/pg-conn.test.mjs',
  ]);
  const discovered = discoverFromLsFilesOutput(raw);
  assert.ok(!discovered.includes('fsi-app/scripts/lib/pg-conn.npmtest.mjs'), 'npmtest suffix must be excluded');
  assert.ok(discovered.includes('fsi-app/scripts/lib/pg-conn.test.mjs'));
});

test('the named src/lib/sources selftest pair ARE discovered by name', () => {
  const raw = nulJoin([...NAMED_SOURCES_SELFTESTS]);
  const discovered = discoverFromLsFilesOutput(raw);
  for (const p of NAMED_SOURCES_SELFTESTS) assert.ok(discovered.includes(p), `expected named pair member: ${p}`);
});

test('src/lib/sources selftests OUTSIDE the named pair are NOT discovered (they need jiti; fitness-sentinel-wired instead)', () => {
  const raw = nulJoin([
    ...NAMED_SOURCES_SELFTESTS,
    'fsi-app/src/lib/sources/institution.selftest.mjs',
    'fsi-app/src/lib/sources/source-growth.selftest.mjs',
  ]);
  const discovered = discoverFromLsFilesOutput(raw);
  assert.ok(!discovered.includes('fsi-app/src/lib/sources/institution.selftest.mjs'));
  assert.ok(!discovered.includes('fsi-app/src/lib/sources/source-growth.selftest.mjs'));
});

test('scripts/lib and src/lib/d3 selftests ARE discovered by directory, any filename', () => {
  const raw = nulJoin([
    'fsi-app/scripts/lib/brand-new-not-yet-named.selftest.mjs',
    'fsi-app/src/lib/d3/another-new-one.selftest.mjs',
  ]);
  const discovered = discoverFromLsFilesOutput(raw);
  assert.ok(discovered.includes('fsi-app/scripts/lib/brand-new-not-yet-named.selftest.mjs'));
  assert.ok(discovered.includes('fsi-app/src/lib/d3/another-new-one.selftest.mjs'));
});

test('a selftest OUTSIDE the two covered selftest directories is NOT discovered', () => {
  const raw = nulJoin(['fsi-app/src/lib/trust.selftest.mjs']); // real file: fitness-sentinel-wired (F11), not this suite
  const discovered = discoverFromLsFilesOutput(raw);
  assert.ok(!discovered.includes('fsi-app/src/lib/trust.selftest.mjs'));
});

test('a fixture where discovery is replaced by the OLD fixed glob list shows the new-directory file MISSING (proves the old mechanism had the defect this lane fixes)', () => {
  // Mirrors run-test-suite.sh's pre-2026-09-20 hand-kept directory globs: only these directories were
  // ever swept. A file in a directory not on this fixed list is invisible to it.
  const OLD_FIXED_TEST_DIRS = [
    'fsi-app/.discipline/',
    'fsi-app/scripts/lib/',
    'fsi-app/src/lib/agent/',
  ];
  function oldFixedDiscovery(paths) {
    return paths.filter((p) => p.endsWith('.test.mjs') && OLD_FIXED_TEST_DIRS.some((d) => p.startsWith(d) && p.slice(d.length).indexOf('/') === -1));
  }
  const tracked = [
    'fsi-app/src/app/api/admin/statutory-rows/logic.test.mjs', // never-before-seen directory
    'fsi-app/src/lib/agent/floor-attribution.test.mjs',        // an already-covered directory, for contrast
  ];
  const oldResult = oldFixedDiscovery(tracked);
  assert.ok(
    !oldResult.includes('fsi-app/src/app/api/admin/statutory-rows/logic.test.mjs'),
    'the OLD fixed-list mechanism must NOT see the new-directory file (this is the defect being fixed)',
  );
  assert.ok(oldResult.includes('fsi-app/src/lib/agent/floor-attribution.test.mjs'), 'sanity: the old mechanism did see already-covered directories');

  // The NEW mechanism sees both, by construction.
  const newResult = discoverFromLsFilesOutput(nulJoin(tracked));
  assert.ok(newResult.includes('fsi-app/src/app/api/admin/statutory-rows/logic.test.mjs'));
  assert.ok(newResult.includes('fsi-app/src/lib/agent/floor-attribution.test.mjs'));
});

test('the discovered list is sorted and de-duplicated', () => {
  const raw = nulJoin([
    'fsi-app/z/z.test.mjs',
    'fsi-app/a/a.test.mjs',
    'fsi-app/a/a.test.mjs', // duplicate entry in input
  ]);
  const discovered = discoverFromLsFilesOutput(raw);
  assert.deepEqual(discovered, ['fsi-app/a/a.test.mjs', 'fsi-app/z/z.test.mjs']);
});

test('empty input discovers nothing (the caller, not this pure function, decides that is a standing red)', () => {
  assert.deepEqual(discoverFromLsFilesOutput(''), []);
});
