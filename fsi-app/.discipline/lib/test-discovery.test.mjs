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

// ── lane GATE-9 (2026-10-08): the unrun-test-file check and the explicit-test runner's exit status ─────────────
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_FILE_RE, findUnrunTestFiles, checkUnrun, NOT_A_TEST_ALLOWLIST } from './test-discovery.mjs';
import { discoverTests } from './test-discovery.mjs';

const HERE_LIB = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE_LIB, '..', '..', '..');
const SUITE_RUNS = (tracked) => {
  // discoverTests scopes git ls-files to these two roots; mirror that so the fixture is faithful
  const inRoots = tracked.filter((p) => p.startsWith('fsi-app/') || p.startsWith('.claude/hooks/'));
  const run = new Set(discoverFromLsFilesOutput(nulJoin(inRoots)));
  return (p) => run.has(p) || /^fsi-app\/.*\.npmtest\.mjs$/.test(p);
};

test('TD-1, TD-3: a failing .test.ts and a .spec.mjs inside fsi-app are tracked, run by nothing, and reported', () => {
  const tracked = ['fsi-app/at5-a.test.ts', 'fsi-app/src/lib/at5-c.spec.mjs', 'fsi-app/src/lib/ok.test.mjs'];
  const { unrun } = findUnrunTestFiles(tracked, { isRun: SUITE_RUNS(tracked) });
  assert.deepEqual(unrun, ['fsi-app/at5-a.test.ts', 'fsi-app/src/lib/at5-c.spec.mjs']);
});

test('TD-2, TD-4: a test at the repo-root scripts/ and a .test.mjs or .test.cjs under docs/ or fsi-app are reported', () => {
  const tracked = ['scripts/at5-b.test.mjs', 'docs/at5-e.test.mjs', 'fsi-app/src/lib/at5-g.test.cjs'];
  const { unrun } = findUnrunTestFiles(tracked, { isRun: SUITE_RUNS(tracked) });
  assert.deepEqual(unrun.sort(), [...tracked].sort());
});

test('FC-3: an npmtest at the repo root and a .npmtest.ts inside fsi-app are reported (the glob is *.npmtest.mjs under fsi-app only)', () => {
  const tracked = ['scripts/at5-r.npmtest.mjs', 'fsi-app/src/lib/at5-s.npmtest.ts', 'fsi-app/src/lib/fine.npmtest.mjs'];
  const { unrun } = findUnrunTestFiles(tracked, { isRun: SUITE_RUNS(tracked) });
  assert.deepEqual(unrun, ['fsi-app/src/lib/at5-s.npmtest.ts', 'scripts/at5-r.npmtest.mjs']);
});

test('FC-5: goldens in unlisted spellings are test-shaped; the ones the golden runner does not run are reported', () => {
  const spellings = ['fsi-app/scripts/verify/lib/sub.golden.mjs', 'fsi-app/scripts/verify/x.golden.cjs', 'fsi-app/scripts/verify/y.goldens.mjs', 'fsi-app/scripts/verify/golden-z.mjs', 'fsi-app/scripts/other/outside.golden.mjs'];
  for (const p of spellings) assert.ok(TEST_FILE_RE.test(p), p);
  const isGoldenRunner = (p) => p.startsWith('fsi-app/scripts/verify/');
  const { unrun } = findUnrunTestFiles(spellings, { isRun: isGoldenRunner });
  assert.deepEqual(unrun, ['fsi-app/scripts/other/outside.golden.mjs']);
});

test('the allowlist excuses a named file only with a reason, and a stale or unreasoned entry is itself reported', () => {
  const tracked = ['docs/fixture.test.mjs', 'fsi-app/a.test.mjs'];
  const isRun = (p) => p === 'fsi-app/a.test.mjs';
  assert.deepEqual(findUnrunTestFiles(tracked, { isRun, notATest: { 'docs/fixture.test.mjs': 'a recorded fixture, never executed by design' } }), { unrun: [], badAllowlist: [] });
  assert.equal(findUnrunTestFiles(tracked, { isRun, notATest: { 'docs/fixture.test.mjs': 'x' } }).badAllowlist.length, 1);
  assert.equal(findUnrunTestFiles(tracked, { isRun, notATest: { 'gone.test.mjs': 'a long enough reason here' } }).badAllowlist.length, 1);
  assert.equal(findUnrunTestFiles(tracked, { isRun, notATest: { 'fsi-app/a.test.mjs': 'a long enough reason here' } }).badAllowlist.length, 1, 'already run: stale');
  assert.deepEqual(NOT_A_TEST_ALLOWLIST, {}, 'the committed allowlist is empty: every tracked test-shaped file is run');
});

test('checkUnrun exit status: 1 when a test is unrun, 0 when all run (the status, not only the message)', () => {
  const err = []; const out = [];
  assert.equal(checkUnrun({ tracked: ['scripts/x.test.mjs'], isRun: () => false, out: (m) => out.push(m), err: (m) => err.push(m) }), 1);
  assert.match(err[0], /scripts\/x\.test\.mjs looks like a test or golden and NO runner executes it/);
  assert.equal(checkUnrun({ tracked: ['scripts/x.test.mjs'], isRun: () => true, out: (m) => out.push(m), err: () => {} }), 0);
});

test('the real CLI --check-unrun exits 0 on the committed tree (every tracked test-shaped file is run)', () => {
  const r = spawnSync(process.execPath, [join(HERE_LIB, 'test-discovery.mjs'), '--check-unrun'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /every tracked test-shaped file is executed by a runner/);
});

test('the discovered suite is a subset of what the check calls run (no file is discovered yet reported unrun)', () => {
  const discovered = discoverTests({ repoRoot: REPO_ROOT });
  assert.ok(discovered.length > 100);
  for (const p of discovered) assert.ok(TEST_FILE_RE.test(p) || p.endsWith('.selftest.mjs'), p);
});

// ── run-explicit-tests.mjs: the runner every suite goes through. It had no sibling test (AUD-AT-5 TD-6). ───────
const RUNNER = join(HERE_LIB, 'run-explicit-tests.mjs');
// node:test marks its child processes with NODE_TEST_CONTEXT; a nested run() under that marker reports in the parent's
// serialized form instead of running, so the runner under test gets an environment without it.
const cleanEnv = () => { const e = { ...process.env }; delete e.NODE_TEST_CONTEXT; return e; };

function runnerOn(files, stdin) {
  const dir = mkdtempSync(join(tmpdir(), 'run-explicit-'));
  try {
    const paths = Object.entries(files).map(([name, body]) => { const p = join(dir, name); writeFileSync(p, body); return p; });
    return spawnSync(process.execPath, [RUNNER], { input: stdin ?? nulJoin(paths), encoding: 'utf8', env: cleanEnv() });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const PASSING = "import { test } from 'node:test';\ntest('ok', () => {});\n";
const FAILING = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('red', () => { assert.equal(1, 2); });\n";

test('TD-6: the runner exits 0 when every test passes and 1 when one fails', () => {
  assert.equal(runnerOn({ 'a.test.mjs': PASSING }).status, 0);
  assert.equal(runnerOn({ 'a.test.mjs': PASSING, 'b.test.mjs': FAILING }).status, 1);
});

test('TD-6: a failing test cannot mask itself by resetting process.exitCode to 0 (failures are counted from the report, not the child exit code)', () => {
  const masked = "process.on('exit', () => { process.exitCode = 0; });\n" + FAILING;
  const r = runnerOn({ 'mask.test.mjs': masked });
  assert.equal(r.status, 1, r.stdout);
});

test('TD-6: a file that fails to load (syntax error) fails the run', () => {
  assert.equal(runnerOn({ 'syntax.test.mjs': 'this is not javascript\n' }).status, 1);
});

test('TD-6: an empty file list is a loud failure, never a silent success', () => {
  const r = spawnSync(process.execPath, [RUNNER], { input: '', encoding: 'utf8', env: cleanEnv() });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ZERO file paths/);
});
