// Tests for F9. Run: node --test fsi-app/.discipline/fitness/functions/F9-build-compiles.test.mjs
//
// Note: F9's real check invokes tsc against the whole project, which takes ~10-15s
// and depends on the live tsconfig + source. Unit tests here cover:
//   - Metadata fields
//   - Sentinel behavior (only triggers check on tsconfig.json sentinel)
//   - Result-shape expectations
//
// Integration verification (does tsc actually pass) is intentionally NOT a unit test;
// it's the operator running `node fsi-app/.discipline/fitness/runner.mjs --function=F9`
// or CI running the same. Unit-testing the integration would re-invoke tsc per test
// and slow the suite by minutes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction, _findTsc } from './F9-build-compiles.mjs';

const SENTINEL = 'fsi-app/tsconfig.json';

test('F9: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F9');
  assert.equal(typeof fitnessFunction.name, 'string');
  assert.ok(fitnessFunction.description.length > 0);
  assert.ok(fitnessFunction.source.includes('OBS-64'));
});

test('F9: enumerate returns single sentinel path', () => {
  const files = fitnessFunction.enumerate();
  assert.equal(files.length, 1);
  assert.equal(files[0], 'fsi-app/tsconfig.json');
});

test('F9: check on non-sentinel filepath returns empty (PASS)', () => {
  const v = fitnessFunction.check('fsi-app/src/lib/foo.ts', 'some content');
  assert.deepEqual(v, []);
});

test('F9: _findTsc returns a path or null', () => {
  // typescript's own bin/tsc entry script as Node resolves it from fsi-app/, or null (RD-85).
  const tsc = _findTsc();
  if (tsc !== null) {
    assert.ok(typeof tsc === 'string');
    assert.match(tsc.replaceAll('\\', '/'), /\/typescript\/bin\/tsc$/);
  }
});

// Optional integration smoke (slow; only run if explicitly invoked via the runner).
// This test is here for documentation purposes; the actual gate is the runner
// running F9 against the codebase.

// Lane GATES-1 (2026-10-04): tsc not resolving is a SKIP (environment fact), a tsc that runs and fails is
// still a violation (the attack case), and tsc passing is a PASS. Typecheck is injected, no real compile.
test('F9: tsc not resolvable is a SKIP line and no violation', () => {
  const logged = [];
  const v = fitnessFunction.check(SENTINEL, '', {
    typecheck: () => ({ ok: false, output: 'typescript does not resolve from fsi-app/.', errCode: 'TSC_NOT_FOUND' }),
    log: (m) => logged.push(m),
  });
  assert.deepEqual(v, []);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /\[F9\] SKIP: typescript does not resolve/);
});

test('F9 ATTACK: a tsc that runs and reports type errors is still a violation', () => {
  const v = fitnessFunction.check(SENTINEL, '', {
    typecheck: () => ({ ok: false, output: 'src/a.ts(1,1): error TS2322: bad type', errCode: 2 }),
    log: () => assert.fail('a real type error must not log a skip'),
  });
  assert.equal(v.length, 1);
  assert.match(v[0].message, /TypeScript compilation failed \(tsc --noEmit exit code 2\)/);
  assert.match(v[0].message, /error TS2322/);
});

test('F9: tsc passing is a PASS', () => {
  assert.deepEqual(fitnessFunction.check(SENTINEL, '', { typecheck: () => ({ ok: true, output: '' }) }), []);
});

// ---- lane GATE-8 (2026-10-08): the honest forms the AUD-AT-4 register found ACCEPTED, red then green ----
import { staticTypecheckViolations, ALLOWED_TSCONFIG_EXCLUDES } from './F9-build-compiles.mjs';

const GOOD_TSCONFIG = JSON.stringify({
  compilerOptions: { strict: true },
  include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
  exclude: ['node_modules', 'supabase/functions', 'src/_archive'],
});

test('F9 B8-02: a type-broken file excluded in tsconfig.json is a violation naming the entry', () => {
  const cfg = JSON.stringify({ include: ['**/*.ts', '**/*.tsx'], exclude: ['node_modules', 'src/lib/broken.ts'] });
  const v = staticTypecheckViolations({ tsconfigText: cfg, srcFiles: [] });
  assert.equal(v.length, 1);
  assert.match(v[0], /excludes "src\/lib\/broken\.ts"/);
  assert.deepEqual(staticTypecheckViolations({ tsconfigText: GOOD_TSCONFIG, srcFiles: [] }), []);
  assert.ok(ALLOWED_TSCONFIG_EXCLUDES.includes('src/_archive'));
});

test('F9 B8-02: an include list that no longer covers .ts and .tsx is a violation', () => {
  const cfg = JSON.stringify({ include: ['src/lib/**/*.ts'], exclude: ['node_modules'] });
  const v = staticTypecheckViolations({ tsconfigText: cfg, srcFiles: [] });
  assert.equal(v.length, 2);
});

test('F9 B8-03: a @ts-nocheck directive in a src file is a violation; the word in a string or a non-comment is not', () => {
  const nocheck = { path: 'fsi-app/src/lib/x.ts', content: '// @ts-nocheck\nexport const a: number = "x";\n' };
  const v = staticTypecheckViolations({ tsconfigText: GOOD_TSCONFIG, srcFiles: [nocheck] });
  assert.equal(v.length, 1);
  assert.match(v[0], /fsi-app\/src\/lib\/x\.ts carries a @ts-nocheck/);
  const block = { path: 'fsi-app/src/lib/y.ts', content: '/* @ts-nocheck */\nexport const b = 1;\n' };
  assert.equal(staticTypecheckViolations({ tsconfigText: GOOD_TSCONFIG, srcFiles: [block] }).length, 1);
  const str = { path: 'fsi-app/src/lib/z.ts', content: 'export const note = "uses @ts-nocheck somewhere";\n' };
  assert.deepEqual(staticTypecheckViolations({ tsconfigText: GOOD_TSCONFIG, srcFiles: [str] }), []);
});

test('F9: the static guards are reported whether tsc resolves, passes, or fails', () => {
  const guard = () => ['fsi-app/src/lib/x.ts carries a @ts-nocheck directive, which turns the type check off for the whole file. Fix the types.'];
  const skip = fitnessFunction.check(SENTINEL, '', { typecheck: () => ({ ok: false, output: 'x', errCode: 'TSC_NOT_FOUND' }), log: () => {}, staticViolations: guard });
  assert.equal(skip.length, 1);
  const pass = fitnessFunction.check(SENTINEL, '', { typecheck: () => ({ ok: true, output: '' }), staticViolations: guard });
  assert.equal(pass.length, 1);
  const fail = fitnessFunction.check(SENTINEL, '', { typecheck: () => ({ ok: false, output: 'src/a.ts(1,1): error TS2322: bad', errCode: 2 }), staticViolations: guard });
  assert.equal(fail.length, 2);
});

test('F9: the live tsconfig.json and src tree carry neither a stray exclude nor a @ts-nocheck', () => {
  assert.deepEqual(fitnessFunction.check(SENTINEL, '', { typecheck: () => ({ ok: true, output: '' }) }), []);
});
