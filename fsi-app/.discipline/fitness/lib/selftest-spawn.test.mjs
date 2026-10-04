// Tests for selftest-spawn.mjs (lane GATES-1, 2026-10-04). node:test, no npm deps, every dependency injected.
// Run: node --test fsi-app/.discipline/fitness/lib/selftest-spawn.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSelftest, missingDepReason, SELFTEST_DEP } from './selftest-spawn.mjs';

const SPEC = {
  id: 'FX',
  sentinel: 'fsi-app/src/lib/x.selftest.mjs',
  missingMessage: 'selftest missing',
  failMessage: (status) => `math FAILED (exit ${status}).`,
  remediation: 'Remediation: fix the math.',
};

function deps(over = {}) {
  const logged = [];
  const spawned = [];
  return {
    logged,
    spawned,
    deps: {
      repoRoot: '/repo',
      exists: () => true,
      resolveDep: () => '/repo/fsi-app/node_modules/jiti/lib/jiti.cjs',
      spawn: (cmd, args) => {
        spawned.push([cmd, ...args]);
        return { status: 0, stdout: '', stderr: '' };
      },
      log: (m) => logged.push(m),
      ...over,
    },
  };
}

test('dependency absent: SKIP with the reason, no violation, the selftest is never spawned', () => {
  const d = deps({ resolveDep: () => null });
  const out = checkSelftest(SPEC, d.deps);
  assert.deepEqual(out, []);
  assert.equal(d.spawned.length, 0);
  assert.equal(d.logged.length, 1);
  assert.match(d.logged[0], /\[FX\] SKIP: "jiti" does not resolve from fsi-app\//);
});

test('ATTACK: dependency present and the selftest exits non-zero still yields a violation', () => {
  const d = deps({
    spawn: () => ({ status: 1, stdout: 'assertion line\n', stderr: 'AssertionError: T1 weight\n' }),
  });
  const out = checkSelftest(SPEC, d.deps);
  assert.equal(out.length, 1);
  assert.match(out[0].message, /math FAILED \(exit 1\)\./);
  assert.match(out[0].message, /AssertionError: T1 weight/);
  assert.match(out[0].message, /Remediation: fix the math\./);
  assert.equal(d.logged.length, 0, 'a real failure is a violation, not a skip line');
});

test('ATTACK: a spawn that dies on a signal (status null) is a violation, not a skip', () => {
  const d = deps({ spawn: () => ({ status: null, stdout: '', stderr: 'killed' }) });
  const out = checkSelftest(SPEC, d.deps);
  assert.equal(out.length, 1);
  assert.match(out[0].message, /exit null/);
});

test('dependency present and the selftest exits 0: PASS, spawned once with node and the absolute path', () => {
  const d = deps();
  assert.deepEqual(checkSelftest(SPEC, d.deps), []);
  assert.equal(d.spawned.length, 1);
  assert.equal(d.spawned[0][0], 'node');
  assert.match(d.spawned[0][1].split(String.fromCharCode(92)).join('/'), /\/repo\/fsi-app\/src\/lib\/x\.selftest\.mjs$/);
});

test('ATTACK: a missing selftest file is a violation even when the dependency is also absent (never a skip)', () => {
  const d = deps({ exists: () => false, resolveDep: () => null });
  const out = checkSelftest(SPEC, d.deps);
  assert.equal(out.length, 1);
  assert.equal(out[0].message, 'selftest missing');
  assert.equal(d.logged.length, 0);
});

test('missingDepReason: null when resolvable, a reason naming the package when not; default dep is jiti', () => {
  assert.equal(missingDepReason('jiti', () => '/x'), null);
  assert.match(missingDepReason('jiti', () => null), /"jiti"/);
  assert.equal(SELFTEST_DEP, 'jiti');
});
